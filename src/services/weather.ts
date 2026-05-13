import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.QWEATHER_API_KEY;
const API_HOST = process.env.QWEATHER_API_HOST || 'api.qweather.com';

export interface WeatherData {
  cityName: string;
  weatherText: string;
  weatherCode: string;
  temperature: number;
  humidity?: number;
  windSpeed?: number;
  windDir?: string;
  precipitation?: number;
}

export interface HourlyForecast {
  hour: number;
  weatherText: string;
  weatherCode: string;
  temperature: number;
  hasPrecipitation: boolean;
  precip?: number;
}

export async function getWeatherByCity(cityName: string): Promise<WeatherData> {
  try {
    const geoUrl = `https://${API_HOST}/geo/v2/city/lookup`;
    const geoRes = await axios.get(geoUrl, {
      params: {
        location: cityName,
        key: API_KEY,
        limit: 1
      }
    });

    if (!geoRes.data.location || geoRes.data.location.length === 0) {
      throw new Error(`未找到城市: ${cityName}`);
    }

    const cityId = geoRes.data.location[0].id;
    const cityNameFull = geoRes.data.location[0].name;

    const weatherUrl = `https://${API_HOST}/v7/weather/now`;
    const weatherRes = await axios.get(weatherUrl, {
      params: {
        location: cityId,
        key: API_KEY
      }
    });

    const now = weatherRes.data.now;

    return {
      cityName: cityNameFull,
      weatherText: now.text,
      weatherCode: now.icon,
      temperature: parseFloat(now.temp),
      humidity: parseFloat(now.humidity),
      windSpeed: parseFloat(now.windSpeed),
      windDir: now.windDir,
      precipitation: parseFloat(now.precip)
    };
  } catch (error) {
    console.error('获取天气失败:', error);
    throw error;
  }
}

export async function get24HourForecast(cityName: string): Promise<HourlyForecast[]> {
  try {
    const geoUrl = `https://${API_HOST}/geo/v2/city/lookup`;
    const geoRes = await axios.get(geoUrl, {
      params: {
        location: cityName,
        key: API_KEY,
        limit: 1
      }
    });


    if (!geoRes.data.location || geoRes.data.location.length === 0) {
      throw new Error(`未找到城市: ${cityName}`);
    }

    console.log(`[[${cityName}] 获取cityId: `,geoRes.data.location[0]);


    const cityId = geoRes.data.location[0].id;

    const forecastUrl = `https://${API_HOST}/v7/weather/24h`;
    const res = await axios.get(forecastUrl, {
      params: {
        location: cityId,
        key: API_KEY
      }
    });

    // console.log(`[${cityName}] 获取24小时预报成功: `,JSON.stringify(res.data.hourly));

    const hourly = res.data.hourly;

    // 获取今天的日期（本地时间）
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    console.log(`获取今天的日期: `,todayStr);

    return hourly
      .filter((h: any) => {
        // 只保留今天的预报数据
        const fxDate = h.fxTime.slice(0, 10); // 提取 YYYY-MM-DD
        return fxDate === todayStr;
      })
      .map((h: any) => {
        const hour = new Date(h.fxTime).getHours();
        const weatherCode = h.icon;

        return {
          hour,
          weatherText: h.text,
          weatherCode,
          temperature: parseFloat(h.temp),
          hasPrecipitation: checkHasPrecipitation(weatherCode),
          precip: parseFloat(h.precip || '0')
        };
      });
  } catch (error) {
    console.error('获取24小时预报失败:', error);
    throw error;
  }
}

function checkHasPrecipitation(weatherCode: string): boolean {
  const rainCodes = ['300', '301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314', '315', '316', '317', '318', '350', '351', '399'];
  const snowCodes = ['400', '401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '456', '457', '499'];

  return rainCodes.includes(weatherCode) || snowCodes.includes(weatherCode);
}

export function checkWeatherType(weatherCode: string, weatherType: 'rain' | 'snow' | 'storm' | 'hot' | 'cold', temperature?: number): boolean {
  switch (weatherType) {
    case 'rain':
      const rainCodes = ['300', '301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314', '315', '316', '317', '318', '350', '351', '399'];
      return rainCodes.includes(weatherCode);

    case 'snow':
      const snowCodes = ['400', '401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '456', '457', '499'];
      return snowCodes.includes(weatherCode);

    case 'storm':
      const stormCodes = ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '350', '351'];
      return stormCodes.includes(weatherCode);

    case 'hot':
      return temperature !== undefined && temperature >= 35;

    case 'cold':
      return temperature !== undefined && temperature <= 0;

    default:
      return false;
  }
}

export function formatWeatherMessage(cityName: string, hour: number, weatherText: string, temperature: number, advanceMinutes: number): string {
  const targetTime = `${hour.toString().padStart(2, '0')}:00`;
  const remindTime = new Date();
  remindTime.setHours(hour, 0, 0, 0);
  remindTime.setMinutes(remindTime.getMinutes() - advanceMinutes);
  const remindTimeStr = `${remindTime.getHours().toString().padStart(2, '0')}:${remindTime.getMinutes().toString().padStart(2, '0')}`;
  
  return `🌤️ ${cityName} 天气提醒\n\n` +
    `⏰ 目标时间: ${targetTime}\n` +
    `🌡️ 温度: ${temperature}°C\n` +
    `🌦️ 天气: ${weatherText}\n\n` +
    `⏰ 将在 ${remindTimeStr} 提醒您`;
}
