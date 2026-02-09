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
