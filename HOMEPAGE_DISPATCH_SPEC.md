# LaborAny 首页分发与复合技能语义规范（V1）

## 1. 目标

统一 LaborAny 的核心语义：

- `workflow` 不再作为独立产品概念。
- 所有能力统一为 `skill`，其中多步骤编排能力归类为 `composite skill`。
- 首页对话框的职责是 **意图理解 + 分发决策**，最终执行始终由 **Claude Code CLI** 完成。

---

## 2. 统一术语

- **Skill**：单能力单元，可直接执行。
- **Composite Skill**：多步骤技能，本质仍是 skill，只是带 `steps`。
- **Capability**：前后端统一抽象，当前仅包含 skill/composite。
- **首页分发器（Home Dispatcher）**：首页输入框背后的决策层。
- **通用助手（General Assistant）**：不绑定单一 skill 的执行模式，但可按需调用已有 skill/composite。

> 设计约束：对外展示尽量使用“技能 / 复合技能”，避免再暴露 workflow 文案。

---

## 3. 核心原则

1. **单一执行内核**：所有执行都由 Claude Code CLI 驱动。
2. **分发先于执行**：首页先决定“去哪执行”，再进入对应会话。
3. **用户确认优先**：匹配不确定时，必须先确认。
4. **明确意图可直达**：用户已明确指定目标 skill/composite 时直接跳转。
5. **创建能力闭环**：匹配不到时，引导创建 skill/composite，并自动安装后进入会话。

---

## 4. 首页分发状态机

## 4.1 状态定义

- `idle`：等待用户输入。
- `analyzing`：分析意图（调用 converse 决策）。
- `candidate_found`：找到候选 skill/composite，等待确认。
- `creating_proposal`：进入 skill-creator 方案草拟阶段。
- `creating_confirm`：向用户确认“这样构建是否符合要求”。
- `installing`：创建后安装到 LaborAny。
- `routing`：跳转到目标会话页。
- `fallback_general`：切到通用助手。
- `error`：异常处理。

## 4.2 事件定义

- `USER_SUBMIT`
- `INTENT_ANALYZED`
- `USER_CONFIRM_YES`
- `USER_CONFIRM_NO`
- `CREATE_PLAN_READY`
- `CREATE_PLAN_REJECT`
- `CREATE_DONE`
- `INSTALL_DONE`
- `ROUTE_DONE`
- `FAILED`

## 4.3 转移规则（简化）

1. `idle --USER_SUBMIT--> analyzing`
2. `analyzing --明确指定 skill/composite--> routing`
3. `analyzing --匹配到候选且置信度>=阈值--> candidate_found`
4. `candidate_found --USER_CONFIRM_YES--> routing`
5. `candidate_found --USER_CONFIRM_NO--> fallback_general`
6. `analyzing --匹配失败且建议创建--> creating_proposal`
7. `creating_proposal --CREATE_PLAN_READY--> creating_confirm`
8. `creating_confirm --USER_CONFIRM_YES--> installing`
9. `installing --INSTALL_DONE--> routing`
10. `creating_confirm --USER_CONFIRM_NO--> fallback_general`
11. `任意状态 --FAILED--> error`

---

## 5. 首页分发决策规则

## 5.1 显式选择优先

当用户已选择目标（skill/composite 卡片、下拉、快捷入口）时：

- 直接路由到对应会话。
- 首页不再做二次猜测。

## 5.2 未选择时的匹配策略

建议输出结构：

- `matchType`: `exact | candidate | none`
- `targetType`: 固定 `skill`
- `targetId`: 候选能力 ID
- `confidence`: 0~1
- `reason`: 可解释原因（关键词、历史偏好、最近使用）

建议阈值：

- `>= 0.80`：直接给推荐并请求确认。
- `0.50 ~ 0.79`：给多个候选，强制确认。
- `< 0.50`：视为无匹配，进入创建或通用助手分支。

## 5.3 创建触发策略

满足以下任意条件可建议创建 skill/composite：

- 无候选且用户需求明确。
- 有候选但用户连续拒绝。
- 用户明确表达“新建一个能力/流程来做”。

---

## 6. 创建闭环（skill-creator）

流程：

1. 将用户任务作为 `seedQuery` 交给 `skill-creator`。
2. Claude Code CLI 生成能力草案（步骤、输入、输出、工具）。
3. 向用户确认草案是否符合要求。
4. 用户确认后落盘创建 skill/composite。
5. 自动安装到 LaborAny（刷新 capability 列表）。
6. 跳转到新能力会话，继续执行任务。

关键要求：

- 创建过程中对用户展示“当前阶段”（草拟/确认/安装）。
- 安装失败时提供“重试安装”和“转通用助手”两条兜底路径。

---

## 7. 通用助手定义

通用助手不是“无技能模式”，而是：

- 默认会话不绑定单 skill。
- 允许内部自动调用已有 skill/composite 完成子任务。
- 对用户可见“已调用哪些能力”。

体验上应与普通 Claude Code CLI 一致，但带有 LaborAny 能力目录感知。

---

## 8. 前后端契约建议

## 8.1 Converse 动作（建议保留）

- `recommend_capability`
- `create_capability`
- `execute_generic`
- `setup_schedule`

兼容动作（保留解析，不对外展示）：

- `navigate_skill`
- `navigate_workflow`（按 skill 兼容处理）

## 8.2 前端路由目标

- 目标 skill/composite：`/execute/:skillId`
- 创建入口：`/create`
- 通用助手：`/`（首页会话模式）或独立 `general` 会话（可选）

---

## 9. UI 行为规范

## 9.1 首页输入框

- 明确定位：这是“任务分发入口”。
- 对用户显示：当前是“已选目标”还是“自动匹配中”。

## 9.2 候选确认卡片

- 展示能力名称、类型（技能/复合技能）、匹配理由、置信度。
- 操作：`使用这个能力` / `不使用`。

## 9.3 创建确认卡片

- 展示拟创建能力结构（目标 + 步骤）。
- 操作：`按此创建` / `继续调整` / `不创建，走通用助手`。

---

## 10. 异常与兜底

- 匹配服务异常：直接回退通用助手。
- 创建失败：可重试，或回退通用助手。
- 安装失败：提供“仅保存草稿”和“重试安装”。
- 路由失败：回首页并保留上下文，不丢失输入。

---

## 11. 指标与验收

建议观察指标：

- 首页分发成功率（首次进入正确能力）。
- 用户确认通过率（候选匹配质量）。
- 新建能力转化率（建议创建 -> 成功安装）。
- 创建后复用率（新能力后续被再次调用次数）。
- 兜底率（回退通用助手比例）。

验收标准（V1）：

- UI 不再出现 workflow 独立入口。
- capability 统一走 skill/composite 语义。
- 首页可完整走通四条路径：
  - 已选直达
  - 自动匹配并确认
  - 创建并安装再跳转
  - 通用助手兜底

---

## 12. 实施建议（按优先级）

1. **P0**：完成术语收口（文案、注释、路由入口）。
2. **P0**：稳定 converse 动作与前端分发状态机。
3. **P1**：创建闭环中的“草案确认 + 安装反馈”可视化。
4. **P1**：通用助手的能力调用可见性（调了哪些 skill）。
5. **P2**：置信度策略迭代（历史行为 + 反馈学习）。

