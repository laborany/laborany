# LaborAny 记忆系统设计（v0.3.0）

> 更新时间：2026-02-11
> 适配版本：LaborAny v0.3.0

---

## 1. 设计目标

LaborAny 的记忆系统不是“聊天日志备份”，而是服务任务执行的工作记忆层。

目标：

1. 让 Agent 记住长期偏好与上下文。
2. 降低重复澄清、重复犯错。
3. 在“自动学习”与“污染风险”之间保持平衡。

---

## 2. 核心理念

### 2.1 Boss-Employee 协作模型

- `BOSS.md` 定义全局规则和工作风格。
- 记忆系统用于补充“动态事实”，不是替代规则手册。

### 2.2 三层记忆架构

`v0.3.0` 实际采用：

1. **MemCell（原子记忆）**：每轮对话提炼的最小事实单元。
2. **Episode（情节记忆）**：将近期 MemCell 聚类成主题片段。
3. **Profile（用户画像）**：稳定偏好与行为模式。

同时维护：

- Global/Skill 长期记忆（Markdown）。
- Daily 记忆（按日归档）。

---

## 3. 数据结构

### 3.1 MemCell

字段重点：

- `id`
- `timestamp`
- `skillId`
- `summary`
- `messages[]`
- `facts[]`（`type/confidence/source/intent/content`）

### 3.2 Episode

字段重点：

- `id`
- `subject`
- `summary`
- `cellIds[]`
- `keyFacts[]`

### 3.3 Profile

字段重点：

- 分节（偏好、工作方式、沟通风格等）
- 每个字段带 evidence 证据链
- 可生成 profile summary 注入 prompt

---

## 4. 存储分层

### 4.1 文件层

- `BOSS.md`
- `MEMORY.md`（global）
- `memory/skills/<skill-id>/MEMORY.md`
- `memory/global/<date>.md`
- `memory/skills/<skill-id>/daily/<date>.md`

### 4.2 结构化层

- `MemCell` 存储目录
- `Episode` 存储目录
- `Profile` 存储目录
- `trace` 日志（用于质量审计）

---

## 5. 读路径（检索注入）

`MemoryInjector` 的上下文构建顺序（按优先级）：

1. `BOSS.md`
2. Profile summary
3. 全局长期记忆
4. 当前技能长期记忆
5. 最近全局日记忆
6. 最近技能日记忆
7. 检索到的相关记忆片段（hybrid）

注入规则：

- 受 token budget 控制。
- 高优先内容可截断但尽量保留。
- 检索结果去重后拼接。

---

## 6. 写路径（抽取入库）

`MemoryOrchestrator.extractAndUpsert` 的主流程：

1. 清洗 user/assistant 文本，去除流程脚手架噪音。
2. 优先尝试 `MemoryCliExtractor`（Claude CLI）提取 summary + facts。
3. 失败则 fallback（regex）。
4. 过滤高噪声 facts（pipeline、模板、结构化垃圾）。
5. 写入 MemCell。
6. 对 user facts 进行分类并 upsert Profile。
7. 追加 daily 记忆（skill 与可选 global）。
8. 候选入池并按策略提升到长期记忆。
9. 写 trace 日志，记录写入统计和冲突处理。

---

## 7. 质量防污染策略（v0.3.0）

### 7.1 Source 约束

facts 来源：

- `user`
- `assistant`
- `event`

优先保留 `user` 事实，`assistant` 更多用于辅助解释，不直接提升长期记忆。

### 7.2 噪声过滤

过滤模式包括：

- pipeline 脚手架字段
- 待确认/暂定语句
- 工具调用残留
- 大段结构化内容（JSON/HTML/模板变量）

### 7.3 长期写入门控

- 先进入候选池，再按可信度和证据数提升。
- 自动写入与候选入池分离计数，便于审计。

### 7.4 冲突处理

Profile upsert 支持冲突策略记录：

- `keep_old`
- `use_new`
- `merge`

所有冲突写入 trace。

---

## 8. 检索策略

Memory Search 支持混合检索：

- BM25
- TF-IDF
- RRF 融合

检索目标：在预算内给模型提供“高相关、低冗余”的记忆片段。

---

## 9. API 设计（agent-service）

主要路由：

- `GET /boss` / `PUT /boss`
- `GET /memory/cells`
- `GET /memory/episodes`
- `POST /memory/cluster-episodes`
- 其他 memory 统计、检索、归纳接口

前端页面 `/memory` 三标签对应：

1. 工作手册（BOSS.md）
2. 我的画像（Profile）
3. 记忆档案（MemCell/Episode）

---

## 10. 与执行链路的集成点

### 10.1 执行前

- 构建 system prompt 时注入记忆上下文。

### 10.2 执行后

- 由 orchestrator 从用户输入与助手输出提取记忆。
- 写入结构化与 Markdown 双层存储。

### 10.3 Converse 分发场景

- converse prompt 可注入用户记忆，提升匹配与追问质量。

---

## 11. 可观测与运维

### 11.1 Trace

记录：

- 抽取方式（cli / regex）
- 事实过滤结果
- 写入计数（cells/profile/longTerm/episodes）
- candidate 入池量
- 冲突策略

### 11.2 质量指标建议

1. `filteredFacts / totalFacts`（噪声过滤率）
2. `autoWriteRate`（自动写入比例）
3. 候选池积压规模
4. 画像冲突率

---

## 12. 风险与边界

1. LLM 抽取不稳定：保留 fallback + trace 校验。
2. 自动写入过强会污染长期记忆：通过候选池和阈值缓冲。
3. 多技能场景上下文泄漏风险：按 scope 控制注入顺序与预算。

---

## 13. 后续演进建议

1. 增加“记忆审阅”工作流（人审后提升长期记忆）。
2. 引入 per-user/per-project 的隔离命名空间。
3. 记忆命中效果评估（对分发准确率和执行成功率的提升）。
4. 完整可视化 trace 工具，支持回放一次记忆写入链路。

