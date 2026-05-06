import dotenv from 'dotenv';
import { testConnection } from './db/connection';
import { startNtfyListener } from './services/ntfy-listener';

dotenv.config();

async function main() {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('数据库连接失败，程序退出');
    process.exit(1);
  }

  console.log('启动 ntfy 消息监听器...');
  await startNtfyListener();
}

main();
