import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { testConnection } from './db/connection';
import { initDatabase } from './db/schema';
import apiRouter from './routes/api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function main() {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('数据库连接失败，程序退出');
    process.exit(1);
  }

  await initDatabase();

  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

main();
