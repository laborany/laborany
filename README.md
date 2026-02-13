<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="LaborAny Logo" />
</p>

<h3 align="center">LaborAny — 桌面 AI 工作台</h3>

<p align="center">
  像招聘数字员工一样使用 AI：技能驱动、意图分发、记忆感知。
</p>

<p align="center">
  <a href="#why-laborany">为什么选 LaborAny</a> ·
  <a href="#architecture">架构</a> ·
  <a href="#quick-start">快速开始</a> ·
  <a href="#feature-overview">功能速览</a> ·
  <a href="#acknowledgments">致谢</a> ·
  <a href="#license--contributing">许可与贡献</a>
</p>

---

## Why LaborAny

AI 模型能力越来越强，但普通用户很难稳定地调度和复用它们。LaborAny 把 AI 能力封装为「技能」，让非开发者也能像管理员工一样管理 AI 劳动力。

设计亮点：

- 技能驱动 — 不是聊天优先，而是任务优先。每个技能是一个可复用的工作单元。
- 意图分发 — 首页输入自然语言，系统自动识别意图并匹配最合适的技能执行。
- 记忆感知 — 跨会话上下文记忆，AI 能记住你的偏好和工作习惯。

核心能力：

- 25+ 内置技能（翻译、写作、数据分析、代码生成、文档转换等）
- 智能意图分发（自然语言 → 意图识别 → 候选确认 → 执行）
- 对话式技能创建（用自然语言描述需求，自动生成新技能）
- 定时调度（支持 at / every / cron 三种模式）
- 全局记忆系统（用户画像、工作手册、记忆档案）
- 跨平台桌面应用（Windows / macOS / Linux）
- 本地运行，数据不离开你的电脑

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    Electron Shell                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Frontend (React + Vite :3000)            │  │
│  └──────────┬────────────────────────┬───────────────┘  │
│             │ /api/*                 │ /agent-api/*      │
│  ┌──────────▼──────────┐  ┌─────────▼────────────────┐  │
│  │  src-api (Hono)     │  │  agent-service (Express)  │  │
│  │  :3620              │  │  :3002                    │  │
│  │  认证 / 配置 / 技能  │  │  分发 / 执行 / 定时 / 记忆 │  │
│  └─────────────────────┘  └──────────┬───────────────┘  │
│                                      │                   │
│                           ┌──────────▼───────────────┐  │
│                           │   Claude Code CLI         │  │
│                           └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- Frontend：React SPA，负责交互与预览渲染
- src-api：统一 REST API 层，管理认证、配置、技能、会话、文件
- agent-service：AI 执行引擎，负责意图分发、技能执行、定时调度、记忆归纳
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

环境要求：Node.js >= 20

```bash
git clone https://github.com/laborany/laborany.git
cd laborany
cp .env.example .env        # 编辑 .env 填入 ANTHROPIC_API_KEY
npm run install:all
npm run dev
```

访问 `http://localhost:3000`。

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

### 技能创建

访问 `/create` 页面，用对话方式描述你需要的能力，系统自动生成完整的技能目录。

### 引入外部技能

将技能目录复制到用户技能目录即可，系统会自动检测并注册。

技能目录结构：

```text
skills/my-skill/
├── SKILL.md         # 主提示词（必须）
├── steps.yaml       # 复合技能步骤（可选）
├── scripts/         # 工具脚本（可选）
├── references/      # 参考资料（可选）
└── assets/          # 资源文件（可选）
```

> 更多细节见 [docs/](docs/) 目录。

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