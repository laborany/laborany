<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="LaborAny Logo" />
</p>

<h3 align="center">LaborAny — 老板的数字员工公司</h3>

<p align="center">
  把 AI 当成一支可管理、可调度、可追踪的数字员工团队：个人助理接需求，员工执行任务，日历自动排班，远程 Bot 和通知负责回传结果。
</p>

<p align="center">
  <a href="#why-laborany">为什么选 LaborAny</a> ·
  <a href="#whats-new-in-v053">v0.5.3 更新</a> ·
  <a href="#product-workflow">产品工作流</a> ·
  <a href="#architecture">架构</a> ·
  <a href="#quick-start">快速开始</a> ·
  <a href="#feature-overview">功能速览</a> ·
  <a href="#remote-bots">远程 Bot</a> ·
  <a href="#build--release">打包与发版</a> ·
  <a href="#acknowledgments">致谢</a> ·
  <a href="#license--contributing">许可与贡献</a> ·
  <a href="https://mp.weixin.qq.com/s/wKO2Alkng_JwFcnstolEzw">免费获取API-Key</a>
</p>

<p align="center">
  <a href="https://mp.weixin.qq.com/s/jBbg1PzLJo5DjAWZ3N2b1g">
    <img src="https://img.shields.io/badge/微信公众号-@Agent极客岛-07C160?style=flat-square&logo=wechat&logoColor=white" alt="微信公众号">
  </a>
  <a href="https://www.xiaohongshu.com/user/profile/60c762c4000000000101d8b8">
    <img src="https://img.shields.io/badge/小红书-@问小乖-FF2442?style=flat-square" alt="小红书">
  </a>
</p>

---

## Why LaborAny

LaborAny 不是把 AI 做成一个更花哨的聊天框，而是把它做成一套“可以像管理员工一样管理”的桌面工作系统。

设计亮点：

- 公司化工作台：首页是老板办公桌，技能页是员工通讯录，定时页是日历排班，历史页是工作记录。
- 技能驱动执行：每个技能对应一个可复用的岗位能力，而不是一次性 prompt。
- 工作可追踪：每次执行都会沉淀为 work record，支持继续、回看、恢复上下文。
- 模型可控制：支持模型档案、员工级模型绑定、对话级推理强度切换。
- 本地优先：桌面端运行，技能、记忆、文件、工作记录默认留在本机。

当前核心能力：

- 26 个内置岗位技能 + 1 个个人助理入口，覆盖文档、研究、数据、内容、办公、多媒体等场景
- 首页自然语言分发，支持推荐技能、直接执行、创建新技能、创建定时任务
- 高置信度任务可自动执行，低置信度任务先给候选再确认
- 技能通讯录支持查看物料结构、编辑技能文件、给员工绑定默认模型
- 工作记录支持 work 级历史、状态追踪、负责人/阶段信息、继续执行快照
- 定时任务支持 `at / every / cron`，并可额外送达到应用内、邮箱、飞书、QQ、微信
- 网页研究 Runtime 支持搜索、静态抓取、浏览器增强和 Chrome 授权诊断
- 远程 Bot 支持飞书、QQ、微信私聊触发，结果流式回传
- 统一执行面板支持富文件预览、内联 Widget、生成式 UI
- 记忆系统覆盖称呼、回复偏好、长期记忆候选、画像与审计
- 设置页支持 MCP 工具扩展、研究浏览器配置、远程集成配置

---

## What's New in v0.5.3

`v0.5.3` 重点补齐了“模型控制 + 定时送达”两条链路：

- 推理强度配置：在首页、对话、继续执行等路径支持 `low / medium / high` 推理强度，执行链路会把配置透传到实际运行时。
- 员工级模型绑定：可以在技能通讯录里为每位员工绑定默认模型档案；若任务显式指定模型，则优先使用本次指定值。
- 定时任务送达增强：定时任务除了应用内通知，还可额外送达到邮箱、飞书私聊、QQ 私聊、微信私聊。
- 送达状态可见：日历表单会直接展示各通道的可用性、缺失配置和当前解析到的接收对象，减少“创建成功但收不到结果”的情况。
- 通知链路更稳：远程接收对象支持自动修复和更细粒度的错误日志，异常时会回落到应用内通知中心。

`v0.5.x` 这条主线已经落地的关键升级：

- 公司化工作台：首页·办公桌、技能·通讯录、日历·定时任务、工作记录、老板档案已形成统一产品语言。
- 网页研究 Runtime：桌面版已内置搜索 + 静态抓取 + Chrome CDP 增强模式，并提供授权诊断。
- 工作记录体系：从 session 视角升级到 work 视角，支持恢复最新上下文、查看轻量 resume snapshot 和工作详情。
- 微信 Bot：已完成扫码绑定、文本/图片/文件输入、产物回传和基础 `/cron` 管理。

相关设计文档：

- [docs/homepage-dispatch-spec.md](docs/homepage-dispatch-spec.md)
- [docs/rfc-web-research-runtime.md](docs/rfc-web-research-runtime.md)
- [docs/wechat-bot-spec.md](docs/wechat-bot-spec.md)
- [docs/feishu-bot-spec.md](docs/feishu-bot-spec.md)
- [docs/qq-bot-spec.md](docs/qq-bot-spec.md)

---

## Product Workflow

1. 老板在首页把任务交给个人助理。
2. 个人助理识别意图，选择直接处理、安排给某位员工，或创建新员工/日历安排。
3. 执行面板实时展示消息流、步骤进展、文件、Widget 与产物预览。
4. 任务完成后沉淀为工作记录，可从历史继续执行、追问、回看文件与结果。
5. 定时任务和远程 Bot 会把结果推回通知中心、邮箱或原私聊通道。

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                        Electron Shell                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Frontend (React + Vite)                                   │  │
│  │ 首页 / 通讯录 / 日历 / 工作记录 / 记忆 / 设置               │  │
│  │ 执行面板 / 文件预览 / Widget / MCP UI                      │  │
│  └───────────────┬──────────────────────────────┬────────────┘  │
│                  │ /api/*                       │ /agent-api/*   │
│  ┌───────────────▼───────────────┐  ┌──────────▼──────────────┐ │
│  │ src-api (Hono)                │  │ agent-service (Express) │ │
│  │ 认证 / 配置 / 技能 / 文件      │  │ 分发 / 执行 / cron / 记忆 │ │
│  │ 预览 / 模型档案 / MCP / work   │  │ 通知 / 远程 Bot / 研究   │ │
│  └───────────────────────────────┘  └──────────┬──────────────┘ │
│                                                 │                │
│                          ┌──────────────────────▼─────────────┐  │
│                          │ Claude Code CLI Runtime            │  │
│                          │ Web Research Runtime               │  │
│                          │ Feishu / QQ / WeChat Bot           │  │
│                          └────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

补充说明：

- `skills/` 目录是能力资产层，官方技能和用户技能都以文件夹组织。
- `shared/` 负责模型配置、显示名、技能元信息等跨进程共享逻辑。
- 桌面打包时会把前端、API、Agent、技能、研究 runtime 和 CLI 运行时一起封装。

---

## Quick Start

### 下载安装

前往 [GitHub Releases](https://github.com/laborany/laborany/releases) 下载对应平台安装包：

- Windows：`.exe`
- macOS Intel：`.dmg`
- macOS Apple Silicon：`.dmg`
- Linux：`.AppImage` / `.deb`

首次运行建议按这个顺序配置：

1. 在设置页填写 `ANTHROPIC_API_KEY`
2. 按需创建模型档案，设置默认模型和推理强度
3. 如需网页研究增强，在设置页连接当前 Chrome 会话
4. 如需远程触发，再配置飞书 / QQ / 微信 / 邮箱通知

### 本地开发

环境要求：Node.js `>= 22.12.0`

```bash
git clone https://github.com/laborany/laborany.git
cd laborany
cp .env.example .env
npm run install:all
npm run dev
```

访问 `http://localhost:3000`。

常用验证命令：

```bash
npm run verify:memory-fastpaths
npm run verify:memory-ui-real
npm run verify:converse-ui-real
npm run verify:converse-widget-real
npm run verify:execute-widget-real
npm run verify:remote-bot-flow
npm run verify:wechat-media
```

---

## Feature Overview

### 首页·办公桌

首页把传统“聊天首页”改造成了老板办公桌：

- 个人助理是默认对话对象，先理解需求，再决定直接处理还是安排给员工
- 支持文字输入、拖拽上传、图片粘贴、多文件附件
- 输入框可直接切换模型档案和推理强度
- 对高置信任务支持自动执行，减少确认弹窗

### 技能·通讯录

技能页不只是技能列表，而是员工通讯录：

- 每位技能都有显示名、岗位描述、标签和能力定位
- 可查看技能物料结构，直接阅读/编辑 `SKILL.md`、脚本、参考资料等文件
- 可为员工绑定默认模型档案，形成“岗位默认模型”
- 支持对话式创建新技能，也支持引入外部技能目录

技能目录结构：

```text
skills/my-skill/
├── SKILL.md         # 主提示词（必须）
├── steps.yaml       # 复合技能步骤（可选）
├── scripts/         # 工具脚本（可选）
├── references/      # 参考资料（可选）
└── assets/          # 资源文件（可选）
```

### 日历·定时任务

定时页已经从简单 cron 列表升级成“排班面板”：

- 支持 `at / every / cron` 三种调度模式
- 创建任务时可直接指定负责员工、执行内容和模型档案
- 支持送达到应用内、邮箱、飞书私聊、QQ 私聊、微信私聊
- 远程 Bot 创建的定时任务，会优先把结果推回原私聊通道
- 应用内提供通知中心、未读数和后台任务指示器

邮件送达依赖以下配置：

```bash
NOTIFICATION_EMAIL=your@email.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-smtp-password
```

### 工作记录与通知中心

当前版本的执行链路已经是 work-first：

- 侧边栏可直接搜索和打开工作记录
- 工作详情支持查看标题、负责人、阶段、状态和最近进展
- 历史页会优先恢复该 work 的最新 session，上下文更稳定
- 完成、失败和定时执行结果会进入通知中心，可一键跳转详情

### 网页研究 Runtime

桌面端已经内置完整网页研究底座：

- `full`：搜索 + 静态抓取 + 浏览器增强
- `api`：搜索 + 静态抓取
- `degraded`：仅静态抓取

研究浏览器能力：

- 复用当前 Chrome 会话，不强制启动独立浏览器
- 支持打开 `chrome://inspect/#remote-debugging` 做授权
- 设置页可查看连接状态、候选站点模式、搜索测试、页面读取测试
- 打包桌面版时会一起封装研究 sidecar 和内置站点知识

更多说明见 [docs/rfc-web-research-runtime.md](docs/rfc-web-research-runtime.md)。

### 记忆、MCP 与文件预览

- `/memory` 页面提供 `BOSS.md`、画像、长期记忆、候选、审计、MemCell、Episode 管理
- 设置页支持配置用户 MCP Server，并把配置注入 Claude CLI 运行时
- 统一执行面板支持 Markdown、HTML、代码、PDF、DOCX、XLSX、PPTX、图片、音视频等预览
- 生成式 Widget 与内联界面已经接入执行流，可用于更强的结果展示

记忆设计文档见 [docs/memory-design.md](docs/memory-design.md)，生成式界面说明见 [docs/generative-ui-rfc.md](docs/generative-ui-rfc.md)。

---

## Remote Bots

### 微信 Bot

- 通过官方 ClawBot / iLink 协议接入微信私聊
- 支持设置页扫码绑定，也支持 `WECHAT_BOT_TOKEN` 手工覆盖
- 支持文本、图片、文件输入和任务产物回传
- 支持 `/skill`、`/skills`、`/cron`、`/new`、`/stop`、`/help`、`/model`、`/home`

详细规范见 [docs/wechat-bot-spec.md](docs/wechat-bot-spec.md)。

### 飞书 Bot

- 通过消息卡片流式回传执行过程和结果
- 支持文件回传、定时任务创建和完成后主动 DM 通知
- 支持 `/skill`、`/skills`、`/cron`、`/new`、`/stop`、`/help`

详细规范见 [docs/feishu-bot-spec.md](docs/feishu-bot-spec.md)。

### QQ Bot

- 当前聚焦 C2C 私聊场景
- 支持文本流式回传、文件回传、技能执行和定时任务
- 支持 `/skill`、`/skills`、`/cron`、`/new`、`/stop`、`/help`、`/model`

详细规范见 [docs/qq-bot-spec.md](docs/qq-bot-spec.md)。

基础环境变量示例见 [.env.example](.env.example)。

---

## Build & Release

### 本地打包

```bash
# Windows
npm run build:electron

# macOS Intel / x64
npm run build:electron:mac

# macOS Apple Silicon
npm run build:electron:mac-arm64

# Linux
npm run build:electron:linux
```

构建产物输出到 `release/`。

### GitHub Actions 发版

仓库内置了 [`.github/workflows/build.yml`](.github/workflows/build.yml)：

- `push` `v*` tag 后自动触发
- CI 会根据 tag 自动同步版本号
- 自动构建 Windows、macOS x64、macOS arm64、Linux 安装包
- 自动创建或更新 GitHub Release 并上传构建产物

示例：

```bash
git tag v0.5.3
git push origin v0.5.3
```

---

## 如何获取 API-Key？

- 免费获取与配置教程：<https://mp.weixin.qq.com/s/wKO2Alkng_JwFcnstolEzw>

---

## 关注我们

欢迎加入我们的社交媒体群聊，获取最新动态和使用技巧：

<p align="center">
  <img src="docs/assets/wechat-qr.png" width="150" alt="微信公众号二维码">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/assets/xiaohongshu-qr.jpg" width="150" alt="小红书二维码">
</p>

<p align="center">
  <em>扫码加入微信（左）和小红书（右）</em>
</p>

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
