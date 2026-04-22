# Renaiss Scanner

监控 [Renaiss Marketplace](https://www.renaiss.xyz) 在售卡牌，自动发现**连号且双卡均在售**的组合。

---

**通过我的邀请链接注册 Renaiss → [立即注册](https://www.renaiss.xyz/ref/blueskyone)**
---
**关注我的 X → [Follow @blueskylh1](https://twitter.com/intent/user?screen_name=blueskylh1)**
---
**使用教程 → [查看教程](https://x.com/blueskylh1/status/2044281808297308586)**
---
**已部署的网站 → [直达链接](https://renaiss-tool-689931.napa.de5.net/)**

---

![Demo](screenshot.png)

## 功能

- **连号对发现**：自动扫描市场，找到序列号相邻且两张卡同时挂单的配对
- **捡漏标记**：挂单价低于 FMV 超过 $10 的卡牌自动高亮
- **FMV 显示**：每张卡显示 Fair Market Value
- **一键购买**：直接跳转到 Renaiss 对应卡牌页面
- **图片放大**：点击卡牌图片弹窗查看大图
- **多语言**：简体中文、繁体中文、English、日本語、한국어
- **每 10 分钟自动同步**市场数据

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 API | Cloudflare Workers |
| 前端静态 | Workers Assets（内置） |
| 数据库 | Cloudflare D1 (SQLite) |
| 定时同步 | Workers Cron Triggers (`*/10 * * * *`) |
| 前端 | React 19 + Vite + Tailwind CSS 4 |
| UI 组件 | Radix UI + shadcn/ui |

## 项目结构

```
renaiss-scanner/
├── backend/
│   ├── worker.js          # Workers 入口：API + 前端静态资源
│   ├── db/schema.js       # D1 建表语句（内嵌在 worker.js）
│   ├── package.json
│   └── scripts/            # 开发辅助脚本
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConsecutiveScanner.tsx   # 主页面组件
│   │   │   └── ui/                     # shadcn/ui 组件
│   │   ├── lib/
│   │   │   ├── api.ts                  # API 地址构造
│   │   │   ├── i18n.ts                 # 多语言系统
│   │   │   └── locales/               # 翻译文件
│   │   │       ├── zh-CN.ts
│   │   │       ├── zh-TW.ts
│   │   │       ├── en.ts
│   │   │       ├── ja.ts
│   │   │       └── ko.ts
│   │   └── App.tsx
│   ├── public/             # 静态资源 (logo, avatar)
│   ├── .env                # API 地址配置
│   └── package.json
├── wrangler.toml           # Workers 配置（不提交）
├── wrangler.toml.example   # 配置模板（可提交）
└── README.md
```

## API

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/scanner` | GET | 获取连号对列表（分页），`?page=1&pageSize=10` |
| `/api/scanner/status` | GET | 同步状态（进度、时间、总量） |
| `/api/scanner/refresh` | POST | 手动触发同步（需 `x-refresh-token`） |
| `/api/health` | GET | 健康检查 |

## 本地开发

### 后端（Workers 本地模拟）

```bash
cd backend
npm install
npm run dev    # wrangler dev，本地 D1
```

### 前端

```bash
cd frontend
npm install

# 配置 API 地址
cp .env.example .env
# 编辑 .env 设置 VITE_API_BASE

npm run dev
```

## 部署到 Cloudflare

### 前置准备

1. 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
2. 安装 Wrangler CLI：
   ```bash
   npm install -g wrangler
   ```
3. 登录 Cloudflare：
   ```bash
   wrangler login
   ```

### 部署步骤

#### 1. 创建 D1 数据库（如需要）

```bash
npx wrangler d1 create renaiss-scanner
```

复制返回的 `database_id` 备用。

#### 2. 配置 wrangler.toml

从 `wrangler.toml.example` 复制：

```bash
cp wrangler.toml.example wrangler.toml
```

编辑 `wrangler.toml`，填入：
- `database_id`（步骤1获取的）
- `REFRESH_TOKEN`（自定义密钥）
- `FRONTEND_ORIGIN`（前端域名，可先留空）

> ⚠️ `wrangler.toml` 包含敏感信息，已加入 `.gitignore`，请勿提交。

#### 3. 构建前端

```bash
cd frontend
npm install
npm run build
```

#### 4. 部署 Workers（前后端一起）

```bash
cd ..
npx wrangler deploy --name renaiss-scanner
```

部署会包含：
- 后端 API（worker.js）
- 前端静态资源（frontend/dist/）

部署完成后访问：
```
https://renaiss-scanner.renaiss-tool-689931.workers.dev
```

#### 5. 配置自定义域名（可选）

在 Cloudflare Dashboard：
- Workers → Settings → Triggers → Add Custom Domain

## 数据库表结构

**renaiss_cards** — 卡牌数据

| 字段 | 类型 | 说明 |
|---|---|---|
| token_id | TEXT PK | 区块链 Token ID |
| serial | TEXT | 序列号（如 "#001"） |
| serial_num | INTEGER | 数字序列号（用于排序和连号判断） |
| name | TEXT | 卡牌名称 |
| is_listed | INTEGER | 是否在售 |
| ask_price | REAL | 挂单价 (USD) |
| fmv | REAL | Fair Market Value (USD) |
| image_url | TEXT | 卡牌图片 URL |
| ... | | 其他字段见代码 |

**scan_status** — 同步状态（单行表）
**api_cache** — 预计算配对缓存

## 性能优化

- 配对计算每 10 分钟只执行一次，结果写入 `api_cache` 表
- API 读取预计算结果，避免全表扫描
- 使用 `env.DB.batch()` 合并多次查询

## 致谢

感谢 **Cloudflare** 提供的资源支持。

## License

MIT