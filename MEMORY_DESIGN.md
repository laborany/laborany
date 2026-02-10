# Laborany Memory System 完整设计方案

## 一、设计哲学

### Boss-Employee 模型

Laborany 是一个 AI Labor 平台：
- **用户 = Boss**：全局管理者，制定规范，纠正错误
- **Skills = Employees**：各司其职的数字员工，遵守规范，学习改进

### Memory 的本质

Memory 不是「数据库里的一行记录」，而是：
- **纯 Markdown 文件**（参考 OpenClaw 设计）
- **Boss 与数字员工团队之间关系的延续**
- **让员工「记住」Boss 的偏好和纠正**
- **让员工之间能够「通气」**
- **透明可编辑**：用户可以直接查看和编辑记忆文件

### 核心价值

1. **减少重复沟通**：Boss 不需要每次都解释偏好
2. **避免重复犯错**：纠正过的错误不会再犯
3. **跨 Skill 连贯**：不同员工之间能共享上下文
4. **透明可编辑**：用户可以直接查看和编辑记忆文件

---

## 二、Memory 文件结构（MD 文件为主）

```
laborany/
├── BOSS.md                           # 全局规范（公司制度）
├── MEMORY.md                         # 全局长期记忆（精选知识）
└── memory/
    ├── global/                       # 全局记忆（跨 Skill）
    │   ├── 2026-02-04.md            # 按日期的全局记忆
    │   ├── 2026-02-03.md
    │   └── ...
    └── skills/                       # Skill 级别记忆
        ├── stock-analyzer/
        │   ├── 2026-02-04.md        # 该 Skill 的每日记忆
        │   └── MEMORY.md            # 该 Skill 的长期记忆
        ├── financial-report/
        │   ├── 2026-02-04.md
        │   └── MEMORY.md
        └── ...
```

### 第一层：BOSS.md（全局规范）

**定位**：Boss 制定的「公司制度」，所有 Labor 必须遵守

**内容**：
- 基本原则（称呼、核心价值观）
- 沟通规范（语言、回复风格）
- 工作流程（任务开始/执行/完成）
- 质量标准（通用/文档/分析/创作）
- 学习与记忆（记住什么、如何记忆）
- 禁止事项
- 特别说明（动态补充）

**更新方式**：
- 用户直接编辑
- Labor 建议更新（需用户确认）

### 第二层：Memory（动态记忆）

**双层记忆系统**（参考 OpenClaw）：

1. **每日日志** `memory/global/YYYY-MM-DD.md` 或 `memory/skills/{skill-id}/YYYY-MM-DD.md`
   - 只增不减的每日笔记
   - Labor 一整天都会往这里写东西
   - 记录纠正、偏好、事实、上下文

2. **长期记忆** `MEMORY.md` 或 `memory/skills/{skill-id}/MEMORY.md`
   - 精选过的、持久的知识库
   - 重要的决定、偏好、经验教训

**作用域**：
- `global`：全局生效，所有 Skill 都能看到（`memory/global/`）
- `skill`：Skill 级别，只对特定 Skill 生效（`memory/skills/{skill-id}/`）

---

## 三、数据模型

### BOSS.md 文件结构

```markdown
# 老板工作手册

## 一、基本原则
## 二、沟通规范
## 三、工作流程
## 四、质量标准
## 五、学习与记忆
## 六、禁止事项
## 七、特别说明（动态补充）
## 八、手册更新
```

### 每日记忆文件结构 `memory/global/YYYY-MM-DD.md`

```markdown
# 2026-02-04 工作记忆

## 10:30
**用户偏好**
用户提到更喜欢简洁的分析报告，不要太多废话。

## 14:15
**纠正记录**
- 原始：股票代码用小写
- 正确：股票代码应该用大写，如 AAPL 而不是 aapl

## 16:00
**建议写入长期记忆**
- 章节：重要决定
- 内容：以后所有研报都要包含风险提示部分
```

### Skill 长期记忆文件结构 `memory/skills/{skill-id}/MEMORY.md`

```markdown
# Stock Analyzer 长期记忆

## 用户偏好
- 喜欢简洁的分析报告
- 股票代码用大写
- 需要包含风险提示

## 重要决定
- 2026-02-01: 采用 A 股和港股双市场分析
- 2026-02-04: 研报必须包含风险提示

## 常用股票
- 腾讯 (0700.HK)
- 阿里巴巴 (9988.HK)
```

---

## 四、核心组件

### 1. Memory File Manager（file-manager.ts）

```typescript
interface MemoryFileManager {
  // 读取记忆文件
  readFile(path: string): string | null

  // 追加到每日日志
  appendToDaily(params: {
    scope: 'global' | 'skill'
    skillId?: string
    content: string
    timestamp?: Date
  }): void

  // 读取最近几天的每日记忆
  readRecentDaily(params: {
    scope: 'global' | 'skill'
    skillId?: string
    days?: number
  }): string

  // 确保目录结构存在
  ensureSkillMemoryDir(skillId: string): void
}
```

### 2. Memory Injector（injector.ts）

```typescript
interface MemoryInjector {
  // 构建完整的上下文（BOSS.md + Memory）
  buildContext(params: {
    skillId: string
    userQuery: string
  }): string
}
```

**注入格式**：
```markdown
## 老板工作手册
[BOSS.md 内容]

## 全局长期记忆
[MEMORY.md 内容]

## 最近全局记忆
[memory/global/今天.md + 昨天.md 内容]

## 当前技能长期记忆
[memory/skills/{skill-id}/MEMORY.md 内容]

## 当前技能最近记忆
[memory/skills/{skill-id}/今天.md + 昨天.md 内容]
```

### 3. Memory Writer（writer.ts）

```typescript
interface MemoryWriter {
  // 写入纠正记录
  writeCorrection(params: {
    skillId: string
    original: string
    corrected: string
    context?: string
  }): void

  // 写入偏好记录
  writePreference(params: {
    skillId: string
    preference: string
    isGlobal?: boolean
  }): void

  // 写入事实记录
  writeFact(params: {
    skillId: string
    fact: string
    isGlobal?: boolean
  }): void

  // 写入长期记忆建议
  writeLongTerm(params: {
    skillId: string
    section: string
    content: string
    isGlobal?: boolean
  }): void
}
```

### 4. Memory Search（search.ts）

```typescript
interface MemorySearch {
  // BM25 全文搜索
  search(params: {
    query: string
    scope?: 'global' | 'skill' | 'all'
    skillId?: string
    maxResults?: number
  }): SearchResult[]
}

interface SearchResult {
  path: string
  snippet: string
  score: number
}
```

### 5. BOSS.md Manager（boss.ts）

```typescript
interface BossManager {
  // 读取 BOSS.md
  read(): string | null

  // 更新 BOSS.md
  update(content: string): void

  // 建议更新（返回建议，不直接更新）
  suggest(params: {
    section: string
    content: string
    reason: string
  }): UpdateSuggestion
}
```

---

## 五、集成点

### 1. executor.ts（BOSS.md 替代 CLAUDE.md）

**修改 `src-api/src/core/agent/executor.ts`**：
- 将 `findClaudeMd()` 改为 `findBossMd()`
- 将 `copyClaudeMdToDir()` 改为 `copyBossMdToDir()`
- 加载 `BOSS.md` 而不是 `CLAUDE.md`

### 2. agent-executor.ts（Memory 注入）

**修改 `agent-service/src/agent-executor.ts`**：

```typescript
// 修改 executeAgent 函数
export async function executeAgent(options: ExecuteOptions): Promise<void> {
  const { skill, query, sessionId, signal, onEvent } = options

  // 新增：构建完整上下文（读取 MD 文件）
  const memoryContext = memoryInjector.buildContext({
    skillId: skill.meta.id,
    userQuery: query,
  })

  // 修改：增强 Prompt
  const prompt = isNewSession
    ? `${memoryContext}\n\n---\n\n${skill.systemPrompt}\n\n---\n\n用户问题：${query}`
    : query

  // ... 执行 Agent ...
}
```

### 3. API 端点

```
GET  /api/boss              - 获取 BOSS.md 内容
PUT  /api/boss              - 更新 BOSS.md 内容

GET  /api/memory/global     - 获取全局记忆文件列表
GET  /api/memory/skill/:id  - 获取 Skill 记忆文件列表
GET  /api/memory/file       - 读取记忆文件内容
PUT  /api/memory/file       - 更新记忆文件内容
POST /api/memory/search     - 搜索记忆
POST /api/memory/write      - 写入记忆（纠正/偏好/事实）
```

---

## 六、关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `laborany/BOSS.md` | 已存在 | 老板工作手册 |
| `laborany/MEMORY.md` | 新建 | 全局长期记忆 |
| `laborany/memory/` | 新建 | 记忆文件目录结构 |
| `src-api/src/core/agent/executor.ts` | 修改 | BOSS.md 替代 CLAUDE.md |
| `agent-service/src/memory/file-manager.ts` | 新建 | Memory File Manager |
| `agent-service/src/memory/search.ts` | 新建 | Memory Search（BM25） |
| `agent-service/src/memory/injector.ts` | 新建 | Memory Injector |
| `agent-service/src/memory/writer.ts` | 新建 | Memory Writer |
| `agent-service/src/memory/boss.ts` | 新建 | BOSS.md Manager |
| `agent-service/src/memory/index.ts` | 新建 | 导出入口 |
| `agent-service/src/agent-executor.ts` | 修改 | 集成 Memory |
| `agent-service/src/index.ts` | 修改 | Memory API 端点 |

---

## 七、实现状态

### Phase 1: 基础设施（文件系统）✅
1. ✅ 创建 `memory/` 目录结构
2. ✅ 创建 `MEMORY.md` 全局长期记忆文件
3. ✅ 修改 `executor.ts`：BOSS.md 替代 CLAUDE.md
4. ✅ 实现 Memory File Manager

### Phase 2: BOSS.md 系统 ✅
5. ✅ 实现 BOSS.md Manager
6. ✅ 实现 BOSS.md API 端点
7. ✅ 验证 BOSS.md 被正确加载

### Phase 3: Memory 系统 ✅
8. ✅ 实现 Memory Injector
9. ✅ 实现 Memory Writer
10. ✅ 实现 Memory Search（BM25 全文搜索）
11. ✅ 集成到 agent-executor.ts

### Phase 4: API 端点 + 前端 ✅
12. ✅ 实现 Memory API 端点
13. ✅ 前端 BOSS.md 编辑页（MemoryPage.tsx - 老板手册 Tab）
14. ✅ 前端 Memory 管理页（MemoryPage.tsx - 记忆文件 Tab）

---

## 八、验证方案

1. **BOSS.md 注入测试**
   - 执行 Skill，验证 BOSS.md 被正确注入
   - 验证 Labor 遵守 BOSS.md 中的规范

2. **Memory 写入测试**
   - 调用 `/api/memory/write` 写入记忆
   - 验证记录被写入 `memory/skills/{skill-id}/YYYY-MM-DD.md`

3. **Memory 注入测试**
   - 新会话中验证相关记忆被注入
   - 验证 Labor 能看到之前的记忆

4. **跨 Skill 测试**
   - 在 Skill A 中产生全局记忆
   - 在 Skill B 中验证全局记忆被注入

5. **文件可编辑测试**
   - 用户直接编辑 memory/*.md 文件
   - 验证下次会话能读取到修改后的内容

---

## 九、与 OpenClaw 的差异

| 方面 | OpenClaw | Laborany |
|------|----------|----------|
| 搜索方式 | 向量 + BM25 混合 | 纯 BM25 全文搜索（简化） |
| 复杂度 | 2356 行 manager.ts | 约 500 行核心代码 |
| 配置文件 | MEMORY.md + memory/*.md | BOSS.md + MEMORY.md + memory/*.md |
| 目标用户 | 开发者 | 非技术用户 |
| 设计哲学 | 文件系统为主 | **文件系统为主**（与 OpenClaw 一致） |
| 更新方式 | 手动编辑 + Agent 写入 | UI 编辑 + Agent 写入 |
| 特色 | 通用 Agent | **按 Skill 组织记忆**（Laborany 特有） |

---

## 十、2026-02 记忆质量修复方案（防污染版）

> 目的：彻底解决“错误信息、总结污染、临时状态误记忆、跨链路重复写入”问题。

### 1) 写入分层与准入规则

#### L0: MemCell（原子记忆，允许自动写入）
- 仅记录单轮 `userQuery + assistantResponse` 的压缩快照。
- 必须先做**噪声过滤**：
  - 过滤工作流脚手架：`工作流执行上下文 / 当前步骤 / 输入参数 / 前序步骤结果 / {{input.xxx}}`
  - 过滤临时状态：`尚未确认 / 尚未指定 / 待确认`
  - 过滤助手流程语：`让我先... / 已完成 / 工具调用记录`
- `__converse__` 会话默认**不写入** MemCell。

#### L1: Profile（用户画像，中期记忆）
- 只允许写入“用户稳定信息”：偏好、沟通风格、长期工作约束、稳定环境信息。
- 默认门槛：
  - 置信度 ≥ 0.65 才可候选更新；
  - 发生冲突时按证据数量与置信度决策 `keep_old / merge / use_new`；
  - 同条信息需去重（语义归一键）。
- 自动分区：`工作偏好 / 沟通风格 / 技术栈 / 个人信息`，禁止全部塞到单一章节。

#### L2: Long-Term MEMORY（长期记忆）
- 只允许从 Profile 晋升，不直接从一次提取结果直写。
- 晋升门槛：
  - 非 provisional（高置信）；
  - 同字段至少 2 条证据；
  - 不含时间敏感表达（如“今天/本次/刚刚/具体日期”）。
- 全局 MEMORY（`MEMORY.md`）仅保留跨 Skill 通用规则；
  skill MEMORY 记录技能内长期约束与偏好。

### 2) 高风险链路隔离

- `__converse__` 仅负责意图决策，不参与长期记忆沉淀。
- Workflow 执行链中，带 `工作流执行上下文` 的 prompt 不得直接入库。
- 仅保留一条主写入链路（orchestrator），避免双写和重复写。

### 3) 每日记忆（Daily）写入策略

- Skill Daily 可记录任务摘要（可审计）。
- Global Daily 仅在“高置信 + 用户中心 + 稳定”条件下写入，避免全局噪声膨胀。

### 4) 注入（Retrieve）策略

- 固定注入：`BOSS.md + Profile`。
- 高优先：`全局长期 + 技能长期`。
- 低优先：相似片段与最近 daily（带 token 预算）。
- 禁止注入明显噪声片段（工作流脚手架、临时状态、助手流程话术）。

### 5) 存量数据清洗机制

- 提供一键脚本：`npm run memory:clean`。
- 清洗范围：
  - `data/MEMORY.md`
  - `data/memory/profiles/PROFILE.md`
  - `data/memory/cells/**/*.md`（仅清除噪声 fact）
- 先自动备份再清洗：`data/memory/cleanup-backups/<timestamp>/`。

### 6) 质量验收指标（必须满足）

- P0：新写入数据中，工作流脚手架污染条目 = 0。
- P0：`__converse__` 记忆写入 = 0。
- P1：Profile 中“尚未确认/待确认”条目占比 < 1%。
- P1：全局 MEMORY 中“新闻事实/一次性任务细节”条目占比 < 5%。
- P1：同义重复条目（归一后）下降 80% 以上。

### 7) 运维建议

- 每日或每周执行一次 `memory:clean`（上线初期建议每日）。
- 每周人工抽查 Top 20 新增长期记忆条目。
- 当检测到污染阈值超标时，自动降级：暂停 long-term 自动晋升，仅保留候选。

### 8) 二轮加固：长期记忆候选队列（2026-02-10）

- 自动提取阶段不再直接写入长期记忆文件，仅写入候选队列：
  - `data/memory/consolidation-candidates.json`
- 候选的生成来源有两类：
  - `orchestrator` 从高置信、非临时、双证据 Profile 字段晋升为候选；
  - `consolidator` 从 daily 归纳得到高频模式后入队。
- 候选确认采用“显式确认”工作流：
  - `GET /memory/consolidation-candidates?scope=...&analyze=false`：仅查看候选；
  - `GET /memory/consolidation-candidates?...&analyze=true&days=N`：先分析再返回；
  - `POST /memory/consolidate`：人工确认后写入长期记忆；
  - `POST /memory/reject-candidates`：人工拒绝候选。
- 写入保护：`consolidate` 时按 candidate 自身 scope/skillId 校验，避免跨作用域误归档。

### 9) 自动写入策略（你现在要的模式）

- 默认目标：**自动提取 + 自动写入**，不要求用户每次确认。
- 为避免脏写，采用“双轨制”：
  - 高置信稳定信息：自动写入长期记忆；
  - 边缘信息：自动进入候选池，不阻塞主流程。
- 自动写入门槛（建议值）：
  - Skill 长期：置信度 ≥ 0.90，证据数 ≥ 3，且通过稳定性过滤；
  - Global 长期：置信度 ≥ 0.92，证据数 ≥ 4，且满足跨技能通用规则。
- 过滤增强：在原有 workflow/临时态/助手话术过滤基础上，额外过滤结构化噪声（模板占位符、纯 JSON 块、URL、HTML 片段）。
