import axios from 'axios';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { WeatherData } from './weather';

dotenv.config();

// 邮件配置
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 企业微信配置
const WECHAT_CORP_ID = process.env.WECHAT_CORP_ID;
const WECHAT_AGENT_ID = process.env.WECHAT_AGENT_ID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

interface PushMessage {
  cityName: string;
  weather: WeatherData;
  reason: string;
  timeSlot: 'morning' | 'evening';
  customMessage?: string;
}

function getTimeSlotText(timeSlot: 'morning' | 'evening'): string {
  return timeSlot === 'morning' ? '早上' : '晚上';
}

function buildMessageContent(message: PushMessage): string {
  // 如果有自定义消息，直接使用
  if (message.customMessage) {
    return message.customMessage;
  }
  
  const timeText = getTimeSlotText(message.timeSlot);
  return `${timeText}好！${message.cityName}天气提醒\n\n` +
    `🌡️ 温度: ${message.weather.temperature}°C\n` +
    `🌦️ 天气: ${message.weather.weatherText}\n` +
    `💧 湿度: ${message.weather.humidity}%\n` +
    `🌬️ 风速: ${message.weather.windDir} ${message.weather.windSpeed}km/h\n\n` +
    `⚠️ 提醒原因: ${message.reason}\n\n` +
    `${message.timeSlot === 'morning' ? '出门记得带伞！' : '回家注意安全！'}`;
}

// 发送邮件
export async function sendEmail(to: string, message: PushMessage): Promise<boolean> {
  try {
    const subject = `${message.cityName}天气提醒 - ${getTimeSlotText(message.timeSlot)}`;
    const content = buildMessageContent(message);

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: content,
      html: content.replace(/\n/g, '<br>')
    });

    console.log(`邮件发送成功: ${to}`);
    return true;
  } catch (error) {
    console.error('邮件发送失败:', error);
    return false;
  }
}

// 发送企业微信消息
export async function sendWechat(webhookUrl: string, message: PushMessage): Promise<boolean> {
  try {
    const content = buildMessageContent(message);

    const res = await axios.post(webhookUrl, {
      msgtype: 'text',
      text: {
        content,
        mentioned_mobile_list: []
      }
    });

    if (res.data.errcode === 0) {
      console.log('企业微信发送成功');
      return true;
    } else {
      console.error('企业微信发送失败:', res.data);
      return false;
    }
  } catch (error) {
    console.error('企业微信发送失败:', error);
    return false;
  }
}

// 发送 ntfy 消息
export async function sendNtfy(topic: string, message: PushMessage): Promise<boolean> {
  try {
    const ntfyUrl = `${process.env.NTFY_URL || 'https://ntfy.sh'}/${topic}`;
    const title = `${message.cityName}天气提醒 - ${getTimeSlotText(message.timeSlot)}`;
    const content = buildMessageContent(message);

    const res = await axios.post(ntfyUrl, content, {
      headers: {
        'Title': title,
        'Priority': 'high',
        'Tags': 'warning,cloud'
      }
    });

    console.log('ntfy 发送成功');
    return true;
  } catch (error) {
    console.error('ntfy 发送失败:', error);
    return false;
  }
}

// 统一推送入口
export async function pushNotification(
  method: 'email' | 'wechat' | 'ntfy' | 'all',
  config: {
    email?: string;
    wechatWebhook?: string;
    ntfyTopic?: string;
  },
  message: PushMessage
): Promise<{ success: boolean; results: Record<string, boolean> }> {
  const results: Record<string, boolean> = {};

  if (method === 'email' || method === 'all') {
    if (config.email) {
      results.email = await sendEmail(config.email, message);
    }
  }

  if (method === 'wechat' || method === 'all') {
    if (config.wechatWebhook) {
      results.wechat = await sendWechat(config.wechatWebhook, message);
    }
  }

  if (method === 'ntfy' || method === 'all') {
    if (config.ntfyTopic) {
      results.ntfy = await sendNtfy(config.ntfyTopic, message);
    }
  }

  const success = Object.values(results).some(r => r);
  return { success, results };
}
