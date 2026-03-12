# LaborAny 记忆系统设计（v0.4.0）

> 更新时间：2026-03-12
> 适配版本：LaborAny v0.4.0

---

## 1. 设计目标

LaborAny 的记忆系统不是“聊天记录备份”，而是服务分发、执行和长期协作的工作记忆层。

核心目标：

1. 记住稳定偏好，减少重复澄清。
2. 区分一次性任务指令与长期可复用事实，降低污染。
3. 让长期记忆写入过程可见、可审计、可回放。
4. 让称呼、回复偏好、用户画像、长期记忆在同一条链路里协同工作。

---

## 2. 核心原则

### 2.1 BOSS.md 是规则，记忆是动态事实

- `BOSS.md` 负责全局规则与工作方式约束。
- 记忆系统负责补充用户名字、沟通偏好、稳定项目上下文等动态事实。

### 2.2 模型优先，规则兜底

- 记忆抽取默认优先使用 Claude Code CLI。
- 对明显稳定且结构化的偏好（如称呼、语言、简洁/详细、结论先行）保留快路径和 fallback。
- 当 CLI 超时但 stdout 中已返回合法 JSON 时，系统会尽量抢救并使用该结果，而不是直接丢弃。

### 2.3 先画像，再候选，再长期

- 稳定用户事实先进入 Profile。
- 达到阈值后进入长期记忆候选池或直接写入长期记忆。
- 全部过程保留审计日志，支持 UI 查看和回填历史轨迹。

---

## 3. 记忆分层

### 3.1 MemCell（原子记忆）

每轮对话提炼出的最小结构化单元，核心字段：

- `id`
- `timestamp`
- `skillId`
- `summary`
- `messages[]`
- `facts[]`

`facts[]` 重点字段：

- `type`: `preference | fact | correction | context`
- `intent`: 支持 `response_style`
- `source`: `user | assistant | event`
- `confidence`
- `content`

### 3.2 Episode（情节记忆）

将近期 MemCell 聚类为主题片段，核心字段：

- `id`
- `subject`
- `summary`
- `cellIds[]`
- `keyFacts[]`

### 3.3 Profile（用户画像）

保存长期稳定的用户特征，并带证据链。默认分区：

- 工作偏好
- 沟通风格
- 技术栈
- 个人信息

### 3.4 Addressing（称呼记忆）

独立于普通画像字段维护，专门解决“以后怎么称呼用户”：

- 自动提取与手动设置并存
- 支持快路径与 CLI 判断
- 元问题（如“你现在叫我什么？”）直接走快回复

### 3.5 Communication Preferences（默认回复偏好）

独立维护：

- 默认回复语言：中文 / 英文
- 默认回复风格：简洁 / 详细

同时保留结构化沟通偏好：

- `结论优先`：统一归一为“偏好回复时先给出结论，再展开步骤和细节”

这类结构化偏好不会被错误折叠成 `replyStyle=detailed`。

### 3.6 Long-Term Memory（长期记忆）

分为两级：

- 全局长期记忆：`MEMORY.md`
- 技能长期记忆：`memory/skills/<skill-id>/MEMORY.md`

写入前先经过候选池与审计机制。

---

## 4. 存储结构

### 4.1 Markdown / 文件层

- `BOSS.md`
- `data/MEMORY.md`
- `data/memory/skills/<skill-id>/MEMORY.md`
- `data/memory/global/<date>.md`
- `data/memory/skills/<skill-id>/<date>.md`
- `data/memory/profiles/PROFILE.md`

### 4.2 结构化层

- `data/memory/profiles/addressing.json`
- `data/memory/profiles/communication-preferences.json`
- `data/memory/cells/...`
- `data/memory/episodes/...`
- `data/memory/consolidation-candidates.json`
- `data/memory/index/longterm-global.json`
- `data/memory/index/longterm-skills/<skill-id>.json`
- `data/memory/index/longterm-audit.jsonl`
- `data/memory/traces/...`

---

## 5. 读路径（上下文注入）

`MemoryOrchestrator.retrieve` 的注入顺序：

1. 称呼规则
2. Addressing 设置
3. 默认回复偏好
4. `BOSS.md`
5. Profile summary
6. 全局长期记忆
7. 当前技能长期记忆
8. 最近全局日记忆
9. 最近技能日记忆
10. Hybrid 检索出的相关记忆片段

注入原则：

- 受 token budget 控制
- 固定记忆优先
- 近期和相似片段按分桶配额补充
- 避免重复注入相同片段

---

## 6. 写路径（抽取入库）

`MemoryOrchestrator.extractAndUpsert` 的主流程：

1. 清洗用户输入和助手输出，去掉流程脚手架与模板噪声。
2. 调用 `MemoryCliExtractor` 抽取 `summary + facts + addressingUpdate`。
3. 若 CLI 失败：
   - 优先抢救 stdout 中的合法 JSON。
   - 再回退到稳定偏好快路径 / fallback 规则。
4. 过滤掉一次性任务指令、礼貌语、结构化垃圾和非用户中心事实。
5. 写入 MemCell。
6. 将稳定用户事实 upsert 到 Profile / Addressing / Communication Preferences。
7. 写入 daily 记忆。
8. 计算长期记忆分数：
   - 技能级候选 / 自动写入
   - 全局级候选 / 自动写入
9. 对未触发长期记忆决策的轮次写 `no_decision_summary` 审计。
10. 写 trace，记录抽取方式、写入数、冲突、候选入池数。

---

## 7. 防污染策略

### 7.1 一次性任务与长期偏好分离

系统会过滤以下内容，不让其污染 Profile / 长期记忆：

- “帮我调研 / 帮我生成 / 帮我测试”
- “今天临时改成英文回复”
- 测试指令、固定返回值指令
- 流程脚手架和工具日志

### 7.2 用户中心优先

优先保留：

- 用户自述事实
- 稳定回复偏好
- 称呼偏好
- 技术栈 / 个人信息

默认抑制：

- 助手礼貌语
- “老板 / sir / bro”等纯称呼噪声
- “你现在叫我什么？”这类元问题

### 7.3 结构化回复偏好归一

以下表达统一归为同一条稳定偏好：

- 先给结论再给步骤
- 先说结论再展开细节
- 结论先行

归一结果：

- key: `结论优先`
- description: `偏好回复时先给出结论，再展开步骤和细节`

### 7.4 手动设置优先

对于 Addressing 与默认回复偏好：

- 手动设置优先于自动学习
- 自动抽取不会覆盖手动值

---

## 8. 长期记忆提升策略

### 8.1 技能级长期记忆

适合：

- 当前技能反复出现的稳定偏好
- 当前技能场景下的沟通与工作习惯

### 8.2 全局长期记忆

适合：

- 跨场景稳定偏好
- 全局沟通规则
- 长期有效的工作方式

### 8.3 候选与自动写入

长期记忆有两种结果：

- 进入候选池，等待确认或继续积累证据
- 满足阈值后自动写入

`v0.4.0` 新增行为：

- 同一会话多轮表达会累计独立证据
- 技能级长期记忆写入成功后，沟通类全局长期记忆可快速同步升格
- 已自动写入的候选会自动清理，避免悬挂

---

## 9. 审计与可观测性

### 9.1 Trace

trace 记录：

- `retrieve`
- `extract`
- `upsert`
- `longterm_error`

用于定位：

- 抽取失败
- 候选未入池
- 长期记忆未写入
- 冲突决策不符合预期

### 9.2 Long-Term Audit

`longterm-audit.jsonl` 记录：

- `inserted`
- `updated`
- `superseded`
- `skipped`
- `no_decision_summary`

支持：

- 最近决策查看
- 历史 trace 回填
- 统计 accepted / rejected / superseded / noDecision

---

## 10. 前端与 API

### 10.1 `/memory` 页面

三个主标签：

1. 工作手册
2. 我的画像
3. 记忆档案

其中“记忆档案”页支持：

- 长期记忆状态
- 候选列表
- 单条确认 / 忽略
- 批量确认 / 忽略
- 审计日志
- 历史回填

### 10.2 主要接口

- `GET /addressing`
- `PUT /addressing`
- `DELETE /addressing`
- `GET /communication-preferences`
- `PUT /communication-preferences`
- `DELETE /communication-preferences`
- `GET /memory/stats`
- `GET /memory/longterm/stats`
- `GET /memory/longterm/audit`
- `POST /memory/longterm/audit/backfill`
- `GET /memory/consolidation-candidates`
- `POST /memory/consolidate`
- `POST /memory/reject-candidates`
- `GET /profile`

---

## 11. 与 converse / execute 链路的集成

### 11.1 执行链路

- 执行前：注入记忆上下文
- 执行后：从 user / assistant 文本抽取记忆，异步入库

### 11.2 converse 链路

首页对话支持两类记忆路径：

- 正常对话：执行完成后统一走记忆抽取
- 快回复路径：若消息中同时包含“称呼更新 + 稳定沟通偏好”，也会额外异步送入记忆队列，避免只更新称呼而丢掉长期偏好

---

## 12. 验证方式

推荐回归：

```bash
# 隔离环境下验证快路径、长期记忆与组合链路
npm run verify:memory-fastpaths

# 真实 UI 验证：首页聊天 -> 记忆页 -> 长期记忆/候选/审计
npm run verify:memory-ui-real
```

两组脚本都覆盖：

- 称呼更新
- 默认回复偏好更新
- 结论先行偏好归一
- 同一会话多轮长期记忆写入
- 称呼与长期记忆组合链路

---

## 13. 当前边界

1. LLM 抽取仍可能超时，但已有 salvage + fallback 双重兜底。
2. 长期记忆阈值仍是启发式策略，不是严格学习系统。
3. 全局与技能级提升阈值不同，设计上允许二者不同步一小段时间。

---

## 14. 后续建议

1. 为长期记忆补充按用户/项目的命名空间隔离。
2. 增加基于真实命中率的阈值评估，而不仅是启发式打分。
3. 为 `/memory` 页面补充 trace 回放视图。
4. 将 UI 回归纳入 CI 的可选 nightly 任务。
