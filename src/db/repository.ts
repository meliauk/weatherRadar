import { pool } from './connection';

export interface Group {
  id?: number;
  name: string;
}

export interface Config {
  id?: number;
  group_id: number;
  group_name?: string;
  city_name: string;
  city_code?: string;
  reminder_days: string;
  advance_minutes: number;
  push_method: 'email' | 'wechat' | 'ntfy' | 'all';
  email?: string;
  wechat_webhook?: string;
  ntfy_topic?: string;
  is_active: number;
}

export interface ReminderRule {
  id?: number;
  config_id: number;
  weather_type: 'rain' | 'snow' | 'storm' | 'hot' | 'cold';
  start_hour?: number;
  end_hour?: number;
  is_active: number;
}

export interface HourlyWeather {
  id?: number;
  config_id: number;
  city_name: string;
  forecast_date: string;
  hour: number;
  weather_text: string;
  weather_code: string;
  temperature: number;
  has_precipitation: number;
}

export interface ReminderTask {
  id?: number;
  config_id: number;
  rule_id: number;
  city_name: string;
  weather_text: string;
  weather_code: string;
  target_hour: number;
  scheduled_time: string;
  ntfy_message_id?: string;
  is_sent: number;
  sent_at?: Date;
}

export class Repository {
  // Group 操作
  static async createGroup(name: string): Promise<number> {
    const [result] = await pool.query(
      'INSERT INTO `groups` (name) VALUES (?)',
      [name]
    );
    return (result as any).insertId;
  }

  static async getGroupByName(name: string): Promise<Group | null> {
    const [rows] = await pool.query(
      'SELECT * FROM `groups` WHERE name = ?',
      [name]
    );
    return (rows as Group[])[0] || null;
  }

  static async getOrCreateGroup(name: string): Promise<number> {
    const existing = await this.getGroupByName(name);
    if (existing) {
      return existing.id!;
    }
    return await this.createGroup(name);
  }

  static async getAllGroups(): Promise<Group[]> {
    const [rows] = await pool.query('SELECT * FROM `groups`');
    return rows as Group[];
  }

  // Config 操作
  static async createConfig(config: Omit<Config, 'id'>): Promise<number> {
    const [result] = await pool.query(
      `INSERT INTO configs (
        group_id, city_name, city_code, reminder_days, advance_minutes,
        push_method, email, wechat_webhook, ntfy_topic, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        config.group_id, config.city_name, config.city_code, config.reminder_days,
        config.advance_minutes, config.push_method, config.email, config.wechat_webhook,
        config.ntfy_topic, config.is_active
      ]
    );
    return (result as any).insertId;
  }

  static async updateConfig(id: number, config: Partial<Config>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'group_name') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    values.push(id);
    await pool.query(
      `UPDATE configs SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  static async deleteConfig(id: number): Promise<void> {
    await pool.query('DELETE FROM configs WHERE id = ?', [id]);
  }

  static async getAllConfigs(): Promise<Config[]> {
    const [rows] = await pool.query(`
      SELECT c.*, g.name as group_name
      FROM configs c
      LEFT JOIN \`groups\` g ON c.group_id = g.id
    `);
    return rows as Config[];
  }

  static async getConfigById(id: number): Promise<Config | null> {
    const [rows] = await pool.query(
      'SELECT * FROM configs WHERE id = ?',
      [id]
    );
    return (rows as Config[])[0] || null;
  }

  static async getActiveConfigs(): Promise<Config[]> {
    const [rows] = await pool.query(`
      SELECT c.*, g.name as group_name
      FROM configs c
      LEFT JOIN \`groups\` g ON c.group_id = g.id
      WHERE c.is_active = 1
    `);
    return rows as Config[];
  }

  // ReminderRule 操作
  static async createRule(rule: Omit<ReminderRule, 'id'>): Promise<number> {
    const [result] = await pool.query(
      `INSERT INTO reminder_rules (config_id, weather_type, start_hour, end_hour, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [rule.config_id, rule.weather_type, rule.start_hour, rule.end_hour, rule.is_active]
    );
    return (result as any).insertId;
  }

  static async getRulesByConfigId(configId: number): Promise<ReminderRule[]> {
    const [rows] = await pool.query(
      'SELECT * FROM reminder_rules WHERE config_id = ? AND is_active = 1',
      [configId]
    );
    return rows as ReminderRule[];
  }

  static async deleteRulesByConfigId(configId: number): Promise<void> {
    await pool.query('DELETE FROM reminder_rules WHERE config_id = ?', [configId]);
  }

  // HourlyWeather 操作
  static async saveHourlyWeather(weather: Omit<HourlyWeather, 'id'>): Promise<void> {
    await pool.query(
      `INSERT INTO hourly_weather 
       (config_id, city_name, forecast_date, hour, weather_text, weather_code, temperature, has_precipitation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       weather_text = VALUES(weather_text),
       weather_code = VALUES(weather_code),
       temperature = VALUES(temperature),
       has_precipitation = VALUES(has_precipitation)`,
      [weather.config_id, weather.city_name, weather.forecast_date, weather.hour,
       weather.weather_text, weather.weather_code, weather.temperature, weather.has_precipitation]
    );
  }

  static async getHourlyWeather(configId: number, date: string): Promise<HourlyWeather[]> {
    const [rows] = await pool.query(
      'SELECT * FROM hourly_weather WHERE config_id = ? AND forecast_date = ? ORDER BY hour',
      [configId, date]
    );
    return rows as HourlyWeather[];
  }

  // ReminderTask 操作
  static async createTask(task: Omit<ReminderTask, 'id'>): Promise<number> {
    const [result] = await pool.query(
      `INSERT INTO reminder_tasks 
       (config_id, rule_id, city_name, weather_text, weather_code, target_hour, scheduled_time, ntfy_message_id, is_sent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [task.config_id, task.rule_id, task.city_name, task.weather_text, task.weather_code,
       task.target_hour, task.scheduled_time, task.ntfy_message_id || null, task.is_sent]
    );
    return (result as any).insertId;
  }

  static async getPendingTasks(): Promise<ReminderTask[]> {
    const [rows] = await pool.query(
      `SELECT * FROM reminder_tasks 
       WHERE is_sent = 0 AND scheduled_time <= NOW()
       ORDER BY scheduled_time`
    );
    return rows as ReminderTask[];
  }

  static async getTaskByNtfyId(ntfyId: string): Promise<ReminderTask | null> {
    const [rows] = await pool.query(
      'SELECT * FROM reminder_tasks WHERE ntfy_message_id = ?',
      [ntfyId]
    );
    return (rows as ReminderTask[])[0] || null;
  }

  static async markTaskAsSent(taskId: number, ntfyId?: string): Promise<void> {
    await pool.query(
      `UPDATE reminder_tasks 
       SET is_sent = 1, sent_at = NOW(), ntfy_message_id = ?
       WHERE id = ?`,
      [ntfyId || null, taskId]
    );
  }

  static async getUnsentTasks(): Promise<ReminderTask[]> {
    const [rows] = await pool.query(
      `SELECT t.*, c.push_method, c.email, c.wechat_webhook, c.ntfy_topic, c.advance_minutes
       FROM reminder_tasks t
       JOIN configs c ON t.config_id = c.id
       WHERE t.is_sent = 0
       ORDER BY t.scheduled_time`
    );
    return rows as any[];
  }
}
