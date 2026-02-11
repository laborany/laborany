# LaborAny 首页分发规范（v0.3.0）

> 本文档定义首页对话分发器在 `v0.3.0` 的产品语义、状态机和前后端契约。

---

## 1. 目标

首页是 LaborAny 的“任务入口”和“路由中枢”，不直接等同于普通聊天。

它的职责是：

1. 理解用户意图。
2. 在“已有能力 / 创建能力 / 通用执行 / 定时任务”中做分发。
3. 在执行前给用户足够确认与可解释信息。

---

## 2. 术语

- **Skill**：单步能力。
- **Composite Skill**：多步能力（仍属于 skill 体系）。
- **Capability**：统一抽象名词，当前只映射到 skill/composite。
- **Home Dispatcher**：首页分发器。
- **General Assistant**：通用执行模式，可按需调用能力。

---

## 3. 核心原则

1. **分发先于执行**：首页先判定“去哪执行”。
2. **确认优先**：匹配推荐必须经用户确认。
3. **可解释**：推荐结果需包含理由和置信度。
4. **可兜底**：服务异常或无匹配时可退到通用执行。
5. **闭环创建**：无法匹配时可创建能力并自动进入执行。

---

## 4. 状态机（实现对齐）

前端 `HomePage` 的状态：

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

### 4.1 状态说明

- `idle`：等待输入。
- `analyzing`：与 converse 交互中。
- `candidate_found`：候选能力确认卡。
- `plan_review`：通用执行计划审核。
- `creating_*`：创建能力阶段（含问答确认）。
- `installing`：创建后安装与跳转准备。
- `executing`：进入统一执行面板。
- `fallback_general`：通用助手执行，显示兜底提示。
- `done`：本次执行完成。
- `error`：异常态。

### 4.2 关键转移

1. `idle -> analyzing`：用户提交任务。
2. `analyzing -> candidate_found`：收到推荐/创建动作。
3. `analyzing -> plan_review`：收到含 `planSteps` 的通用执行动作。
4. `candidate_found -> routing`：用户确认使用候选。
5. `candidate_found -> fallback_general`：用户拒绝候选。
6. `plan_review -> executing`：用户批准计划。
7. `executing -> done`：收到执行终态。
8. 任意状态 `-> error`：执行异常。

---

## 5. Converse 动作契约

Converse 可输出的动作：

1. `recommend_capability`
2. `execute_generic`
3. `create_capability`
4. `setup_schedule`

### 5.1 recommend_capability

必填字段：

- `action = recommend_capability`
- `targetId`
- `query`

推荐字段：

- `confidence`（0~1）
- `matchType`（`exact | candidate`）
- `reason`

约束：

- 目标类型固定为 skill 体系。

### 5.2 execute_generic

字段：

- `action = execute_generic`
- `query`
- `planSteps?: string[]`

行为：

- `planSteps` 非空：进入 `plan_review`。
- 为空：直接进入通用执行。

### 5.3 create_capability

字段：

- `action = create_capability`
- `seedQuery`

行为：

- 进入 `skill-creator` 执行链。

### 5.4 setup_schedule

字段：

- `action = setup_schedule`
- `cronExpr`
- `targetId`
- `targetQuery`
- `tz?`
- `name?`

行为：

- 先展示是否创建定时任务的确认决策。
- 确认后进入可编辑 `CronSetupCard` 再提交。

---

## 6. 问答与澄清协议

当信息不足时，Converse 可输出结构化 `question` 事件（AskUserQuestion 语义）：

- 支持多题。
- 每题支持候选选项与说明。
- 前端用 `QuestionInput` 收集答案并继续同会话。

设计要求：

- 优先提最少问题（减少决策摩擦）。
- 问题文案聚焦“可执行输入”，避免开放式空泛追问。

---

## 7. UI 规范

### 7.1 首页输入区

- 明确“任务入口”定位。
- 支持快速场景卡片 + 对话输入协同。

### 7.2 候选确认卡（`CandidateConfirmView`）

展示：

- 目标能力名
- 匹配理由
- 匹配类型
- 置信度（百分比）

操作：

- `使用这个能力`
- `不使用`

### 7.3 计划审核面板（`PlanReviewPanel`）

展示：

- `planSteps` 顺序清单

操作：

- `批准执行`
- `修改计划`
- `取消`

### 7.4 通用执行提示（`FallbackBanner`）

在 `fallback_general` 状态展示横幅，提示当前是“通用助手模式”。

### 7.5 错误态（`ErrorView`）

统一按钮：

- `重试`
- `返回首页`

---

## 8. 创建能力闭环

流程：

1. 用户在首页触发 `create_capability`。
2. 进入 `skill-creator` 执行。
3. 执行中可能产生结构化追问（进入 `creating_confirm`）。
4. 成功后触发 `created_capability` 事件。
5. 前端进入 `installing` -> `routing`。
6. 自动跳转到 `/execute/:newSkillId`，并带原始 query。

实现要求：

- 新能力 ID 必须做规范化与冲突处理。
- 创建失败需可回退首页继续分发。

---

## 9. 定时任务分发规则

当识别到明确时间触发意图时：

1. Converse 产出 `setup_schedule`。
2. 前端展示 `DecisionCard`，先确认“是否创建”。
3. 确认后显示 `CronSetupCard`，允许调整调度、名称、时区。
4. 最终写入 `/agent-api/cron/jobs`。

---

## 10. 异常与降级

1. converse 请求失败：提示并切换 `execute_generic` 兜底动作。
2. agent-service 不可用：由 API 代理返回 503 + `retryAfter`。
3. 创建/安装失败：进入 `error`，保留重新开始能力。
4. 路由失败：回到首页，不丢失用户输入上下文。

---

## 11. 指标建议

### 11.1 分发质量

- 首次分发命中率。
- 候选确认通过率。
- 兜底通用执行比例。

### 11.2 创建闭环

- 建议创建转化率。
- 创建成功率。
- 新能力二次复用率。

### 11.3 任务效率

- 从首页输入到执行启动耗时。
- 追问轮次均值。

---

## 12. 验收清单（v0.3.0）

- 首页四条路径全部可走通：直达、候选确认、创建闭环、兜底通用。
- 所有对外文案不再暴露独立 workflow 概念。
- `recommend_capability / execute_generic / create_capability / setup_schedule` 动作可稳定驱动 UI。
- 计划审核、候选确认、定时确认都要求用户显式操作。

