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

  // 早晨4点执行天气分析和任务生成
  cron.schedule('0 4 * * *', async () => {
    console.log('[' + new Date().toISOString() + '] 执行早晨4点天气分析...');
    await analyzeWeatherAndSchedule();
  });

  // 调试：立即执行一次
  if (process.argv.includes('--run-now')) {
    console.log('立即执行一次...');
    await analyzeWeatherAndSchedule();
  }

}

main();
