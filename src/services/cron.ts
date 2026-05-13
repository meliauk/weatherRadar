import { get24HourForecast, checkWeatherType, HourlyForecast } from './weather';
import { Repository, ReminderRule, Config } from '../db/repository';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const NTFY_URL = process.env.NTFY_URL || 'https://ntfy.sh';
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'wyf-weather-notity';

interface MatchedRule {
  rule: ReminderRule;
  hour: number;
  forecast: HourlyForecast;
}

export async function analyzeWeatherAndSchedule(): Promise<void> {
  console.log('[' + new Date().toISOString() + '] 开始分析天气并生成提醒任务...');

  const today = new Date();
  const dayOfWeek = today.getDay() || 7;
  const dateStr = today.toISOString().split('T')[0];

  const configs = await Repository.getActiveConfigs();
  console.log(`找到 ${configs.length} 个活跃配置`);

  for (const config of configs) {
    try {
      // 检查是否在提醒周期内
      const reminderDays = config.reminder_days.split(',').map(d => parseInt(d));
      if (!reminderDays.includes(dayOfWeek)) {
        console.log(`[${config.city_name}] 今天不在提醒周期内，跳过`);
        continue;
      }

      console.log(`[${config.city_name}] 开始获取24小时预报...`);
      
      // 获取24小时预报
      const forecasts = await get24HourForecast(config.city_name);

      console.log(`[${config.city_name}] 获取24小时预报成功: `, forecasts);
      console.log("=======================================")
      
      // 保存小时级天气数据（5-23点）
      for (const forecast of forecasts) {
        if (forecast.hour >= 5 && forecast.hour <= 23) {
          await Repository.saveHourlyWeather({
            config_id: config.id!,
            city_name: config.city_name,
            forecast_date: dateStr,
            hour: forecast.hour,
            weather_text: forecast.weatherText,
            weather_code: forecast.weatherCode,
            temperature: forecast.temperature,
            has_precipitation: forecast.hasPrecipitation ? 1 : 0
          });
        }
      }

      // 获取该配置的提醒规则
      const rules = await Repository.getRulesByConfigId(config.id!);
      if (rules.length === 0) {
        console.log(`[${config.city_name}] 没有配置提醒规则，跳过`);
        continue;
      }

      // 分析每个小时的天气，匹配规则
      const matchedRules: MatchedRule[] = [];
      
      for (const forecast of forecasts) {
        // 只分析5-23点
        if (forecast.hour < 5 || forecast.hour > 23) continue;

        for (const rule of rules) {
          // 检查时间段匹配
          if (!isHourInRange(forecast.hour, rule.start_hour, rule.end_hour)) {
            continue;
          }

          // 检查天气类型匹配
          // console.log(`[${config.city_name}][调试] hour=${forecast.hour}, weatherCode="${forecast.weatherCode}"(类型:${typeof forecast.weatherCode}), weatherText="${forecast.weatherText}", 规则类型=${rule.weather_type}`);
          const isMatch = checkWeatherType(forecast.weatherCode, rule.weather_type, forecast.temperature);
          // console.log(`[${config.city_name}][调试] checkWeatherType 结果: ${isMatch}`);
          if (isMatch) {
            matchedRules.push({
              rule,
              hour: forecast.hour,
              forecast
            });
            console.log(`[${config.city_name}] 匹配规则: ${rule.weather_type} 在 ${forecast.hour}:00`);
          }
        }
      }

      // 创建提醒任务
      for (const matched of matchedRules) {
        // 计算计划发送时间
        const scheduledTime = calculateScheduledTime(matched.hour, config.advance_minutes);
        const scheduledTimeStr = formatLocalDateTime(scheduledTime);

        // 生成唯一的去重 Tag（基于配置ID+目标小时+日期）
        const dateStr = new Date().toISOString().split('T')[0];
        const uniqueTag = `weather-${config.id}-${matched.hour}-${dateStr}`;

        // 发送消息到 ntfy（使用 Tag 去重，ntfy 会自动丢弃相同 Tag 的重复消息）
        const message = formatNtfyMessage(config, matched, scheduledTime);
        const ntfyId = await sendToNtfy(message, scheduledTime, uniqueTag);

        // 异步创建任务记录（不阻塞主流程，仅作为审计日志）
        Repository.createTask({
          config_id: config.id!,
          rule_id: matched.rule.id!,
          city_name: config.city_name,
          weather_text: matched.forecast.weatherText,
          weather_code: matched.forecast.weatherCode,
          target_hour: matched.hour,
          scheduled_time: scheduledTimeStr,
          ntfy_message_id: ntfyId,
          is_sent: 0
        }).catch(err => console.error('创建任务记录失败:', err));

        console.log(`[${config.city_name}] 创建任务成功: 目标时间=${matched.hour}:00, 发送时间=${scheduledTimeStr}, Tag=${uniqueTag}`);
      }

    } catch (error) {
      console.error(`处理 ${config.city_name} 时出错:`, error);
    }
  }

  console.log('[' + new Date().toISOString() + '] 天气分析完成');
}

function isHourInRange(hour: number, startHour?: number, endHour?: number): boolean {
  // 如果没有指定时间段，表示全天
  if (startHour === null || startHour === undefined) return true;
  if (endHour === null || endHour === undefined) return true;
  
  return hour >= startHour && hour <= endHour;
}

function calculateScheduledTime(targetHour: number, advanceMinutes: number): Date {
  const now = new Date();
  const scheduled = new Date();
  scheduled.setHours(targetHour, 0, 0, 0);
  scheduled.setMinutes(scheduled.getMinutes() - advanceMinutes);
  
  // 如果计算出的时间已经过了，设置为明天
  if (scheduled < now) {
    scheduled.setDate(scheduled.getDate() + 1);
  }
  
  return scheduled;
}

function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatNtfyMessage(config: Config, matched: MatchedRule, scheduledTime: Date): string {
  const targetTime = `${matched.hour.toString().padStart(2, '0')}:00`;
  const remindTimeStr = `${scheduledTime.getHours().toString().padStart(2, '0')}:${scheduledTime.getMinutes().toString().padStart(2, '0')}`;
  
  return JSON.stringify({
    city: config.city_name,
    targetHour: matched.hour,
    weatherText: matched.forecast.weatherText,
    temperature: matched.forecast.temperature,
    weatherCode: matched.forecast.weatherCode,
    advanceMinutes: config.advance_minutes,
    pushMethod: config.push_method,
    email: config.email,
    wechatWebhook: config.wechat_webhook,
    ntfyTopic: config.ntfy_topic
  });
}

async function sendToNtfy(message: string, scheduledTime: Date, uniqueTag: string): Promise<string> {
  try {
    // 使用 uniqueTag 作为 ntfy 的 Id，实现自动去重
    // ntfy 会丢弃具有相同 Id 的重复消息
    const ntfyId = uniqueTag;
    const url = `${NTFY_URL}/${NTFY_TOPIC}`;

    // 计算延迟（秒）
    const now = new Date();
    const delaySeconds = Math.max(0, Math.floor((scheduledTime.getTime() - now.getTime()) / 1000));

    await axios.post(url, message, {
      headers: {
        'Id': ntfyId,
        'Delay': `${delaySeconds}s`,
        'Priority': 'high',
        'Tags': `warning,cloud,${uniqueTag}`
      }
    });

    console.log(`消息已发送到 ntfy: ${ntfyId}, 延迟: ${delaySeconds}秒`);
    return ntfyId;
  } catch (error) {
    console.error('发送到 ntfy 失败:', error);
    throw error;
  }
}
