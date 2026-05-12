
# 🔍 Renaiss Scanner (连号猎手)

<p align="left">
  <img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite_D1-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>

> **全自动化 Web3 连号卡牌扫描器。** 实时监控 [Renaiss Marketplace](https://www.renaiss.xyz) 在售卡牌，自动发现**连号且双卡均在售**的高价值组合，为您捕捉极具潜力的链上收藏与套利机会。

<div align="center">
  
**[👉 立即注册 Renaiss (邀请链接)](https://www.renaiss.xyz/ref/blueskyone)** | **[🐦 Follow @blueskylh1](https://twitter.com/intent/user?screen_name=blueskylh1)** | **[📖 使用教程](https://x.com/blueskylh1/status/2044281808297308586)** | **[🌐 直达已部署网站](https://renaiss-tool-689931.napa.de5.net/)**

</div>

---

![Demo](screenshot.png)

## ✨ 核心特性 (Features)

- **🔗 连号对发现**：自动扫描整个市场，精准匹配序列号相邻且同时挂单的两张卡牌。
- **🚨 捡漏高亮标记**：智能比对，当挂单价低于 FMV (公允市场价值) 超过 $10 时自动高亮预警。
- **📊 FMV 实时展示**：每张卡牌直观展示 Fair Market Value，盈亏空间一目了然。
- **⚡ 一键极速购买**：直连 Renaiss 对应卡牌页面，抢占套利先机。
- **🖼️ 高清图片检视**：支持点击卡牌图片弹出灯箱查看超清大图。
- **🌍 国际化支持 (i18n)**：内置简体中文、繁体中文、English、日本語、한국어。
- **⏱️ 自动化引擎**：依托 Cron Triggers，每 10 分钟自动全量同步最新市场数据。

---

## 🛠️ 技术栈 (Tech Stack)

| 层级 | 技术选型 | 说明 |
|---|---|---|
| **后端 API** | Cloudflare Workers | 边缘计算，极低延迟 |
| **前端静态** | Workers Assets | 内置于 Workers 的静态资源托管 |
| **数据库** | Cloudflare D1 (SQLite) | 原生边缘数据库 |
| **定时任务** | Workers Cron Triggers | `*/10 * * * *` 自动调度 |
| **前端框架** | React 19 + Vite | 最新一代高性能渲染 |
| **UI 库** | Tailwind CSS 4 + shadcn/ui | 现代化原子级样式与无头组件 |

---

## 📂 项目结构 (Project Structure)

```text
renaiss-scanner/
├── backend/
│   ├── worker.js          # Workers 入口：API + 前端静态资源
│   ├── db/schema.js       # D1 建表语句（内嵌在 worker.js）
│   ├── package.json
│   └── scripts/           # 开发辅助脚本
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConsecutiveScanner.tsx   # 主页面组件
│   │   │   └── ui/                      # shadcn/ui 组件
│   │   ├── lib/
│   │   │   ├── api.ts                   # API 地址构造
│   │   │   ├── i18n.ts                  # 多语言系统
│   │   │   └── locales/                 # 翻译文件 (zh-CN, zh-TW, en, ja, ko)
│   │   └── App.tsx
│   ├── public/            # 静态资源 (logo, avatar)
│   ├── .env               # API 地址配置
│   └── package.json
├── wrangler.toml          # Workers 配置（敏感信息，不提交）
├── wrangler.toml.example  # 配置模板（可提交）
└── README.md

```

---

## 🔌 API 端点 (API Endpoints)

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/scanner` | GET | 获取连号对列表（支持分页），例如 `?page=1&pageSize=10` |
| `/api/scanner/status` | GET | 获取当前同步状态（进度、上次同步时间、总卡牌量） |
| `/api/scanner/refresh` | POST | 手动触发全量同步（Header 需携带鉴权 `x-refresh-token`） |
| `/api/health` | GET | 系统健康检查 |

---

## 💻 本地开发 (Local Development)

### 后端（Workers 本地模拟）

依赖 Wrangler CLI 进行本地 D1 数据库模拟与接口调试：

```bash
cd backend
npm install
npm run dev    # 启动 wrangler dev 模拟环境

```

### 前端

```bash
cd frontend
npm install

# 配置 API 地址
cp .env.example .env
# 编辑 .env 设置 VITE_API_BASE 为本地后端地址

npm run dev

```

---

## 🚀 部署到 Cloudflare (Deployment)

### 前置准备

1. 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
2. 全局安装 Wrangler CLI 并登录：
```bash
npm install -g wrangler
wrangler login

```



### 部署步骤

**1. 创建 D1 数据库**

```bash
npx wrangler d1 create renaiss-scanner

```

*(请复制并在下一步使用返回的 `database_id`)*

**2. 配置部署环境**

```bash
cp wrangler.toml.example wrangler.toml

```

编辑 `wrangler.toml`，填入：

* `database_id`（步骤 1 获取的值）
* `REFRESH_TOKEN`（自定义的安全密钥）
* `FRONTEND_ORIGIN`（前端域名，首次部署可先留空）

> ⚠️ **注意:** `wrangler.toml` 包含敏感信息，已加入 `.gitignore`，请勿将其提交到公开仓库。

**3. 构建前端产物**

```bash
cd frontend
npm install
npm run build

```

**4. 部署至边缘网络 (Edge)**

```bash
cd ..
npx wrangler deploy --name renaiss-scanner

```

*部署将同时包含后端 API (`worker.js`) 与前端静态资源 (`frontend/dist/`)。*
部署完成后，您可以通过类似 `https://renaiss-scanner.<your-subdomain>.workers.dev` 的地址访问。

**5. 配置自定义域名（可选）**
登录 Cloudflare Dashboard：**Workers & Pages** → 选择服务 → **Settings** → **Triggers** → **Add Custom Domain**。

---

## 🗄️ 数据库表结构 (Database Schema)

**`renaiss_cards` (卡牌数据)**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `token_id` | TEXT PK | 区块链 Token ID |
| `serial` | TEXT | 序列号（如 "#001"） |
| `serial_num` | INTEGER | 数字序列号（用于排序和连号逻辑判断） |
| `name` | TEXT | 卡牌名称 |
| `is_listed` | INTEGER | 是否在售状态标识 |
| `ask_price` | REAL | 挂单价 (USD) |
| `fmv` | REAL | Fair Market Value (USD) |
| `image_url` | TEXT | 卡牌高清图片 URL |

**`scan_status`** — 同步状态监控（单行表）

**`api_cache`** — 预计算配对缓存结果表

---

## ⚡ 性能优化核心 (Performance Optimizations)

* **缓存预计算 (Pre-computation)**：配对计算仅在每 10 分钟定时任务触发时执行一次，结果直接固化写入 `api_cache` 表。
* **O(1) 接口响应**：API 直接读取预计算的缓存结果，彻底避免高并发下的全表扫描与复杂的 JOIN 计算。
* **批处理 (Batching)**：深度利用 `env.DB.batch()` 接口，将多次查询合并为单次网络请求，最大化 D1 数据库效能。

---

## 🙏 致谢与许可 (Credits & License)

特别感谢 **Cloudflare** 为独立开发者提供的卓越 Serverless 基础设施与网络资源支持。

**License:** [MIT](https://www.google.com/search?q=LICENSE)

```

