# LaborAny 产品与系统设计（v0.3.0）

> 更新时间：2026-02-11
> 适用版本：LaborAny v0.3.0

---

## 0. 文档目标

本文档用于统一 `v0.3.0` 的产品语义、交互状态机与工程实现，保证：

- 研发、设计、运营使用同一套术语。
- README、前端行为、后端路由一致。
- 后续版本迭代有明确基线。

---

## 1. 产品定位

LaborAny 是“AI 劳动力平台”的桌面实现：

- 用户通过自然语言描述任务。
- 系统自动分发到最合适的能力（Skill / Composite Skill）。
- 任务执行中可持续追问、预览产物、保存记忆、复用流程。

### 1.1 v0.3.0 的产品主线

1. 首页从聊天入口升级为“任务分发器”。
2. 能力模型统一为 Skill / Composite Skill。
3. 执行内核统一为 Claude Code CLI + SSE 协议。
4. 补齐生产可用能力：断线重连、通知、计划审核、记忆管理。

---

## 2. 术语与语义收口

### 2.1 统一术语

- **Skill**：单步能力。
- **Composite Skill**：多步能力，本质仍是 skill（通过 `steps.yaml` 定义）。
- **Capability**：前后端抽象层，对外能力统称。
- **Home Dispatcher**：首页对话分发器。
- **General Assistant**：不绑定单一 skill 的通用执行模式。

### 2.2 兼容说明

- 历史上出现过 `workflow` 语义。
- v0.3.0 不再新增 workflow 入口，仅保留旧动作兼容映射。

参见：`LEGACY_COMPAT_NOTES.md`

---

## 3. 用户旅程（主路径）

### 3.1 首页分发主流程

1. 用户在首页输入任务。
2. Converse 服务产出动作（推荐/创建/通用执行/定时）。
3. 前端根据动作进入确认、计划审核或执行态。
4. 执行阶段进入统一 `ExecutionPanel`。
5. 产物在右侧文件树与中间预览区呈现。

### 3.2 四条核心路径

1. **已选能力直达**：用户显式选择 skill，直接跳 `execute`。
2. **自动匹配并确认**：展示候选能力卡片，用户确认后执行。
3. **创建能力闭环**：进入 `skill-creator`，创建并安装后自动跳转执行。
4. **通用助手兜底**：无匹配或用户拒绝，走 `execute_generic`。

---

## 4. 首页分发状态机（实现对齐）

前端 `HomePage` 中定义的实际状态：

- `idle`
- `analyzing`
- `candidate_found`
- `plan_review`
- `creating_proposal`
- `creating_confirm`
- `installing`
- `routing`
- `executing`
- `fallback_general`
- `done`
- `error`

### 4.1 关键转移

1. `idle -> analyzing`：提交自然语言任务。
2. `analyzing -> candidate_found`：收到 `recommend_capability` / `create_capability`。
3. `analyzing -> plan_review`：收到带 `planSteps` 的 `execute_generic`。
4. `analyzing -> fallback_general`：收到空计划通用执行。
5. `candidate_found -> routing`：确认使用能力。
6. `candidate_found -> fallback_general`：拒绝候选能力。
7. `plan_review -> executing`：用户批准计划。
8. `executing -> done`：执行终态。
9. 任意状态 `-> error`：异常。

### 4.2 对话动作协议

Converse 动作：

- `recommend_capability`
- `execute_generic`
- `create_capability`
- `setup_schedule`

其中：

- `recommend_capability` 只允许 `targetType = skill`。
- `create_capability` 只允许 `mode = skill`。

---

## 5. 系统架构

```text
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React + Vite)                                     │
│  - Home Dispatcher UI                                       │
│  - ExecutionPanel（三栏执行视图）                            │
└───────────────┬───────────────────────────────┬─────────────┘
                │ /api                           │ /agent-api
                ▼                                ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ src-api (Hono, :3620)        │     │ agent-service (Express,:3002)│
│ - auth/config/session/skill  │     │ - converse / execute         │
│ - runtime / file / preview   │     │ - capabilities / cron / memory│
│ - sandbox providers          │     │ - task manager / notifications│
└───────────────┬──────────────┘     └───────────────┬──────────────┘
                │                                    │
                └────────────── shared ──────────────┘
                           (skill-loader / naming)
```

---

## 6. 技术栈与职责

### 6.1 前端

- React 18 + TypeScript + Vite
- React Router
- 三类核心 Hook：`useConverse` / `useAgent` / `useCron`

### 6.2 API 层（src-api）

- Hono + sql.js + jose
- 负责认证、配置、技能元数据、历史会话、文件服务、预览、沙盒
- 代理 `/agent-api/*` 到 agent-service，并做健康检查缓存

### 6.3 Agent 层（agent-service）

- Express + Claude Agent SDK
- 负责分发对话、执行流、cron 与 memory

### 6.4 Shared

- `skill-loader`：Skill/Composite 的统一加载
- `capability-naming`：能力 ID 生成、规范化、去重

---

## 7. 模块设计

### 7.1 Skill 系统

#### 目录约定

```text
skills/<skill-id>/
├── SKILL.md
├── steps.yaml        # 可选，存在则为 composite
├── scripts/
├── references/
└── assets/
```

#### 加载策略

- 内置目录（只读）+ 用户目录（可写）双源合并。
- 用户目录优先覆盖同 ID 内置能力。
- `steps.yaml` 存在即标记为 `kind: composite`。

#### 命名策略

- 名称会归一化为 ASCII slug。
- 冲突时自动追加后缀（`-2`, `-3`...）。

### 7.2 首页分发（Converse）

Converse 是“决策层”而非执行层：

- 输入：历史消息 + 能力目录 + 记忆片段。
- 输出：SSE 文本 + `LABORANY_ACTION` 或结构化问题。
- 约束：未确认前不应输出执行动作。

### 7.3 统一执行（Runtime）

执行入口在 `src-api`，运行控制在 runtime task manager：

- 支持运行态持久化（session + messages）。
- 支持断线重连（attach SSE）。
- 支持复合技能步骤事件上报。

### 7.4 三栏执行体验（ExecutionPanel）

- 左栏：消息流 + 输入 + 问答卡。
- 中栏：文档/媒体/代码预览 + Live Preview。
- 右栏：文件树与产物选择。

### 7.5 定时任务（Cron）

- 调度类型：`at` / `every` / `cron`
- 目标统一为 `skill`
- 支持手动触发、执行历史、通知推送、邮件测试。

### 7.6 记忆系统（Memory）

三层信息面板：

- `BOSS.md`：全局规则。
- `Profile`：用户画像（偏好、行为特征）。
- `Archive`：MemCell/Episode 档案与聚类。

补充详设见：`MEMORY_DESIGN.md`

---

## 8. API 分层（按职责）

### 8.1 src-api（`/api/*`）

- `/api/auth/*`
- `/api/setup/*`
- `/api/config/*`
- `/api/skill/*`
- `/api/sessions/*`
- `/api/task/*` 与 `/api/tasks/*`
- `/api/files/*`
- `/api/preview/*`
- `/api/sandbox/*`

### 8.2 agent-service（`/agent-api/*` 代理）

- `/agent-api/converse`
- `/agent-api/execute`
- `/agent-api/capabilities/*`
- `/agent-api/cron/*`
- `/agent-api/notifications/*`
- `/agent-api/memory/*` 与 `/agent-api/boss`

---

## 9. SSE 事件契约（v0.3.0）

前端已消费的关键事件：

- `session`
- `text`
- `tool_use`
- `tool_result`
- `question`
- `error`
- `pipeline_start`
- `step_start`
- `step_done`
- `step_error`
- `pipeline_done`
- `created_capability`
- `stopped`
- `aborted`
- `done`

设计要求：

- 事件必须幂等可重放。
- `done` 为最终终态信号。
- 非致命中止需区分 `stopped/aborted/error`。

---

## 10. 数据与存储

### 10.1 会话数据库

`src-api` 使用 `sql.js` 存储：

- `users`
- `sessions`
- `messages`
- `files`

### 10.2 任务产物

- 开发：仓库 `tasks/`
- 打包：用户目录下 `data/tasks`

### 10.3 记忆数据

- 开发：仓库 `data/memory`
- 打包：用户目录下 `data/memory`

### 10.4 用户 Skill

- 内置 Skill：应用 resources（只读）
- 用户 Skill：系统用户目录 `.../LaborAny/skills`

---

## 11. 交互设计原则

### 11.1 决策可见

- 匹配理由、置信度、计划步骤对用户透明。

### 11.2 用户控制权

- 候选能力必须确认。
- 计划执行前必须审核。
- 定时任务创建前必须确认。

### 11.3 可恢复

- 页面离开后任务持续执行。
- 回到页面可 attach 回流。

### 11.4 渐进式复杂度

- 首页先给“任务入口”，复杂配置放进专页（技能/定时/记忆/设置）。

---

## 12. 非功能要求

### 12.1 稳定性

- API 侧对 agent 服务做健康检查缓存与 503 友好降级。

### 12.2 安全

- 基础 JWT 认证（桌面单用户场景）。
- 文件访问限制在任务目录，阻止路径穿越。

### 12.3 可观测

- 运行任务列表。
- 通知中心。
- 记忆质量统计接口。

---

## 13. v0.3.0 已知边界

1. 官方 Skill 市场仍为占位（桌面版未开放在线安装）。
2. 仍保留历史 workflow 兼容映射，不作为产品主路径。
3. 多用户权限模型为轻量实现，当前更偏本地单用户体验。

---

## 14. 后续路线建议（v0.3.x -> v0.4）

1. 完整上线官方市场（签名、版本、依赖）。
2. 将能力调用可视化（通用助手中展示“调用了哪些 skill”）。
3. 细化分发模型评估指标（匹配通过率、兜底率、创建复用率）。
4. 增强沙盒策略与执行配额控制。
5. 完整化会话协作能力（多会话上下文编排）。

---

## 15. 附录：关键文档映射

- `README.md`：外部使用与快速上手。
- `HOMEPAGE_DISPATCH_SPEC.md`：首页分发交互规范。
- `MEMORY_DESIGN.md`：记忆系统详细设计。
- `LEGACY_COMPAT_NOTES.md`：兼容层说明。

