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
┌──────────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│   GitHub Actions      │   │   ntfy 队列       │   │  常驻监听服务        │
│   (云端 · 每天04:00)   │──▶│   (延迟消息)      │──▶│   (你的服务器)      │
│   运行 npm run cron    │   └──────────────────┘   │   运行 npm run      │
└──────────────────────┘                            │   listener          │
         │                                          └──────────┬──────────┘
         ▼                                                     ▼
┌──────────────────────┐                          ┌─────────────────────┐
│  和风天气 API         │                          │  邮箱/企业微信/ntfy  │
│  (24小时预报)         │                          │  (用户接收)         │
└──────────────────────┘                          └─────────────────────┘

  ┌─────────────────────┐
  │  MySQL 数据库        │  ← 两端共用：GitHub Actions 写入任务，
  │  (公网可达)          │    服务器 listener 读取并标记已发送
  └─────────────────────┘
```

## 📋 工作流程

> 第 1-4 步发生在 **GitHub Actions（云端）**，第 5 步发生在 **你的服务器**。

1. **早晨4:00**（北京时间）：GitHub Actions 定时触发 `npm run cron`，查询数据库中的配置，获取24小时天气预报（5:00-23:00）
2. **规则匹配**：逐小时分析天气，匹配用户配置的规则（如"下雨 8-9点"）
3. **计算发送时间**：根据目标时间和提前提醒时长，计算实际发送时间
4. **入队**：把提醒消息发送到 ntfy 队列，使用 Delay 功能延迟到指定时间投递（**执行完即退出，无需常驻**）
5. **消费推送**（你的服务器）：常驻的 `npm run listener` 订阅 ntfy 主题 → 消息到点被投递 → 实时复核天气是否仍满足规则 → 按配置推送给用户（邮箱/企业微信/ntfy）

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

访问 http://localhost:3000/weather 进行配置（若 `.env` 中设置了 `PORT`，则用对应端口，如 http://localhost:9888/weather）。

### 部署方案

系统由 **3 个程序**组成，先看清分工，别把它们弄混：

| 程序 | 命令 | 部署位置 | 运行方式 | 职责 |
|------|------|---------|---------|------|
| 定时分析 cron | `npm run cron` | **GitHub Actions**（云端） | 由 workflow `weather-cron.yml` 每天 **北京时间 04:00** 自动触发（也可手动 Run workflow） | 读数据库配置 → 查和风 24h 预报 → 匹配规则 → 把带 Delay 的提醒消息发到 ntfy 主题。**执行一次即退出**，不是常驻进程 |
| 常驻监听 listener | `npm run listener` | **你自己的服务器** | PM2 等常驻 | 订阅同一个 ntfy 主题 → 消息到点被投递 → 实时复核天气 → 推送（邮箱/企业微信/ntfy） |
| Web 配置页 web | `npm start` | **你自己的服务器** | PM2 常驻（建议） | 网页上添加城市、提醒规则、推送方式，写入数据库；首次启动自动建表 |

> ⚠️ 关键前提：**数据库必须能被 GitHub Actions 和你的服务器同时访问**（公网可达的 MySQL / 云数据库）。cron 在 GitHub 云端读配置写任务，listener 在你服务器上也要连同一个库。

#### 方案一：GitHub Actions 定时 + 服务器常驻（推荐）

分工一句话：**GitHub 负责"每天分析并排程"，你的服务器负责"到点推送"和"配置页面"**。cron 不需要你的服务器 24 小时在线。

**第 1 步 · GitHub 上要做的（只做"定时分析"，无需自己建任何定时任务）**

仓库已内置 `.github/workflows/weather-cron.yml`：

1. 把仓库推到你的 GitHub（或 Fork）。
2. 在仓库 `Settings → Environments → New environment` 创建名为 **`production`** 的环境（workflow 里写死了这个名字）。
3. 在该 Environment 的 **Secrets** 中添加（注意是 GitHub Secrets，不是本地 .env）：
   - 数据库：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
   - 和风天气：`QWEATHER_API_KEY`、`QWEATHER_API_HOST`
   - ntfy：`NTFY_URL`、`NTFY_TOPIC`（⚠️ 必须与第 2 步服务器 .env 里**完全一致**，否则 listener 收不到）
   - 邮件/企业微信的凭据**不用**加到这里 —— 推送发生在服务器 listener 侧，不经过 GitHub。
4. 之后每天北京时间 04:00 workflow 会自动运行（Actions 页可看历史日志）。
5. 首次验证：Actions → `Weather Radar Cron` → **Run workflow** 手动触发一次，日志出现 `消息已发送到 ntfy: weather-...` / `创建任务成功` 即代表分析排程成功。

**第 2 步 · 你的服务器上要做的（只做"监听推送"和"配置页"，**不要**再跑 cron）**

```bash
# 1. 拉代码并安装
git clone <你的仓库> && cd WeatherReminder
npm install
npm run build

# 2. 配置 .env（复制 local.env 为 .env 后填写）
#    - DB_*：与第 1 步 GitHub Secrets 完全相同的数据库
#    - QWEATHER_*：listener 到点后要实时复核天气，也需要
#    - NTFY_URL / NTFY_TOPIC：主题名与 GitHub Secrets 一致
#    - EMAIL_* / WECHAT_*：最终推送凭据（按需）
#    - PORT：Web 端口（默认 3000，示例 .env 用 9888）

# 3. 用 PM2 常驻两个服务
npm install -g pm2
pm2 start npm --name weather-listener -- run listener   # 消费 ntfy 消息并推送（必须）
pm2 start npm --name weather-web      -- start          # Web 配置页（建议；首次启动自动建表）
pm2 save && pm2 startup  # 保存开启自启
```

- 浏览器打开 `http://你的域名或IP:PORT/weather`（见第 2 步 PORT）添加城市、规则、推送渠道；
- **服务器上绝对不要再跑 `npm run cron`**：定时分析已由 GitHub Actions 负责，若用 pm2 常驻 cron，它会"跑完退出 → pm2 重启 → 再跑"，每分钟循环发重复消息、重复写任务记录。

**第 3 步 · 端到端自检**

1. Actions 手动 Run workflow → 日志出现 `创建任务成功`；
2. 到目标时间前几分钟，在服务器 `pm2 logs weather-listener` 应看到 `收到消息` → `处理消息` → `通知发送成功`；
3. 收不到时依次排查：GitHub 与服务器两边 `NTFY_TOPIC` 是否一致 → listener 是否连上数据库和 ntfy（日志有"数据库连接成功"）→ GitHub Secrets 是否齐全。

#### 方案二：全服务器部署（不用 GitHub Actions）

在一台**公网可达 MySQL 的服务器**上运行（无 GitHub Actions 依赖）：

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 构建
npm run build

# 3. 启动 Web 配置服务（首次启动自动建表）
pm2 start npm --name weather-web -- start

# 4. 启动消息监听（常驻，消费 ntfy 消息并推送）
pm2 start npm --name weather-listener -- run listener

# 5. 定时分析：npm run cron 执行一次即退出，不能 pm2 常驻，请用系统 crontab：
#    crontab -e 中添加（每天北京时间 04:00）：
#    0 4 * * * cd /path/to/WeatherReminder && npm run cron >> /path/to/cron.log 2>&1

pm2 save && pm2 startup
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
- **定时调度**: GitHub Actions Schedule（方案一）/ 系统 crontab（方案二）
- **天气数据**: 和风天气 API
- **消息队列**: ntfy
- **推送方式**: nodemailer (邮件) / 企业微信 Webhook / ntfy

## 📄 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

**Weather Radar** - 让天气提醒更精准、更智能！☀️☁️🌧️❄️

