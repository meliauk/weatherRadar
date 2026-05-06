import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'weather_radar',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // 连接保活配置 - 防止 MySQL wait_timeout 断开连接
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

export const pool = mysql.createPool(dbConfig);

export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    console.log('数据库连接成功');
    connection.release();
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
}

// 执行查询并自动处理连接错误
export async function executeQuery(sql: string, values?: any[]): Promise<any> {
  try {
    const [result] = await pool.query(sql, values);
    return result;
  } catch (error: any) {
    // 如果是连接错误，尝试重连一次
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      console.log('数据库连接断开，尝试重连...');
      // 等待 1 秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
      const [result] = await pool.query(sql, values);
      return result;
    }
    throw error;
  }
}

export default pool;
