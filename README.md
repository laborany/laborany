# LaborAny v0.3.0

> 让不会编程的人，也能稳定调度和复用 AI 劳动力。

LaborAny 是一个面向桌面场景的 AI Agent 工作台。`v0.3.0` 的核心升级是：

- 首页从“普通聊天”升级为**分发中枢**（意图识别 → 候选确认 → 执行/创建/定时）。
- 能力模型统一为 **Skill / Composite Skill**，不再把 `workflow` 作为独立产品概念。
- 执行链路统一到 **Claude Code CLI**，前后端围绕同一运行时协议（SSE 事件）协作。
- 新增更完整的运行态体验：计划审核、断线重连、运行中任务、通知中心、记忆管理。

---

## v0.3.0 重点变化

### 1) 首页分发器（Home Dispatcher）

首页输入不再直接“盲执行”，而是先走分发状态机：

1. `analyzing`：理解意图
2. `candidate_found`：发现候选能力并确认
3. `plan_review`：通用执行前审核计划
4. `creating_proposal` / `creating_confirm`：创建能力闭环
5. `executing` / `fallback_general`：进入统一执行面板

支持 4 类动作（由 `/agent-api/converse` 决策输出）：

- `recommend_capability`
- `execute_generic`
- `create_capability`
- `setup_schedule`

### 2) 语义统一：Skill / Composite Skill

- `skill`：单步能力。
- `composite`：多步编排能力（通过 `steps.yaml` 定义）。
- 对外统一称“能力（Capability）”，但底层仍以 `skill` 目录存储。

### 3) 统一执行内核

- 所有执行最终由 `agent-service` 调用 Claude Code CLI 完成。
- 前端通过 SSE 消费统一事件流：`text`、`tool_use`、`question`、`step_*`、`done` 等。

### 4) 全局工作记忆体系

新增「记忆管理」页面，支持：

- `BOSS.md`（全局工作手册）编辑。
- 用户画像（Profile）查看。
- 记忆档案（MemCell / Episode）浏览与聚合。

---

## 系统架构

```text
Frontend (React + Vite, dev:3000)
    │
    ├─ /api/*        -> src-api (Hono, :3620)
    └─ /agent-api/*  -> agent-service (Express, :3002)

src-api
  - 认证、配置、Skill 管理、会话历史
  - Runtime 任务管理与断线重连入口
  - 文件系统 / 预览 / 转换 / 沙盒 Provider
  - 生产模式下托管前端静态资源

agent-service
  - converse（首页分发对话）
  - execute / capabilities 执行协议
  - cron 定时任务与通知
  - memory 记忆读写与归纳
```

---

## 功能地图（UI）

- `/` 首页：任务分发 + 快速场景 + 通用执行入口。
- `/execute/:skillId`：统一执行面板（三栏：对话 / 预览 / 文件树）。
- `/skills`：能力库（我的能力 / 官方市场占位 / 创建入口）。
- `/create`：对话式招聘新员工（skill-creator 闭环）。
- `/cron`：定时任务配置、手动触发、执行历史。
- `/history`：会话列表与详情（支持继续对话、产物预览、Live Preview）。
- `/memory`：工作手册、画像、记忆档案。
- `/settings`：环境配置、通知邮箱配置、测试邮件。

---

## 快速开始（开发）

### 环境要求

- Node.js `>= 20`（推荐 `20.18+`）
- npm `>= 9`

### 1) 安装依赖

```bash
npm run install:all
```

### 2) 配置环境变量

```bash
cp .env.example .env
```

最少需要：

```env
ANTHROPIC_API_KEY=your-api-key-here
PORT=3620
AGENT_PORT=3002
```

### 3) 启动开发环境

```bash
npm run dev
```

默认会拉起：

- `src-api`：`http://localhost:3620`
- `agent-service`：`http://localhost:3002`
- `frontend`：`http://localhost:3000`

访问：`http://localhost:3000`

---

## 配置项说明

常用配置在 `.env.example` 与设置页模板中维护：

- `ANTHROPIC_API_KEY`：必填。
- `ANTHROPIC_BASE_URL`：可选，自定义网关。
- `ANTHROPIC_MODEL`：可选，默认 `claude-sonnet-4-20250514`。
- `LABORANY_SECRET_KEY`：JWT 签名密钥。
- `NOTIFICATION_EMAIL` / `SMTP_*`：定时任务邮件通知。

> 打包后配置文件会写入系统用户目录（而不是仓库目录）。

---

## 目录结构（v0.3.0）

```text
laborany/
├── frontend/              # React 前端
├── src-api/               # 统一 API（Hono）
├── agent-service/         # Agent 执行与分发服务（Express）
├── shared/                # Skill 加载器与命名规则等共享模块
├── skills/                # 内置 Skills（只读）
├── data/                  # 开发模式数据目录
├── tasks/                 # 任务产出目录（开发模式）
├── docs/
│   └── ai_labor_platform_v1.md
├── HOMEPAGE_DISPATCH_SPEC.md
└── MEMORY_DESIGN.md
```

---

## Skill 开发模型

### Skill 目录格式

```text
skills/my-skill/
├── SKILL.md              # 主提示词（必须）
├── steps.yaml            # 复合技能步骤（可选）
├── scripts/              # 工具脚本（可选）
├── references/           # 参考资料（可选）
└── assets/               # 资源文件（可选）
```

### 关键约束

- 有 `steps.yaml` 时会被识别为 `composite`。
- 创建出来的新 Skill 会写入用户技能目录，并在运行后自动检测与注册。
- 新能力 ID 会做规范化（小写、连字符、冲突去重）。

---

## Runtime 与 SSE 协议（核心）

前端 `useAgent` / `useConverse` 统一消费 SSE 事件流，关键事件包括：

- `session`：会话 ID 建立。
- `text`：模型文本输出增量。
- `tool_use` / `tool_result`：工具调用过程。
- `question`：结构化追问（AskUserQuestion）。
- `pipeline_start` / `step_start` / `step_done` / `pipeline_done`：复合技能进度。
- `created_capability`：创建能力成功（自动跳转执行）。
- `done` / `error` / `aborted` / `stopped`：终态事件。

---

## 预览与产物能力

`ExecutionPanel` 与历史详情页支持：

- 文本/Markdown/代码预览。
- 文档预览（PDF / DOCX / PPTX / XLSX 等）。
- 媒体预览（图片 / 音频 / 视频 / 字体）。
- Live Preview（Vite 预览服务）。
- LibreOffice 按需下载与 Office→PDF 转换。

---

## 定时任务与通知

定时任务接口由 `agent-service` 提供，支持：

- `at` / `every` / `cron` 三种调度。
- 手动触发、执行历史、状态追踪。
- 通知中心（未读统计、已读管理）。
- 邮件通知测试接口。

---

## 打包与发布

### 桌面应用构建

- Windows：`npm run build:electron`
- macOS：`npm run build:electron:mac`
- Linux：`npm run build:electron:linux`

构建产物在 `release/`。

---

## 已知说明

- `官方市场` 当前在桌面版是占位能力：`/api/skill/official` 返回空列表，在线安装接口返回 `501`。
- 仍保留少量 legacy 兼容（例如旧 `workflow` 动作映射），详见 `LEGACY_COMPAT_NOTES.md`。

---

## 相关文档

- 产品与系统设计：`docs/ai_labor_platform_v1.md`
- 首页分发规范：`HOMEPAGE_DISPATCH_SPEC.md`
- 记忆系统设计：`MEMORY_DESIGN.md`
- 兼容说明：`LEGACY_COMPAT_NOTES.md`

---

## License

MIT

