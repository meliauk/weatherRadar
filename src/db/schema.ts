import { pool } from './connection';

export async function initDatabase(): Promise<void> {
  const connection = await pool.getConnection();
  
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`groups\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT '分组名称',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // configs 表简化，去掉 reminder_time_morning/evening
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`configs\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        city_name VARCHAR(100) NOT NULL COMMENT '城市名称',
        city_code VARCHAR(50) COMMENT '城市代码',
        reminder_days VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5' COMMENT '提醒周期，如:1,2,3,4,5表示周一到周五',
        advance_minutes INT DEFAULT 60 COMMENT '提前提醒时长（分钟）',
        push_method ENUM('email', 'wechat', 'ntfy', 'all') NOT NULL DEFAULT 'email' COMMENT '推送方式',
        email VARCHAR(100) COMMENT '邮箱地址',
        wechat_webhook VARCHAR(500) COMMENT '企业微信机器人webhook',
        ntfy_topic VARCHAR(200) COMMENT 'ntfy主题',
        is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 新增提醒规则表（支持多规则、时间段配置）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reminder_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_id INT NOT NULL,
        weather_type ENUM('rain', 'snow', 'storm', 'hot', 'cold') NOT NULL COMMENT '天气类型',
        start_hour INT COMMENT '提醒开始小时（如8表示8:00），NULL表示全天',
        end_hour INT COMMENT '提醒结束小时（如9表示9:00），NULL表示全天',
        is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (config_id) REFERENCES \`configs\`(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 天气日志表 - 改为记录小时级天气
    await connection.query(`
      CREATE TABLE IF NOT EXISTS hourly_weather (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_id INT NOT NULL,
        city_name VARCHAR(100) NOT NULL,
        forecast_date DATE NOT NULL COMMENT '预报日期',
        hour INT NOT NULL COMMENT '小时（0-23）',
        weather_text VARCHAR(50) COMMENT '天气描述',
        weather_code VARCHAR(20) COMMENT '天气代码',
        temperature DECIMAL(5,2) COMMENT '温度',
        has_precipitation TINYINT(1) DEFAULT 0 COMMENT '是否有降水',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_config_hour (config_id, forecast_date, hour),
        FOREIGN KEY (config_id) REFERENCES configs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 提醒任务表 - 记录需要发送的提醒
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reminder_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_id INT NOT NULL,
        rule_id INT NOT NULL,
        city_name VARCHAR(100) NOT NULL,
        weather_text VARCHAR(50) COMMENT '天气描述',
        weather_code VARCHAR(20) COMMENT '天气代码',
        target_hour INT NOT NULL COMMENT '目标天气小时',
        scheduled_time DATETIME NOT NULL COMMENT '计划发送时间',
        ntfy_message_id VARCHAR(200) COMMENT 'ntfy消息ID',
        is_sent TINYINT(1) DEFAULT 0 COMMENT '是否已发送',
        sent_at TIMESTAMP NULL COMMENT '发送时间',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (config_id) REFERENCES configs(id) ON DELETE CASCADE,
        FOREIGN KEY (rule_id) REFERENCES reminder_rules(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 已发送记录表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sent_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_id INT NOT NULL,
        task_id INT NOT NULL,
        push_method VARCHAR(50) COMMENT '推送方式',
        is_success TINYINT(1) DEFAULT 1,
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (config_id) REFERENCES configs(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES reminder_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('数据库表创建成功');
  } catch (error) {
    console.error('数据库表创建失败:', error);
    throw error;
  } finally {
    connection.release();
  }
}
