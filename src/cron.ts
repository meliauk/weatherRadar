import dotenv from 'dotenv';
import cron from 'node-cron';
import { testConnection } from './db/connection';
import { analyzeWeatherAndSchedule } from './services/cron';

dotenv.config();

async function main() {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('数据库连接失败，程序退出');
    process.exit(1);
  }

  console.log('天气提醒定时任务已启动,执行一次');
  await analyzeWeatherAndSchedule();
  console.log('任务执行完成，退出程序');
  process.exit(0);
}

main();
