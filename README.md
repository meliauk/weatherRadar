# 🌤️ Weather Radar - 精准天气提醒系统

基于规则的小时级天气预报提醒系统，支持多种推送方式（邮箱、企业微信、ntfy）。

## 🎯 功能特性

- **精准小时级提醒**：早晨4点查询全天天气（5:00-23:00），精准匹配每一小时
- **灵活规则配置**：支持多规则配置，如"下雨 8-9点"、"下雪"（全天）
- **提前提醒**：可自定义提前提醒时长（默认60分钟）
- **多渠道推送**：支持邮箱、企业微信机器人、ntfy
- **消息队列**：使用ntfy作为消息队列，支持延迟发送，精准控制提醒时间

## 🏗️ 系统架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GitHub Actions │     │   ntfy 队列      │     │   常驻监听服务   │
│   (早晨4点定时)  │────▶│   (延迟消息)     │────▶│   (消费并推送)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                                               │
         ▼                                               ▼
┌─────────────────┐                          ┌─────────────────┐
│  和风天气 API   │                          │  邮箱/微信/ntfy │
│  (24小时预报)   │                          │  (用户接收)     │
└─────────────────┘                          └─────────────────┘
```

## 📋 工作流程

1. **早晨4:00**：GitHub Actions 触发，获取24小时天气预报（5:00-23:00）
2. **规则匹配**：逐小时分析天气，匹配用户配置的规则
3. **计算发送时间**：根据目标时间和提前提醒时长，计算实际发送时间
4. **入队**：发送消息到ntfy队列，使用Delay功能延迟到指定时间
5. **消费推送**：常驻监听服务消费消息，根据配置推送给用户

## 🚀 部署指南

### 前置要求

- Node.js 20+
- MySQL 数据库
- 和风天气 API Key
- ntfy 服务（可使用 ntfy.sh 免费版）
- （可选）企业微信机器人
- （可选）SMTP 邮箱

### 环境变量配置

复制 `local.env` 为 `.env` 并填写以下配置：

```env
# MySQL 数据库配置
DB_HOST=your_db_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=weather_radar

# 和风天气 API (https://dev.qweather.com/)
QWEATHER_API_KEY=your_api_key
QWEATHER_API_HOST=your_api_host

# 企业微信机器人（可选）
WECHAT_CORP_ID=your_corp_id
WECHAT_AGENT_ID=your_agent_id
WECHAT_SECRET=your_secret

# 邮箱配置（可选）
EMAIL_HOST=smtp.example.com
EMAIL_PORT=465
EMAIL_USER=your_email
EMAIL_PASS=your_password

# ntfy 配置
NTFY_URL=https://ntfy.sh
NTFY_TOPIC=your-topic-name
```

### 安装依赖

```bash
npm install
```

### 初始化数据库

```bash
npm run build
npm start
# 首次启动会自动创建数据库表
```

### 本地开发

```bash
# 启动 Web 配置界面
npm run dev
```

访问 http://localhost:3000 进行配置。

### 部署方案

#### 方案一：GitHub Actions + 常驻服务（推荐）

1. **定时任务**：GitHub Actions 每天早晨4点执行天气分析
   - Fork 本仓库
   - 在 Settings → Secrets and variables → Actions 中添加所有环境变量
   - 创建 `production` Environment
   - GitHub Actions 将每天自动运行

2. **消息监听**：部署 `npm run listener` 为常驻服务
   - **Railway**: `railway run npm run listener`
   - **Render**: 创建 Web Service，Start Command 设为 `npm run listener`
   - **服务器**: 使用 PM2: `pm2 start npm --name weather-listener -- run listener`

3. **启动定时服务**：部署 `npm run cron` 为常驻服务

#### 方案二：全服务器部署

在一台服务器上同时运行：

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 构建
npm run build

# 3. 启动 Web 服务
pm2 start npm --name weather-web -- start

# 4. 启动定时任务（使用 node-cron 内部调度）
pm2 start npm --name weather-cron -- run cron

# 5. 启动消息监听
pm2 start npm --name weather-listener -- run listener
```

## 📝 配置说明

### 提醒规则示例

| 规则配置 | 含义 |
|---------|------|
| `下雨` | 全天任何时间下雨都提醒 |
| `下雨 8-9` | 只在 8:00-9:00 时段下雨才提醒 |
| `下雪` | 全天下雪都提醒 |
| `高温` | 全天温度 ≥35°C 时提醒 |
| `低温` | 全天温度 ≤0°C 时提醒 |

### 提前提醒时长

- 默认 60 分钟，即提前 1 小时提醒
- 可设置为 5-180 分钟（1-3 小时）
- 例如：目标时间 8:00，提前 30 分钟 → 7:30 发送提醒

## 🛠️ 技术栈

- **后端**: Node.js + TypeScript + Express
- **数据库**: MySQL + mysql2
- **定时任务**: node-cron
- **天气数据**: 和风天气 API
- **消息队列**: ntfy
- **推送方式**: nodemailer (邮件) / 企业微信 Webhook / ntfy

## 📄 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

**Weather Radar** - 让天气提醒更精准、更智能！☀️☁️🌧️❄️
