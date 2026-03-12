<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="LaborAny Logo" />
</p>

<h3 align="center">LaborAny — 桌面 AI 工作台</h3>

<p align="center">
  像招聘数字员工一样使用 AI：技能驱动、意图分发、记忆感知。
</p>

<p align="center">
  <a href="#why-laborany">为什么选 LaborAny</a> ·
  <a href="#whats-new-in-v040">v0.4.0 更新</a> ·
  <a href="#architecture">架构</a> ·
  <a href="#quick-start">快速开始</a> ·
  <a href="#feature-overview">功能速览</a> ·
  <a href="#acknowledgments">致谢</a> ·
  <a href="#license--contributing">许可与贡献</a> ·
  <a href="https://mp.weixin.qq.com/s/wKO2Alkng_JwFcnstolEzw">免费获取API-Key</a>
</p>

---

## Why LaborAny

AI 模型能力越来越强，但普通用户很难稳定地调度和复用它们。LaborAny 把 AI 能力封装为「技能」，让非开发者也能像管理员工一样管理 AI 劳动力。

设计亮点：

- 技能驱动 — 不是聊天优先，而是任务优先。每个技能是一个可复用的工作单元。
- 意图分发 — 首页输入自然语言，系统自动识别意图并匹配最合适的技能执行。
- 记忆感知 — 跨会话上下文记忆，AI 能记住你的偏好和工作习惯。

核心能力：

- 24 内置技能（文档、写作、数据、研究、运营等）
- 智能意图分发（自然语言 → 意图识别 → 候选确认 → 执行）
- 飞书 Bot 远程触发（通过飞书消息远程执行任务，流式卡片回传结果）
- QQ Bot 远程触发（通过 QQ 消息远程执行任务，当前支持 C2C 私聊）
- 丰富文件预览（PDF / DOCX / XLSX / PPTX / 图片 / 音视频 / 代码等）
- 对话式技能创建（用自然语言描述需求，自动生成新技能）
- 定时调度（支持 at / every / cron 三种模式）
- 全局记忆系统（称呼、回复偏好、用户画像、长期记忆、审计与候选确认）
- 跨平台桌面应用（Windows / macOS / Linux）
- 本地运行，数据不离开你的电脑

---

## What's New in v0.4.0

本次版本重点收敛在「记忆链路可用性」：

- 称呼记忆升级：用户指定名字后，后续对话与元问题会优先按名字称呼，不再默认回落到“老板”。
- 回复偏好升级：支持自动学习默认回复语言、简洁/详细偏好，并把“先给结论再展开步骤”归一为稳定沟通偏好。
- 长期记忆升级：稳定偏好支持从画像进入候选，再自动写入技能级/全局长期记忆，并清理已解决候选。
- 质量可见性升级：`/memory` 页面新增长期记忆统计、候选确认/忽略、审计回填与状态查看。
- 验证体系升级：新增快路径回归和真实 UI 回归，覆盖“称呼 + 长期记忆”联动场景。

详细说明见 `docs/memory-design.md:1` 和 `docs/news/v0.4.0.md:1`。

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                       Electron Shell                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Frontend (React + Vite :3000)                  │  │
│  └─────────┬──────────────────────────────┬───────────────────┘  │
│            │ /api/*                       │ /agent-api/*          │
│  ┌─────────▼───────────────┐  ┌──────────▼────────────────────┐  │
│  │  src-api (Hono)         │  │  agent-service (Express)       │  │
│  │  :3620                  │  │  :3002                         │  │
│  │  认证 / 配置 / 技能      │  │  分发 / 执行 / 定时 / 记忆     │  │
│  │  会话 / 文件 / 预览      │  │  ┌────────────┬─────────────┐ │  │
│  └─────────────────────────┘  │  │ Feishu Bot │  Cron Timer  │ │  │
│                                │  │ (WebSocket)│  (动态调度)   │ │  │
│                                │  │  QQ Bot    │              │ │  │
│                                │  │ (WebSocket)│              │ │  │
│                                │  └────────────┴─────────────┘ │  │
│                                └──────────┬────────────────────┘  │
│                                           │                       │
│                                ┌──────────▼────────────────────┐  │
│                                │     Claude Code CLI            │  │
│                                └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

        ┌──────────────┐
        │  飞书客户端    │──── WebSocket ────→ agent-service (Feishu Bot)
        └──────────────┘

        ┌──────────────┐
        │  QQ 客户端     │──── WebSocket ────→ agent-service (QQ Bot)
        └──────────────┘
```

- Frontend：React SPA，负责交互与预览渲染
- src-api：统一 REST API 层，管理认证、配置、技能、会话、文件、预览
- agent-service：AI 执行引擎，负责意图分发、技能执行、定时调度、记忆归纳
- Feishu Bot：飞书远程触发入口，通过 WebSocket 接收消息，复用 converse + execute 链路
- QQ Bot：QQ 远程触发入口，当前支持 C2C 私聊消息，复用 converse + execute 链路
- Cron Timer：动态定时调度，事件驱动，精确唤醒
- Claude Code CLI：底层 AI 运行时，所有执行最终通过 CLI 完成

> 详细设计文档见 [docs/](docs/) 目录。

---

## Quick Start

### 下载安装（终端用户）

前往 [GitHub Releases](https://github.com/laborany/laborany/releases) 下载对应平台安装包：

- Windows：`.exe` 安装程序
- macOS：`.dmg` 镜像
- Linux：`.AppImage` 或 `.deb`

首次运行：进入设置页填写 API Key → 回到首页输入任务即可开始。

### 本地开发（贡献者）

环境要求：Node.js >= 22.12.0

```bash
git clone https://github.com/laborany/laborany.git
cd laborany
cp .env.example .env        # 编辑 .env 填入 ANTHROPIC_API_KEY
npm run install:all
npm run dev
```

访问 `http://localhost:3000`。

常用验证命令：

```bash
# 记忆快路径与隔离环境校验
npm run verify:memory-fastpaths

# 真实 UI 记忆回归（本地拉起隔离 API + Agent + 前端）
npm run verify:memory-ui-real
```

### 打包桌面应用

```bash
# Windows
npm run build:electron

# macOS
npm run build:electron:mac

# Linux
npm run build:electron:linux
```

构建产物输出到 `release/` 目录。

---

## Feature Overview

### 首页分发器

在首页输入自然语言描述你的需求，系统自动完成：

1. 意图识别 — 理解你想做什么
2. 候选匹配 — 从技能库中找到最合适的技能
3. 确认执行 — 确认后进入统一执行面板

支持四种动作：推荐技能、通用执行、创建新技能、设置定时任务。

### 技能体系

LaborAny 的能力以「技能」为单位组织，支持两种获取方式：

- **对话式创建**：访问 `/create` 页面，用对话方式描述你需要的能力，系统自动生成完整的技能目录。
- **引入外部技能**：将技能目录复制到用户技能目录即可，系统自动检测并注册。

技能目录结构：

```text
skills/my-skill/
├── SKILL.md         # 主提示词（必须）
├── steps.yaml       # 复合技能步骤（可选）
├── scripts/         # 工具脚本（可选）
├── references/      # 参考资料（可选）
└── assets/          # 资源文件（可选）
```

### 飞书 Bot 集成

通过飞书消息远程触发 LaborAny 任务，执行结果以流式卡片实时回传；也支持直接在飞书里创建定时任务，并在任务执行完成后主动把结果推送回创建者私聊。

能力概览：

- 智能路由 — 复用 converse 意图分发，自动匹配最合适的技能
- 流式卡片 — 基于 CardKit schema 2.0，实时展示执行过程
- 文件支持 — 支持图片、文档、音视频等文件的接收与产物回传
- 定时任务 — 支持自然语言或 `/cron` 命令创建 `cron / at / every` 三类调度
- 命令系统 — `/skill`、`/skills`、`/cron`、`/new`、`/stop`、`/help`

关键环境变量：

```
FEISHU_ENABLED=true
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_ALLOW_USERS=ou_xxx,ou_yyy   # 可选，空=全部允许
FEISHU_DOMAIN=feishu                # feishu 或 lark
```

> 详细规范见 [docs/feishu-bot-spec.md](docs/feishu-bot-spec.md)。

### QQ Bot 集成

通过 QQ 消息远程触发 LaborAny 任务，当前仅支持 C2C 私聊场景。

能力概览：

- 智能路由 — 复用 converse 意图分发，自动匹配最合适的技能
- 流式消息 — 使用多条消息实时展示执行过程
- 文件支持 — 支持图片、文件的接收与产物回传
- 命令系统 — `/skill`、`/skills`、`/new`、`/stop`、`/help`、`/model`、`/cron`
- 私聊优先 — 当前仅启用 C2C 私聊链路（更稳定）

注册与接入：

1. 在 QQ 开放平台创建 Bot 应用，获取 `AppID` 与 `AppSecret`（推荐）。
2. 在 LaborAny 设置页 `QQ Bot` 分组中填写配置并保存。
3. 启动后用 QQ 私聊机器人，先发送 `/help` 验证连接。

配置项（`.env` 或设置页）：

```
QQ_ENABLED=true
QQ_APP_ID=your-qq-app-id
QQ_APP_SECRET=your-qq-app-secret   # 推荐，支持自动换取访问令牌
QQ_BOT_TOKEN=your-qq-bot-token     # 可选（与 QQ_APP_SECRET 二选一）
QQ_ALLOW_USERS=user1,user2         # 可选，空=全部允许
QQ_SANDBOX=false                   # 是否使用沙箱环境
QQ_REQUIRE_ALLOWLIST=false         # 为 true 时白名单不能为空
QQ_BOT_NAME=LaborAny
QQ_DEFAULT_SKILL=__generic__
```

常用命令：

- `/help` 查看帮助
- `/new` 重置会话
- `/skills` 查看技能列表
- `/skill <id> [query]` 指定技能执行
- `/model [name|id]` 查看或切换默认模型
- `/cron help` 查看定时任务命令
- `/stop` 中止当前任务

> 详细规范见 [docs/qq-bot-spec.md](docs/qq-bot-spec.md)。

### 定时调度

支持三种调度模式：

- `at` — 指定时间点执行一次
- `every` — 按固定间隔重复执行
- `cron` — 标准 cron 表达式

特性：动态定时器（事件驱动，精确唤醒）、手动触发、执行历史、通知推送。定时任务既可在桌面端创建，也可在飞书 Bot 中通过自然语言或 `/cron` 命令创建；飞书创建的任务默认将结果推送到创建者的飞书私聊。

### 记忆系统

三层记忆架构：

- **MemCell（原子记忆）** — 每轮对话提炼的最小事实单元
- **Episode（情节记忆）** — 将近期 MemCell 聚类成主题片段
- **Profile（用户画像）** — 稳定偏好与行为模式

`v0.4.0` 额外提供：

- **称呼记忆**：支持自动/手动维护用户偏好称呼。
- **默认回复偏好**：支持语言、简洁度，以及“结论先行”这类稳定沟通结构偏好。
- **长期记忆候选池**：稳定事实先入候选，再按证据和置信度自动提升。
- **长期记忆审计**：支持查看近期决策日志、无决策摘要和历史回填。

前端 `/memory` 页面提供三面板管理：工作手册（`BOSS.md`）、我的画像（Profile）、记忆档案（长期记忆 / 候选 / 审计 / MemCell / Episode）。

### 文件预览

统一执行面板中栏支持丰富的文件预览：

- 文档：PDF / DOCX / XLSX / PPTX / Markdown
- 媒体：图片（PNG/JPG/GIF/SVG）/ 音频 / 视频
- 代码：语法高亮预览

> 更多细节见 [docs/](docs/) 目录。

---

## 如何获取 API-Key？
- **免费**！**最强模型**！请参考 👉[API Key 获取和配置教程](https://mp.weixin.qq.com/s/wKO2Alkng_JwFcnstolEzw).

---

## Acknowledgments

- [Claude Code](https://github.com/anthropics/claude-code) — Anthropic 官方 CLI
- [Codex](https://github.com/openai/codex) — OpenAI 编码引擎
- [WorkAny](https://github.com/workany-ai/workany) — AI 工作流平台
- [OpenClaw](https://github.com/openclaw/openclaw) — 开源智能体框架
- [EverMemOS](https://github.com/EverMind-AI/EverMemOS) — 记忆操作系统

---

## License & Contributing

本项目基于 [MIT License](LICENSE) 开源。

欢迎贡献：

- 提交 [Issue](https://github.com/laborany/laborany/issues) 报告问题或建议
- 发起 [Pull Request](https://github.com/laborany/laborany/pulls) 贡献代码
- 创建并分享你的自定义技能
