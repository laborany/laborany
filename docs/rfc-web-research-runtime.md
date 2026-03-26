# RFC: Web Research Runtime — 把可信联网研究变成 LaborAny 平台能力

> Status: Draft
> Author: Claude Code + Codex 联合设计
> Date: 2026-03-25
> 灵感来源: [web-access skill](https://github.com/eze-is/web-access)

---

## 1. 目标与非目标

### 目标

- **所有模型、所有用户**都能获得稳定的联网搜索和信息获取能力，不再绑定智谱 API
- 提供**语义级工具接口**（模型表达"要什么"而非"怎么做"），弱模型也能可靠使用
- 搜索结果**带来源、可核实**，杜绝模型凭幻觉回答事实性问题
- **站点经验跨 session 沉淀**，访问过的站点不用每次重新试错
- execute 和 converse 两条链路**共享同一套能力**

### 非目标

- 不做通用浏览器自动化产品（写操作 P0 不暴露）
- 不替代用户手动浏览网页
- `verify` 先做基础版；复杂的一手源排序、自动裁决与候选经验 review 放到后续阶段
- 不要求用户必须配置 Chrome 远程调试（无 CDP 时优雅降级）

---

## 2. 架构总览

```
╔══════════════════════════════════════════════════════════════════════╗
║  Layer 3: ResearchPolicy (Prompt 策略层)                             ║
║  ── 注入 converse-prompt.ts / CLAUDE.md                             ║
║  ── "时效性问题必须先调研"、"搜索做发现、核实找一手源"                    ║
╠══════════════════════════════════════════════════════════════════════╣
║  Layer 2: laborany-web MCP (语义工具层)                               ║
║  ── per-session stdio 进程，无状态 thin bridge                        ║
║  ── 通过 loopback HTTP 调 agent-service 内部路由                      ║
║  ── 模型看到的工具: search / read_page / screenshot / get_site_info   ║
╠══════════════════════════════════════════════════════════════════════╣
║  Layer 1: WebResearchRuntime (基础设施层)                              ║
║  ── agent-service 进程内长生命周期单例                                  ║
║  ── 持有：浏览器状态、站点知识、后端适配器、降级决策                       ║
║  ── BrowserManager: CDP Proxy 管理                                    ║
║  ── SiteKnowledge: 站点经验 verified/candidate 两层                    ║
║  ── SearchBackends: 智谱(可选) / Jina / static / CDP                  ║
║  ── 内部路由挂载在 agent-service Express app 上                        ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 关键架构决策

| 决策 | 结论 | 理由 |
|------|------|------|
| 智能放哪层？ | **Layer 1** | 后端选择、站点经验、降级策略是全局状态，不能切碎到每个 session |
| MCP 进程怎么调 Runtime？ | **agent-service 内部路由** | 不额外开 HTTP server，复用现有 Express app，少一个端口管理点 |
| CDP Proxy 谁管？ | **Runtime 单例** | MCP 是 per-session 的，浏览器是全局复用的，不能每个 session 各拉一份 |
| 站点经验谁写？ | **Runtime 自动记录到 candidate，review 后再进 verified** | 既能自动积累真实观测，又避免幻觉直接污染长期知识 |
| Claude 内建 WebSearch 是否作为后端？ | **否** | MCP 工具无法可靠调用 Claude 内建工具，不设计为正式后端 |
| 浏览器 tab 策略？ | **只管自己创建的后台 tab** | 不列出/操作用户已有 tab，隐私和可控性底线 |

---

## 3. 模块与文件结构

```
agent-service/src/
├── web-research/
│   ├── index.ts                      ← 导出 runtime 单例 + 路由挂载函数
│   ├── runtime.ts                    ← WebResearchRuntime 类
│   │                                    init() / shutdown() / getStatus()
│   │                                    search() / readPage() / screenshot()
│   │                                    内部持有降级决策逻辑
│   │
│   ├── browser/
│   │   ├── cdp-proxy-manager.ts      ← fork cdp-proxy.mjs、健康检查、按需启动、重连
│   │   ├── cdp-proxy.mjs             ← 从 web-access 移植（基本不改）
│   │   └── tab-manager.ts            ← 托管 tab 创建/关闭/超时回收
│   │                                    只管 runtime 自己创建的 tab
│   │
│   ├── backends/
│   │   ├── types.ts                  ← SearchResult / PageContent 统一接口
│   │   ├── zhipu-adapter.ts          ← 智谱搜索/阅读（可选后端）
│   │   ├── jina-adapter.ts           ← r.jina.ai（免费 20RPM）
│   │   ├── static-adapter.ts         ← HTTP fetch + HTML→text
│   │   └── cdp-adapter.ts            ← 通过 CDP Proxy 搜索/提取/截图
│   │
│   ├── knowledge/
│   │   ├── site-knowledge.ts         ← SiteKnowledge 管理类（双目录架构）
│   │   │                                constructor(userDataDir, builtinPatternsDir)
│   │   │                                init() → 加载内置 + 用户经验
│   │   │                                match(url) → SitePattern | null
│   │   │                                recordSuccess(domain, evidence) → 自动写 candidate
│   │   │                                getPatterns() → for get_site_info
│   │   ├── pattern-matcher.ts        ← domain + aliases 匹配逻辑
│   │   ├── types.ts                  ← SitePattern 数据模型（含 source 字段）
│   │   └── builtin-patterns/         ← 内置站点经验（只读，随 app 分发）
│   │       ├── xiaohongshu.com.md
│   │       ├── zhihu.com.md
│   │       ├── mp.weixin.qq.com.md
│   │       ├── twitter.com.md
│   │       ├── x.com.md
│   │       ├── weibo.com.md
│   │       ├── google.com.md
│   │       └── bing.com.md
│   │
│   ├── routes/
│   │   └── internal-api.ts           ← 挂载到 agent-service Express app
│   │                                    POST /_internal/web-research/search
│   │                                    POST /_internal/web-research/read-page
│   │                                    POST /_internal/web-research/screenshot
│   │                                    GET  /_internal/web-research/site-info
│   │                                    GET  /_internal/web-research/status
│   │
│   ├── mcp/
│   │   ├── mcp-server.mjs            ← laborany-web MCP Server (stdio)
│   │   │                                转发到 /_internal/web-research/*
│   │   └── write-mcp-config.ts       ← 生成 --mcp-config JSON 文件
│   │
│   └── policy/
│       └── research-policy.ts        ← 生成 ResearchPolicy prompt 片段
│                                        buildResearchPolicySection()

DATA_DIR/                              ← 运行时用户数据目录
└── web-research/
    └── site-patterns/                 ← 用户站点经验（可写，运行时数据）
        ├── verified/                  ← review 通过后的正式经验 + 用户覆盖
        └── candidate/                 ← 运行时自动沉淀 + 手动导入的待验证经验
```

**双目录存储架构**：

| 目录 | 用途 | 读写 | 位置 |
|------|------|------|------|
| `agent-service/src/web-research/knowledge/builtin-patterns/` | 内置站点经验，随 app 分发 | 只读 | 打包在应用内 |
| `DATA_DIR/web-research/site-patterns/` | 用户站点经验，运行时数据 | 可写 | 用户 home 目录 |

加载逻辑：先加载内置经验，再加载用户经验。用户经验优先覆盖同名内置经验。
写入逻辑：`recordSuccess()` 始终写入用户数据目录的 `candidate/`，不修改内置文件；只有 review 通过后才进入 `verified/`。

### 自动沉淀策略

- `read_page` 成功走 CDP 时，自动为目标站点追加一条 `auto-observation`
- `search` 成功走站内搜索策略（`strategy = site:<domain>`）时，自动为该站点追加一条 `auto-observation`
- `read_page` 命中结构化提取（如 `structured_video` / `structured_note`）成功时，额外追加结构化提取成功信号
- 已知站点的站内搜索失败，但 Google/Bing fallback 成功返回该站点结果时，额外追加 fallback 成功信号
- `read_page` 先经过 Jina / static 失败，最终由浏览器兜底成功时，额外追加 browser fallback 成功信号
- 普通 Google/Bing 搜索命中的结果**不自动**为结果域名建档，避免把偶然命中污染长期知识库
- 自动沉淀只进入 `candidate/`；是否晋升为正式 `verified` 由 review 决定

- `DATA_DIR` = `getRuntimeDataDir()` (来自 `shared/src/runtime-paths.ts`)
- 开发态 = `{projectRoot}/data/web-research/site-patterns/`
- 打包态 = `{userHome}/data/web-research/site-patterns/`

---

## 4. MCP Tool Schema

### 4.1 默认注入的只读研究工具

所有 execute / converse 任务**自动获得**这些工具。

```typescript
// search — 搜索信息
server.tool('search',
  'Search the web for information. Returns a list of results with titles, URLs, and snippets. ' +
  'Use this for finding information, discovering sources, and answering factual questions.',
  {
    query: z.string().describe('Search query in any language'),
    language: z.enum(['zh', 'en', 'auto']).optional()
      .describe('Preferred result language. Default: auto'),
    recency: z.enum(['day', 'week', 'month', 'year', 'any']).optional()
      .describe('Time filter for results. Default: any'),
    site: z.string().optional()
      .describe('Restrict to one domain, e.g. "openai.com"'),
    sites: z.array(z.string()).max(5).optional()
      .describe('Restrict to a small set of domains'),
  },
  async ({ query, language, recency, site, sites }) => {
    // → POST /_internal/web-research/search
    // Runtime 内部决策: site pattern → zhipu(可选) → CDP 搜索引擎
    // 若提供 site/sites，Runtime 自动拼接结构化 site: 过滤
  }
)

// read_page — 读取网页内容
server.tool('read_page',
  'Read and extract content from a web page URL. Returns the page text content. ' +
  'The system automatically chooses the best method (static fetch, Jina, or browser).',
  {
    url: z.string().describe('The URL to read'),
    extract_mode: z.enum(['text', 'markdown', 'html']).optional()
      .describe('Output format. Default: markdown'),
  },
  async ({ url, extract_mode }) => {
    // → POST /_internal/web-research/read-page
    // Runtime 内部决策: site pattern → Jina → static → CDP
  }
)

// screenshot — 对网页截图
server.tool('screenshot',
  'Take a screenshot of a web page. Requires browser capability. ' +
  'Returns the screenshot as a local file path.',
  {
    url: z.string().describe('The URL to screenshot'),
    file_path: z.string().optional()
      .describe('Save path. Default: auto-generated in task dir'),
  },
  async ({ url, file_path }) => {
    // → POST /_internal/web-research/screenshot
    // 必须走 CDP
  }
)

// get_site_info — 查询站点经验
server.tool('get_site_info',
  'Get known access patterns and platform characteristics for a website. ' +
  'Use this before accessing unfamiliar platforms to avoid common pitfalls.',
  {
    domain: z.string().describe('Website domain, e.g. "xiaohongshu.com"'),
  },
  async ({ domain }) => {
    // → GET /_internal/web-research/site-info?domain=...
  }
)

// save_site_pattern — 保存/导入站点经验
server.tool('save_site_pattern',
  'Save a site-pattern Markdown document into the local knowledge base.',
  {
    content: z.string().describe('Markdown with frontmatter'),
    filename: z.string().optional(),
    scope: z.enum(['verified', 'candidate']).optional(),
  },
  async ({ content, filename, scope }) => {
    // → POST /_internal/web-research/site-patterns/import
  }
)
```

### 4.2 按需注入的浏览器自动化工具（P7+）

仅当 skill metadata 中声明 `browserAutomation: true` 时注入。P0 不实现。

```
browser_open(url) → targetId
browser_navigate(targetId, url)
browser_eval(targetId, expression)
browser_click(targetId, selector)
browser_scroll(targetId, direction)
browser_screenshot(targetId, filePath)
browser_close(targetId)
```

### 4.3 模型看到的工具名

在 skill prompt 中统一使用：

```
mcp__laborany_web__search
mcp__laborany_web__read_page
mcp__laborany_web__screenshot
mcp__laborany_web__get_site_info
mcp__laborany_web__save_site_pattern
```

---

## 5. Site Patterns 数据模型

### 5.1 文件格式

```markdown
---
domain: xiaohongshu.com
aliases: [小红书, RED, xhs]
access_strategy: cdp_only        # cdp_only | cdp_preferred | static_ok
verified_at: 2026-03-24
evidence_count: 5                # 成功操作次数
---

## 平台特征
- SPA 架构，内容动态渲染
- 严格反爬，静态请求返回空壳 HTML

## 有效模式
- 搜索：站内搜索栏输入关键词
- 内容提取：从搜索结果列表点击进入

## 已知陷阱
- [2026-03] 手动构造 URL 被 xsec_token 拦截

## 自动化配置
```json
{
  "search": {
    "mode": "site_form",
    "entryUrl": "https://www.xiaohongshu.com/explore",
    "inputSelector": "input.search-input",
    "submitSelector": "div.search-icon"
  },
  "read": {
    "mode": "structured_note",
    "waitUrlIncludes": "/explore/",
    "readySelector": "#noteContainer #detail-title",
    "rootSelector": "#noteContainer"
  }
}
```
```

说明：
- `平台特征 / 有效模式 / 已知陷阱` 负责给人和模型看，便于理解与贡献。
- `自动化配置` 是 machine-readable 的 JSON，供 Runtime / CDP executor 直接执行。
- 站点经验必须以 Markdown 文件为唯一承载格式，代码只解释 schema，不内置站点私有流程。

### 5.2 access_strategy 对 Runtime 决策的影响

| access_strategy | search 行为 | read_page 行为 |
|-----------------|------------|---------------|
| `cdp_only` | 跳过 API/静态，直接 CDP | 跳过 Jina/静态，直接 CDP |
| `cdp_preferred` | 先试 API，失败立即 CDP（不走静态） | 先试 Jina，失败立即 CDP |
| `static_ok` | 正常降级链 | 正常降级链 |
| (无记录) | 正常降级链 | 正常降级链 |

### 5.3 写入机制

**当前实现**：
- `get_site_info` — 模型可读，暴露为 MCP tool
- `save_site_pattern` — 已暴露给模型，也可供设置页/导入流程复用
- Runtime 内部自动记录：当 CDP 操作成功且非首次时，自动写入/更新 `verified/` 下的经验文件
- 自动记录的信息：domain、access_strategy、成功使用的选择器/URL 模式
- 合并策略：用户目录优先覆盖，但若用户 pattern 缺少字段，则自动回填内置 pattern 的缺省值；对 `automation` 子配置采用深合并，避免旧用户文件冻结内置修复

**P1+ 阶段**：
- 增加 `candidate/` 层，模型可通过 MCP tool 提交经验候选
- 后台 review 机制（或基于 evidence_count 自动晋升）

### 5.4 预置站点经验（随产品发布）

P0 预置以下高频站点的 verified 经验：

| 域名 | access_strategy | 原因 |
|------|----------------|------|
| `xiaohongshu.com` | cdp_only | 严格反爬，SPA |
| `mp.weixin.qq.com` | cdp_only | 动态渲染，反爬 |
| `zhihu.com` | cdp_preferred | 部分内容需登录 |
| `twitter.com` / `x.com` | cdp_preferred | 动态渲染 |
| `weibo.com` | cdp_preferred | 部分反爬 |

---

## 6. 降级链路

### 6.1 search(query)

```
search(query)
│
├─ 1. SiteKnowledge.match(query)
│     识别出目标域名? access_strategy == cdp_only?
│     是 → 跳到步骤 3
│
├─ 2. API 搜索后端
│     ├─ 有智谱 API key? → zhipu web-search-prime
│     │   成功且结果质量足够? → 返回
│     │   失败/结果不够? → 继续
│     └─ 无智谱 → 跳到步骤 3
│
├─ 3. CDP 浏览器搜索
│     ├─ ensureBrowser() → 按需启动 CDP Proxy
│     │   启动失败? → 返回降级说明
│     ├─ 打开 Google/Bing 搜索页
│     ├─ eval 提取搜索结果
│     ├─ 关闭 tab
│     └─ 返回结果
│
└─ 4. 全部失败
      返回 { results: [], degraded: true, reason: "..." }
```

### 6.2 read_page(url)

```
read_page(url)
│
├─ 1. SiteKnowledge.match(url)
│     access_strategy == cdp_only? → 跳到步骤 3
│
├─ 2. 静态提取
│     ├─ Jina (r.jina.ai/url) — 文章/文档类优先
│     │   成功且内容非空? → 返回
│     ├─ static HTTP fetch + HTML→text
│     │   成功且内容非空? → 返回
│     └─ 失败/内容为空 → 继续
│
├─ 3. CDP 浏览器提取
│     ├─ ensureBrowser()
│     ├─ /new?url=... → 打开页面
│     ├─ /eval → 提取内容
│     ├─ /close → 关闭 tab
│     └─ 返回结果
│         成功? → SiteKnowledge.recordSuccess(domain, 'cdp_needed')
│
└─ 4. 全部失败
      返回 { content: null, degraded: true, reason: "..." }
```

### 6.3 screenshot(url)

```
screenshot(url)
│
├─ ensureBrowser()
│   失败? → 返回错误 "浏览器增强未配置，无法截图"
│
├─ /new?url=... → 打开页面
├─ /screenshot?target=ID&file=PATH
├─ /close → 关闭 tab
└─ 返回 { file_path: PATH }
```

### 6.4 无 CDP 时的整体降级

| 能力 | 有 CDP | 无 CDP |
|------|--------|--------|
| search | 完整降级链 | 仅 zhipu（如有），否则返回降级说明 |
| read_page | 完整降级链 | Jina + static fetch，部分站点会失败 |
| screenshot | 正常 | 不可用，返回明确错误 |
| get_site_info | 正常 | 正常（只读本地文件） |

---

## 7. 注入点与执行链路

### 7.1 agent-executor.ts 改造

```typescript
// 现有 MCP 注入位置（约 480-520 行）
// 在 generative-ui MCP 和 user MCP 之后，增加 laborany_web MCP 注入

import { writeWebResearchMcpConfig } from './web-research/mcp/write-mcp-config.js'

// ... 在 args 构建完毕后 ...

// ── Web Research MCP: 对所有用户统一注入 ──
try {
  const webMcpPath = writeWebResearchMcpConfig(taskDir, {
    agentServicePort: process.env.AGENT_PORT || '3002',
    nodePath: resolveMcpNodeCommand(cliLaunch.source === 'bundled'
      ? cliLaunch.command : undefined),
    modelProfileId,
  })
  args.push('--mcp-config', webMcpPath)
  console.log(`[Agent] Web Research MCP injected: ${webMcpPath}`)
} catch (err) {
  console.error('[Agent] Failed to write web research MCP config:', err)
}
```

### 7.2 converse-prompt.ts 改造

在 `buildConverseSystemPrompt()` 的 sections 数组中增加 ResearchPolicy：

```typescript
import { buildResearchPolicySection } from './web-research/policy/research-policy.js'

export function buildConverseSystemPrompt(...) {
  const sections = [
    BEHAVIOR_SECTION,
    ADDRESSING_SECTION,
    buildRuntimeContextSection(runtimeContext),
    buildResearchPolicySection(),            // ← 新增
    `## 可用能力目录\n\n${catalogText}`,
    QUESTION_PROTOCOL_SECTION,
    ACTION_PROTOCOL_SECTION,
    FEW_SHOT_SECTION,
  ]
  // ...
}
```

### 7.3 ResearchPolicy 内容

```typescript
export function buildResearchPolicySection(): string {
  return `## 联网调研策略

当对话涉及以下场景时，必须先使用联网工具调研，再回答：

### 必须调研
- 时效性信息（最新、最近、2025、2026、当前价格、现在）
- 事实核查（具体数据、统计、政策、法规、人事变动）
- 官方信息（官网内容、产品价格、功能列表、文档）
- 对比推荐（哪个更好、推荐、选择）

### 调研原则
- 搜索做发现，不做证明。搜索结果是线索入口，不是最终答案。
- 一手来源优于二手转述。找到官网、官方文档、原始出处再给结论。
- 找不到一手源时，明确告知用户来源局限性。
- 使用 mcp__laborany_web__search 搜索，mcp__laborany_web__read_page 深度阅读。
- 若只查某个站点，优先给 search 传 `site` / `sites` 参数。

### 不需要调研
- 纯概念解释（什么是 TCP/IP）
- 逻辑推理、数学计算
- 创意写作、头脑风暴
- 用户明确说"不需要搜索"

### 在路由分发模式下
如果用户的请求同时需要联网信息和 skill 执行（如"分析最新的 xx 股票"），
应直接路由到对应 skill，让 skill 内部使用 research 工具获取信息。
不要自己先搜索再路由。`
}
```

### 7.4 agent-service 内部路由挂载

```typescript
// agent-service/src/index.ts 中
import { webResearchRouter, initWebResearchRuntime } from './web-research/index.js'

// 在 app 初始化阶段
await initWebResearchRuntime()

// 挂载内部路由（不暴露给外部，MCP 通过 loopback 访问）
app.use('/_internal/web-research', webResearchRouter)
```

---

## 8. Skill 迁移清单

### 8.1 需要改造的 skill

| Skill | 当前工具引用 | 改为 |
|-------|------------|------|
| `deep-research` | `mcp__web-search-prime__webSearchPrime` | `mcp__laborany_web__search` |
| `deep-research` | `mcp__web-reader__webReader` | `mcp__laborany_web__read_page` |
| `deep-dialogue` | `mcp__web-search-prime__webSearchPrime` | `mcp__laborany_web__search` |
| `deep-dialogue` | `mcp__web-reader__webReader` | `mcp__laborany_web__read_page` |
| `stock-analyzer` | `WebSearch` / `WebFetch` | `mcp__laborany_web__search` / `mcp__laborany_web__read_page` |
| `topic-collector` | `WebSearch` | `mcp__laborany_web__search` |
| `ppt-svg-generator` | `WebSearch` | `mcp__laborany_web__search` |
| `paper-editor` | `WebSearch` | `mcp__laborany_web__search` |
| `video-creator` | `WebFetch` | `mcp__laborany_web__read_page` |
| `rss-news-aggregator` | `WebSearch` | `mcp__laborany_web__search` |

### 8.2 改造模式

**改前** (deep-research/stages/04-execute-research.md)：
```markdown
使用 `mcp__web-search-prime__webSearchPrime` 执行所有查询。
从第一轮结果中筛选 5-8 篇最相关的文章，使用 `mcp__web-reader__webReader` 获取全文。
```

**改后**：
```markdown
使用 `mcp__laborany_web__search` 执行所有查询。
从第一轮结果中筛选 5-8 篇最相关的文章，使用 `mcp__laborany_web__read_page` 获取全文。
```

### 8.3 skill 的 allowed-tools 更新

```yaml
# 改前
allowed-tools: Read Write Glob Grep Bash WebSearch WebFetch

# 改后
allowed-tools: Read Write Glob Grep Bash
# (research 工具通过 MCP 自动注入，不需要在 allowed-tools 中声明)
```

---

## 9. 智谱过渡方案

| 阶段 | 智谱状态 | skill 工具名 |
|------|---------|------------|
| **当前实现** | 智谱搜索/阅读只作为 Runtime 内部可选 backend adapter；不再直接注入给模型 | `laborany_web__*` |
| **兼容期** | `src-api` 的 MCP preset 仍可保留给高级用户手动配置，但平台内置搜索链路不再依赖它 | `laborany_web__*` |
| **后续** | 如需更多 API 搜索后端，统一继续挂到 Runtime adapter 层 | `laborany_web__*` |

agent-service 和 src-api 两条执行链现在都统一注入 `laborany-web` MCP。智谱相关能力只通过 Runtime 内部 adapter 使用，不再在 skill prompt 或执行器里直接暴露 `web-search-prime` / `web-reader`。

---

## 10. 前端设置页（P5）

在设置页增加"浏览器增强研究"区域：

```
┌─────────────────────────────────────────────┐
│  🌐 浏览器增强研究                            │
│                                             │
│  Node.js:    ✅ v22.4.0                     │
│  Chrome CDP: ❌ 未连接                       │
│                                             │
│  [配置指引]                                  │
│  1. 打开 Chrome                             │
│  2. 访问 chrome://inspect/#remote-debugging │
│  3. 勾选 "Allow remote debugging"           │
│  4. 点击下方"测试连接"                        │
│                                             │
│  [测试连接]  [查看状态详情]                    │
│                                             │
│  当前模式: 降级模式（仅 API 搜索 + 静态抓取）  │
│  完整模式需要 Chrome 远程调试支持              │
└─────────────────────────────────────────────┘
```

---

## 11. 实施顺序

| 阶段 | 内容 | 交付物 | 用户可感知变化 |
|------|------|--------|-------------|
| **P0** | WebResearchRuntime 单例 + CDP Proxy Manager + 内部路由 + laborany-web MCP（search, read_page, screenshot, get_site_info, save_site_pattern, verify）+ 预置站点经验 | `agent-service/src/web-research/` 整个模块 | 无（内部基建） |
| **P1** | agent-executor.ts 统一注入 laborany-web MCP | execute + converse 链路自动获得搜索能力 | 所有模型能搜索了 |
| **P2** | converse-prompt.ts + CLAUDE.md 注入 ResearchPolicy | 首页对话不再凭幻觉回答事实性问题 | 首页对话质量飞升 |
| **P3** | 迁移 deep-research、deep-dialogue 工具名 | 最常用的两个 skill 脱离智谱绑定 | 非智谱用户也能深度研究 |
| **P4** | 迁移 stock-analyzer、topic-collector 等全部 skill | 全面去供应商化 | 所有 skill 搜索能力统一 |
| **P5** | 前端设置页"浏览器增强" | 用户能一键检测和配置 CDP | 用户体验闭环 |
| **P6** | 智谱退到 backend adapter | executor.ts 去掉直接注入逻辑 | 无感知（内部重构） |
| **P7** | 浏览器自动化工具（browser_click 等） | 高级能力 | 自动化 skill 增强 |
| **P8** | candidate review / pattern 治理能力增强 | 站点知识持续积累 | 越用越聪明 |

---

## 12. 风险与缓解

| 风险 | 缓解方案 |
|------|---------|
| CDP Proxy 启动失败/Chrome 未配置 | 降级到 API 搜索 + 静态抓取，返回明确降级说明 |
| MCP 进程 crash | stdio 进程生命周期与 Claude CLI 绑定，CLI 重启自动重建 |
| 智谱 API 过渡期双重注入冲突 | P0-P3 期间 laborany-web 和智谱 MCP 并存，工具名不同不冲突 |
| 站点经验被错误自动记录 | 仅记录 CDP 操作成功的事实性数据，不记录推测；evidence_count 计数 |
| 弱模型不会用 search + read_page 组合 | ResearchPolicy 给出明确指引；工具内部已包含智能降级 |
| 多个并行 session 同时操作 CDP | CDP Proxy 天然支持多 tab 并行，tab 级隔离无竞态 |

---

## 附录 A: 与 web-access 的对应关系

| web-access 概念 | LaborAny 对应 | 位置 |
|----------------|-------------|------|
| CDP Proxy (cdp-proxy.mjs) | BrowserManager.cdp-proxy.mjs | Layer 1 |
| 浏览哲学/联网工具选择 | ResearchPolicy | Layer 3 |
| WebSearch/WebFetch/curl/Jina | SearchBackends | Layer 1 |
| /eval /click /scroll 等 | browser_* 工具（P7） | Layer 2 (按需) |
| site-patterns/ | SiteKnowledge (verified/candidate) | Layer 1 |
| match-site.sh | pattern-matcher.ts | Layer 1 |
| 并行子 Agent 分治 | 由 skill 自行决定（不在 runtime 层处理） | Skill 层 |
| check-deps.sh | BrowserManager.checkHealth() + 前端设置页 | Layer 1 + 前端 |
