import axios from 'axios';
import dotenv from 'dotenv';
import { pushNotification } from './push';
import { Repository } from '../db/repository';

dotenv.config();

const NTFY_URL = process.env.NTFY_URL || 'https://ntfy.sh';
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'wyf-weather-notity';

interface NtfyMessage {
  id: string;
  time: number;
  expires?: number;
  event: string;
  topic: string;
  message: string;
  title?: string;
  priority?: number;
  tags?: string[];
}

interface WeatherMessage {
  city: string;
  targetHour: number;
  weatherText: string;
  temperature: number;
  weatherCode: string;
  advanceMinutes: number;
  pushMethod: 'email' | 'wechat' | 'ntfy' | 'all';
  email?: string;
  wechatWebhook?: string;
  ntfyTopic?: string;
}

export async function startNtfyListener(): Promise<void> {
  console.log('[' + new Date().toISOString() + '] 启动 ntfy 消息监听...');
  console.log(`监听主题: ${NTFY_TOPIC}`);

  const url = `${NTFY_URL}/${NTFY_TOPIC}/json`;

  while (true) {
    try {
      console.log('[' + new Date().toISOString() + '] 连接到 ntfy 服务器...');

      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 0, // 无限等待
      });

      const stream = response.data;

      stream.on('data', async (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const message: NtfyMessage = JSON.parse(line);

            // 只处理 message 类型的事件
            if (message.event === 'message') {
              console.log(`收到消息: ${message.id}`);
              await processMessage(message);
            }
          } catch (e) {
            // 忽略解析错误（可能是 keepalive 消息）
          }
        }
      });

      stream.on('error', (error: Error) => {
        console.error('Stream 错误:', error.message);
      });

      stream.on('close', () => {
        console.log('[' + new Date().toISOString() + '] 连接关闭，5秒后重连...');
      });

      // 等待 stream 结束
      await new Promise((resolve) => {
        stream.on('close', resolve);
      });

      // 重连延迟
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      console.error('[' + new Date().toISOString() + '] 连接错误:', (error as Error).message);
      console.log('5秒后重连...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function processMessage(message: NtfyMessage): Promise<void> {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        try {
            // 解析消息内容
            let data: WeatherMessage;
            try {
                data = JSON.parse(message.message);
            } catch (e) {
                console.error('消息解析失败:', message.message);
                return;
            }

            console.log(`处理消息: ${data.city} ${data.targetHour}:00`);

            // 查找对应的任务
            const task = await Repository.getTaskByNtfyId(message.id);
            if (!task) {
                console.log(`未找到对应的任务记录: ${message.id}`);
            }

            // 发送通知
            const targetTime = `${data.targetHour.toString().padStart(2, '0')}:00`;
            const remindTime = new Date();
            remindTime.setHours(data.targetHour, 0, 0, 0);
            remindTime.setMinutes(remindTime.getMinutes() - data.advanceMinutes);
            const remindTimeStr = `${remindTime.getHours().toString().padStart(2, '0')}:${remindTime.getMinutes().toString().padStart(2, '0')}`;

            const pushResult = await pushNotification(
                data.pushMethod,
                {
                    email: data.email,
                    wechatWebhook: data.wechatWebhook,
                    ntfyTopic: data.ntfyTopic
                },
                {
                    cityName: data.city,
                    weather: {
                        cityName: data.city,
                        weatherText: data.weatherText,
                        weatherCode: data.weatherCode,
                        temperature: data.temperature
                    },
                    reason: `${data.weatherText} (${targetTime})`,
                    timeSlot: 'morning',
                    customMessage: `🌤️ ${data.city} 天气提醒\n\n` +
                        `⏰ 目标时间: ${targetTime}\n` +
                        `🌡️ 温度: ${data.temperature}°C\n` +
                        `🌦️ 天气: ${data.weatherText}\n\n` +
                        `⏰ 提前 ${data.advanceMinutes} 分钟提醒您`
                }
            );

            if (pushResult.success) {
                console.log(`通知发送成功: ${data.city} ${data.targetHour}:00`);

                // 更新任务状态
                if (task) {
                    await Repository.markTaskAsSent(task.id!, message.id);
                }
            } else {
                console.error(`通知发送失败: ${data.city} ${data.targetHour}:00`);
            }

        } catch (error) {
            console.error('处理消息失败:', error);
        }
    }
}