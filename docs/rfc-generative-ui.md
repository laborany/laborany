# RFC: LaborAny Generative UI 集成方案

> 合并说明：该 RFC 已与 `docs/generative-ui-rfc.md` 合并为执行版开发计划，见 `docs/generative-ui-development-plan.md`
>
> 注意：本文保留为历史草稿。文中关于“第一阶段只做 Claude”“Gate A 失败即切 Direct API”的表述已过时，当前实现方向以 `CLI-first + capability-tier` 为准。

> 状态：Draft
> 作者：LaborAny Team
> 日期：2025-03-15
> 版本：v0.1

---

## 1. 概述

本 RFC 提出在 LaborAny 桌面端集成 Claude Generative UI 能力：当用户在对话中请求可视化解释时，LLM 通过专用 tool call 生成交互式 HTML widget，实时流式渲染在独立侧边面板中。

核心目标：
- 对话中能"画图"：图表、流程图、交互计算器、仪表盘等
- 实时 streaming：widget 随 token 生成逐步呈现，不是等完了才出现
- 跨平台：Windows / macOS / Linux 桌面端统一体验
- 安全隔离：widget 在 iframe 沙箱中运行，不接触宿主状态
- 双向交互：用户在 widget 中的操作可反馈回对话

## 2. 背景与现状

### 2.1 Claude Generative UI 机制

根据对 claude.ai 的逆向工程（参考资料 [1][2][3]），其 generative UI 并非在回复正文中嵌入 HTML，而是通过结构化 tool call 协议实现：

1. Claude 调用 `load_guidelines` 工具，按需加载设计规范（72KB，分 5 个模块）
2. Claude 调用 `show_widget` 工具，`widget_code` 参数承载 HTML 片段
3. 服务端在 streaming 过程中解析不完整的 JSON，提取已生成的 HTML
4. 前端用 morphdom 做增量 DOM diff（新节点 fade in，未变节点不动）
5. streaming 结束后通过 script node replacement 执行 `<script>` 标签
6. CSS Variables 实现主题继承，`sendToAgent()` 实现双向通信

文字解释和 widget HTML 走两个独立通道（text stream vs tool call stream），无需解析混合内容。

### 2.2 LaborAny 现状

架构：
```
Electron Main Process
  ├── Frontend (React 18 + Tailwind + Vite, :3620)
  ├── src-api (Hono, :3620) — 配置/会话/文件
  └── agent-service (Express, :3002) — 对话/执行/记忆
        └── Claude Code CLI (执行引擎)
```

关键现状：
- `agent-executor.ts:276` 使用 `--output-format stream-json --verbose`，尚未开启 `--include-partial-messages`
- `agent-executor.ts:155` 的 `parseStreamLine` 只解析 `assistant`/`user` 类型的完整消息，不处理 `stream_event`
- `useConverse.ts:397` 的 SSE 事件模型支持 text/action/state/question/tool_use/tool_result/error/done
- `HtmlRenderer.tsx:158` 已有 iframe 沙箱（`sandbox="allow-scripts allow-same-origin"`）
- `converse.ts:44` 的 `sseWrite` 函数可直接扩展新事件类型
- 会话和消息已支持 meta JSON 字段，可承载 widget 快照
- 支持 Windows/macOS/Linux 桌面端 + QQ Bot + 飞书 Bot
- `llm-bridge.ts:591` 当前为 `stream: false`，非 streaming 模式

双轨桌面壳：Electron 是主线（完整打包链），Tauri v2 为迁移中的第二条线（仅拉起 API sidecar）。

## 3. 设计决策

### 决策 1：先 Spike 验证 CLI 路径

**结论**：先做 1-2 天 spike，验证 Claude Code CLI 在 `--include-partial-messages` 下能否吐出 `stream_event` 中的 `input_json_delta`（tool 参数增量）。

**理由**：LaborAny 的核心能力（会话管理、停止/恢复、权限、记忆、工具行为）都压在 CLI runtime 上。直接绕开会复制一整套基础设施。文档已确认 `stream_event` 包含 `delta.type == "input_json_delta"`，spike 成功概率较高。

**如果 spike 失败**：仅对 converse 链路开直连 API 分支（`@anthropic-ai/sdk` 的 `messages.stream()`），不分叉整个执行 runtime。

### 决策 2：渲染位置 — 独立侧边面板

**结论**：桌面端右侧弹出 Widget Panel，聊天流中放一个锚点卡片（WidgetAnchorCard）。

**理由**：不复用 Preview。Preview 是文件/产物语义（打开、下载、保存），generative UI 是会话态、可变态、可交互态。混在一起后续会语义混乱。内联渲染仅作为窄窗口 fallback。

### 决策 3：触发方式 — 半自动

**结论**：
- 显式关键词强触发：`可视化` / `画图` / `图解` / `流程图` / `chart` / `diagram` / `dashboard`
- 其余场景走意图门控，允许模型自行决定是否调用 `show_widget`
- 提供"改为可视化解释"按钮，用户可手动触发

**理由**：纯自动不可控（模型可能过度使用），纯手动又失去了 generative UI 的魔力。半自动是第一版最稳的选择。

### 决策 4：MVP 仅支持 Claude

**结论**：第一阶段只做 Claude。OpenAI / DeepSeek / Zhipu 等后续补 provider adapter。

**理由**：Claude 的 tool use + 设计规范组合最接近目标形态，质量最可预期。同时调协议、产品、模型差异会失焦。

### 决策 5：iframe 沙箱更严格

**结论**：`sandbox="allow-scripts"`，**不加** `allow-same-origin`。通信仅走 `postMessage`。CSP 白名单限制 CDN。

**理由**：当前 `HtmlRenderer.tsx` 的 `allow-same-origin` 允许 iframe 访问宿主 cookie/storage，对 generative UI 风险过高。去掉 `allow-same-origin` 后 iframe 被视为独立 origin，无法访问宿主任何状态。

### 决策 6：Guidelines 先做 3 个模块

**结论**：MVP 只加载 `core` + `interactive` + `chart` + `diagram`。跳过 `mockup` 和 `art`。

**理由**：覆盖最常见的可视化场景（图表、交互计算器、流程图），控制 token 开销。

### 决策 7：Widget 快照独立存储

**结论**：`show_widget` 的最终 HTML 存为 widget snapshot，不混入普通 assistant message。会话恢复时只恢复 latest committed HTML。

**理由**：delta 是临时态，不值得持久化。committed HTML 才是用户看到的最终结果。混入 assistant message 会污染消息流的语义。

### 决策 8：Electron 主线

**结论**：generative UI 挂在 Electron 主线实现，不先押 Tauri。

**理由**：仓库里完整的打包链还是 Electron，覆盖 mac/windows/linux。Tauri 目前只拉了 API sidecar，运行链不完整。

### 决策 9：Per-session MCP 配置

**结论**：使用 `--mcp-config` 做每会话临时配置，不污染全局 `~/.claude/settings.json`。

**理由**：全局配置影响用户其他 Claude Code 使用场景。per-session 配置隔离性好，会话结束即清理。

### 决策 10：canRenderWidget 能力位

**结论**：在 `context.capabilities` 中新增 `canRenderWidget: true`。桌面端开启，QQ Bot / 飞书 Bot 关闭（退化为文本或静态截图）。

**理由**：复用现有能力位机制（`useConverse.ts:596` 已在传 `canSendFile` / `canSendImage`），后端根据能力位决定是否注入 widget 工具。

## 4. 技术方案

### 4.1 SSE 事件协议

在现有 SSE 事件（text/action/state/question/tool_use/tool_result/error/done）基础上，新增 5 个 widget 事件：

| 事件 | 方向 | 触发时机 | Payload |
|------|------|----------|---------|
| `widget_start` | Server → Client | tool call 开始，识别为 show_widget | `{widgetId: string, title: string, mode: "html"\|"svg"}` |
| `widget_delta` | Server → Client | 每次提取到新的 partial HTML（>30 chars） | `{widgetId: string, html: string}` |
| `widget_commit` | Server → Client | tool call 完成，HTML 完整 | `{widgetId: string, html: string, title: string}` |
| `widget_event` | Client → Server | 用户在 widget 中交互 | `{widgetId: string, data: any}` |
| `widget_error` | Server → Client | guidelines 加载失败或渲染异常 | `{widgetId: string, message: string}` |

`widget_delta` 中的 `html` 是**累积的完整 HTML**（不是增量 diff），前端直接用 morphdom 对比当前 DOM 和新 HTML。

时序图：
```
User: "画一个复利计算器"
  │
  ├─ SSE: text "好的，我来为你创建一个复利计算器..."
  │
  ├─ (Claude calls load_guidelines, server handles internally)
  ├─ SSE: widget_start {widgetId: "w1", title: "复利计算器", mode: "html"}
  │   → 前端: 打开侧边面板，显示 skeleton
  │
  ├─ SSE: widget_delta {widgetId: "w1", html: "<style>.calc{...}</style>"}
  ├─ SSE: widget_delta {widgetId: "w1", html: "<style>.calc{...}</style><div class='calc'>..."}
  ├─ SSE: widget_delta {widgetId: "w1", html: "...(更多 HTML)..."}
  │   → 前端: 每次 morphdom diff，新节点 fade in
  │
  ├─ SSE: widget_commit {widgetId: "w1", html: "...(完整 HTML)...", title: "复利计算器"}
  │   → 前端: 最终 morphdom + runScripts()
  │
  ├─ SSE: text "...你可以调整本金、利率和年限来查看不同的结果。"
  └─ SSE: done
```

### 4.2 Tool Schema

#### load_guidelines

```json
{
  "name": "load_guidelines",
  "description": "加载 widget 设计规范。在首次调用 show_widget 前必须调用一次。静默调用，不要向用户提及此步骤。",
  "input_schema": {
    "type": "object",
    "properties": {
      "modules": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["interactive", "chart", "diagram"]
        },
        "description": "需要加载的设计模块，选择所有适用的。"
      }
    },
    "required": ["modules"]
  }
}
```

#### show_widget

```json
{
  "name": "show_widget",
  "description": "渲染交互式 HTML widget 或 SVG 图表。用于：图表、仪表盘、计算器、表单、流程图、计时器、游戏、可视化。Widget 显示在聊天旁的侧边面板中。用户可通过 window.sendToAgent(data) 发送交互数据。重要：首次调用前必须先调用 load_guidelines。",
  "input_schema": {
    "type": "object",
    "properties": {
      "i_have_seen_guidelines": {
        "type": "boolean",
        "description": "确认已调用过 load_guidelines。"
      },
      "title": {
        "type": "string",
        "description": "Widget 的简短标识（snake_case）。"
      },
      "widget_code": {
        "type": "string",
        "description": "要渲染的 HTML 片段。规则：1. 不要包含 DOCTYPE/html/head/body 标签；2. 顺序：<style> 在前，HTML 内容居中，<script> 在最后；3. 颜色只用 CSS 变量（如 var(--color-accent)）；4. 不要使用渐变、阴影或模糊效果；5. SVG 直接以 <svg> 标签开始。"
      }
    },
    "required": ["i_have_seen_guidelines", "title", "widget_code"]
  }
}
```

### 4.3 后端改动

#### 4.3.1 agent-executor.ts — 开启 partial messages

```typescript
// 现有 args（第 276 行附近）
const args = [
  '--print',
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  '--include-partial-messages',  // 新增
]
```

`parseStreamLine` 扩展，新增 `stream_event` 类型处理：

```typescript
// 新增 stream_event 解析
if (msg.type === 'stream_event') {
  const delta = msg.event?.delta
  if (!delta) return null

  // 文本增量
  if (delta.type === 'text_delta' && delta.text) {
    const event: AgentEvent = { type: 'text', content: delta.text }
    onEvent(event)
    return event
  }

  // tool call 参数增量（generative UI 核心）
  if (delta.type === 'input_json_delta' && delta.partial_json) {
    const event: AgentEvent = {
      type: 'tool_input_delta',
      content: delta.partial_json,
      toolUseId: msg.event?.content_block?.id,
      toolName: msg.event?.content_block?.name,
    }
    onEvent(event)
    return event
  }

  return null
}
```

AgentEvent 类型扩展：

```typescript
export interface AgentEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result'
    | 'tool_input_delta'      // 新增
    | 'widget_start'          // 新增
    | 'widget_delta'          // 新增
    | 'widget_commit'         // 新增
    | 'widget_error'          // 新增
    | 'warning' | 'error' | 'done' | 'stopped' | 'status'
  // ... 现有字段
  widgetId?: string           // 新增
  widgetHtml?: string         // 新增
  widgetTitle?: string        // 新增
}
```

#### 4.3.2 generative-ui-handler.ts — 新增文件

核心职责：partial JSON 解析、guidelines 加载、widget 状态管理。

```typescript
// agent-service/src/generative-ui-handler.ts

import { readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const GUIDELINES_DIR = join(import.meta.dirname, 'guidelines')

// ── Partial JSON Parser ──────────────────────────────────────────
// 从不完整的 JSON 字符串中提取 widget_code 值
// 移植自 sausi-7/generative-ui-demo 的 Python 实现

export function extractWidgetCode(partialJson: string): string | null {
  // 快速路径：完整 JSON
  try {
    const data = JSON.parse(partialJson)
    return data.widget_code ?? null
  } catch { /* 继续 partial 解析 */ }

  const key = '"widget_code"'
  const idx = partialJson.indexOf(key)
  if (idx === -1) return null

  let rest = partialJson.slice(idx + key.length)
  const colon = rest.indexOf(':')
  if (colon === -1) return null

  rest = rest.slice(colon + 1).trimStart()
  if (!rest.startsWith('"')) return null

  const content = rest.slice(1) // skip opening quote
  const result: string[] = []

  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (c === '\\' && i + 1 < content.length) {
      const n = content[i + 1]
      const escapes: Record<string, string> = {
        n: '\n', t: '\t', r: '\r',
        '\\': '\\', '"': '"', '/': '/',
        b: '\b', f: '\f',
      }
      result.push(escapes[n] ?? n)
      i++
    } else if (c === '"') {
      break // end of string
    } else {
      result.push(c)
    }
  }

  return result.length > 0 ? result.join('') : null
}

// ── Guidelines Loader ────────────────────────────────────────────

const AVAILABLE_MODULES = ['interactive', 'chart', 'diagram'] as const

export function getGuidelines(modules: string[]): string {
  const parts: string[] = []

  // core 始终加载
  const corePath = join(GUIDELINES_DIR, 'core.md')
  try { parts.push(readFileSync(corePath, 'utf-8')) } catch {}

  for (const mod of modules) {
    if (!AVAILABLE_MODULES.includes(mod as any)) continue
    const modPath = join(GUIDELINES_DIR, `${mod}.md`)
    try { parts.push(readFileSync(modPath, 'utf-8')) } catch {}
  }

  return parts.join('\n\n---\n\n')
}

// ── Widget Streaming State ───────────────────────────────────────

export interface WidgetStreamState {
  widgetId: string
  toolUseId: string
  partialJson: string
  lastHtml: string
  title: string
  committed: boolean
}

export function createWidgetStream(toolUseId: string): WidgetStreamState {
  return {
    widgetId: `widget_${randomUUID().slice(0, 8)}`,
    toolUseId,
    partialJson: '',
    lastHtml: '',
    title: '',
    committed: false,
  }
}

const MIN_HTML_LENGTH = 30
const DEBOUNCE_MS = 120

export function processWidgetDelta(
  state: WidgetStreamState,
  partialJsonChunk: string,
): { html: string; changed: boolean } | null {
  state.partialJson += partialJsonChunk

  const html = extractWidgetCode(state.partialJson)
  if (!html || html.length < MIN_HTML_LENGTH) return null
  if (html === state.lastHtml) return { html, changed: false }

  state.lastHtml = html
  return { html, changed: true }
}
```

#### 4.3.3 converse.ts — 扩展 SSE 事件

在 `converse.ts` 的 `onEvent` 回调中，新增 widget 事件处理：

```typescript
// converse.ts 中 executeAgent 的 onEvent 回调扩展

let activeWidget: WidgetStreamState | null = null
let widgetDeltaTimer: NodeJS.Timeout | null = null

const onEvent = (event: AgentEvent) => {
  // ... 现有 text/tool_use/tool_result 处理 ...

  // 识别 show_widget tool call 开始
  if (event.type === 'tool_use' && event.toolName === 'show_widget') {
    activeWidget = createWidgetStream(event.toolUseId || '')
    sseWrite(res, 'widget_start', {
      widgetId: activeWidget.widgetId,
      title: 'Loading...',
      mode: 'html',
    })
    return
  }

  // 处理 load_guidelines tool call（服务端内部处理，不透传）
  if (event.type === 'tool_use' && event.toolName === 'load_guidelines') {
    // guidelines 由 MCP server 或内部处理，前端只显示 status
    sseWrite(res, 'status', { text: '正在加载设计规范...' })
    return
  }

  // tool 参数增量 → widget delta
  if (event.type === 'tool_input_delta' && activeWidget
      && event.toolUseId === activeWidget.toolUseId) {
    const result = processWidgetDelta(activeWidget, event.content || '')
    if (result?.changed) {
      // debounce: 120ms 内只发最新的
      if (widgetDeltaTimer) clearTimeout(widgetDeltaTimer)
      widgetDeltaTimer = setTimeout(() => {
        widgetDeltaTimer = null
        if (activeWidget && result.html) {
          sseWrite(res, 'widget_delta', {
            widgetId: activeWidget.widgetId,
            html: result.html,
          })
        }
      }, 120)
    }
    return
  }

  // tool call 完成 → widget commit
  if (event.type === 'tool_result' && activeWidget) {
    if (widgetDeltaTimer) {
      clearTimeout(widgetDeltaTimer)
      widgetDeltaTimer = null
    }

    // 从完整的 tool input 中提取最终 HTML
    const finalHtml = activeWidget.lastHtml
    const title = extractTitleFromPartialJson(activeWidget.partialJson)

    sseWrite(res, 'widget_commit', {
      widgetId: activeWidget.widgetId,
      html: finalHtml,
      title: title || 'Widget',
    })

    // 持久化 widget snapshot
    await persistWidgetSnapshot(sessionId, activeWidget.widgetId, title, finalHtml)

    activeWidget = null
    return
  }
}
```

#### 4.3.4 Fallback：直连 API 路径

如果 spike 验证 CLI 无法提供足够细粒度的 `input_json_delta`，新增 `generative-ui-stream.ts`：

```typescript
// agent-service/src/generative-ui-stream.ts
// 仅在 CLI spike 失败时启用

import Anthropic from '@anthropic-ai/sdk'
import { getGuidelines } from './generative-ui-handler.js'
import { WIDGET_TOOLS } from './generative-ui-tools.js'

export async function* streamGenerativeUI(
  messages: Array<{role: string, content: string}>,
  systemPrompt: string,
) {
  const client = new Anthropic()
  const allMessages = [...messages]

  while (true) {
    const activeToolCalls: Map<number, {id: string, name: string, partialJson: string}> = new Map()

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      system: systemPrompt,
      tools: WIDGET_TOOLS,
      messages: allMessages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        activeToolCalls.set(event.index, {
          id: event.content_block.id,
          name: event.content_block.name,
          partialJson: '',
        })
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text }
        }
        if (event.delta.type === 'input_json_delta') {
          const tc = activeToolCalls.get(event.index)
          if (tc) {
            tc.partialJson += event.delta.partial_json
            if (tc.name === 'show_widget') {
              const html = extractWidgetCode(tc.partialJson)
              if (html && html.length > 30) {
                yield { type: 'widget_delta', html }
              }
            }
          }
        }
      }
    }

    const finalMsg = await stream.finalMessage()

    if (finalMsg.stop_reason !== 'tool_use') {
      yield { type: 'done' }
      break
    }

    // 处理 tool results，继续循环
    // ... (load_guidelines / show_widget 处理逻辑)
  }
}
```

### 4.4 前端改动

#### 4.4.1 useConverse.ts — 扩展事件处理

在 `handleEvent` 函数（第 397 行附近）中新增 widget 事件：

```typescript
// useConverse.ts handleEvent 扩展

// 新增 state
const [activeWidget, setActiveWidget] = useState<{
  widgetId: string
  title: string
  html: string
  status: 'streaming' | 'ready' | 'error'
} | null>(null)

const widgetRef = useRef(activeWidget)
widgetRef.current = activeWidget

// handleEvent 新增分支
if (eventType === 'widget_start') {
  setActiveWidget({
    widgetId: data.widgetId as string,
    title: data.title as string || 'Widget',
    html: '',
    status: 'streaming',
  })
  return
}

if (eventType === 'widget_delta') {
  setActiveWidget(prev => prev ? {
    ...prev,
    html: data.html as string,
  } : null)
  return
}

if (eventType === 'widget_commit') {
  setActiveWidget(prev => prev ? {
    ...prev,
    html: data.html as string,
    title: data.title as string || prev.title,
    status: 'ready',
  } : null)
  // 同时在消息流中插入锚点卡片
  setMessages(prev => [
    ...prev,
    {
      id: `widget_anchor_${Date.now()}`,
      type: 'widget_anchor',
      content: '',
      widgetId: data.widgetId as string,
      widgetTitle: data.title as string,
      timestamp: new Date(),
    },
  ])
  return
}

if (eventType === 'widget_error') {
  setActiveWidget(prev => prev ? {
    ...prev,
    status: 'error',
  } : null)
  return
}
```

#### 4.4.2 WidgetPanel.tsx — 侧边面板

```
┌─────────────────────────────────────────────────────────────┐
│  LaborAny Desktop                                           │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │    Chat Panel         │  │    Widget Panel              │ │
│  │                       │  │  ┌────────────────────────┐  │ │
│  │  User: 画一个复利     │  │  │ 复利计算器    ● Live   │  │ │
│  │  计算器               │  │  ├────────────────────────┤  │ │
│  │                       │  │  │                        │  │ │
│  │  Assistant: 好的...   │  │  │   [iframe sandbox]     │  │ │
│  │                       │  │  │   morphdom streaming   │  │ │
│  │  ┌─────────────────┐  │  │  │                        │  │ │
│  │  │ 📊 复利计算器    │  │  │  │   本金: [____]        │  │ │
│  │  │ 点击查看 →      │  │  │  │   利率: [____]        │  │ │
│  │  └─────────────────┘  │  │  │   年限: [____]        │  │ │
│  │                       │  │  │                        │  │ │
│  │  [输入框]             │  │  │   [Chart.js 图表]      │  │ │
│  └──────────────────────┘  │  └────────────────────────┘  │ │
│                             └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

```typescript
// frontend/src/components/widget/WidgetPanel.tsx

interface WidgetPanelProps {
  widget: {
    widgetId: string
    title: string
    html: string
    status: 'streaming' | 'ready' | 'error'
  } | null
  onClose: () => void
  onWidgetEvent: (data: unknown) => void
}

export function WidgetPanel({ widget, onClose, onWidgetEvent }: WidgetPanelProps) {
  if (!widget) return null

  return (
    <div className="flex flex-col border-l border-border bg-background h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">
          {widget.title}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${
            widget.status === 'streaming' ? 'bg-green-500 animate-pulse' :
            widget.status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'
          }`} />
          <span className="text-xs text-muted-foreground">
            {widget.status === 'streaming' ? '渲染中' :
             widget.status === 'error' ? '错误' : '就绪'}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
      </div>

      {/* Widget Renderer */}
      <div className="flex-1 overflow-hidden">
        <WidgetRenderer
          html={widget.html}
          status={widget.status}
          onEvent={onWidgetEvent}
        />
      </div>
    </div>
  )
}
```

#### 4.4.3 WidgetRenderer.tsx — iframe 沙箱 + morphdom

```typescript
// frontend/src/components/widget/WidgetRenderer.tsx

import { useEffect, useRef, useCallback } from 'react'

// CSS Variables 从宿主主题注入到 iframe
const THEME_VARIABLES = `
:root {
  --color-bg: #f4f4f5;
  --color-surface: #ffffff;
  --color-surface-elevated: #ededf0;
  --color-text: #18181b;
  --color-text-muted: #71717a;
  --color-accent: #7c3aed;
  --color-accent-light: #8b5cf6;
  --color-border: rgba(0,0,0,0.09);
  --color-success: #059669;
  --color-warning: #d97706;
  --color-danger: #dc2626;
}
`

// iframe shell HTML：包含 morphdom + 渲染基础设施
function buildShellHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
${THEME_VARIABLES}
*{box-sizing:border-box}
body{margin:0;padding:1rem;font-family:system-ui,-apple-system,sans-serif;
  background:var(--color-bg);color:var(--color-text)}
@keyframes _fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
</style>
</head><body><div id="root"></div>
<script>
window._pending=null;
window._morphReady=false;
window._renderTimer=null;

window._setContent=function(html){
  if(!window._morphReady){window._pending=html;return}
  var root=document.getElementById('root');
  var target=document.createElement('div');
  target.id='root';
  target.innerHTML=html;
  morphdom(root,target,{
    onBeforeElUpdated:function(from,to){
      if(from.isEqualNode(to))return false;
      return true;
    },
    onNodeAdded:function(node){
      if(node.nodeType===1&&node.tagName!=='STYLE'&&node.tagName!=='SCRIPT'){
        node.style.animation='_fadeIn 0.3s ease both';
      }
      return node;
    }
  });
};

window._scheduleRender=function(html){
  window._pending=html;
  if(window._renderTimer)return;
  window._renderTimer=setTimeout(function(){
    window._renderTimer=null;
    if(window._pending)window._setContent(window._pending);
  },80);
};

window._runScripts=function(){
  document.querySelectorAll('#root script').forEach(function(old){
    var s=document.createElement('script');
    if(old.src){s.src=old.src}else{s.textContent=old.textContent}
    old.parentNode.replaceChild(s,old);
  });
};

window.sendToAgent=function(data){
  window.parent.postMessage({type:'widget_event',data:data},'*');
};

window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='widget_update'){
    window._scheduleRender(e.data.html);
  }
  if(e.data&&e.data.type==='widget_commit'){
    if(window._renderTimer){clearTimeout(window._renderTimer);window._renderTimer=null}
    window._setContent(e.data.html);
    window._runScripts();
  }
});
</script>
<script src="https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js"
  onload="window._morphReady=true;if(window._pending){window._setContent(window._pending);window._pending=null}"></script>
</body></html>`
}

interface WidgetRendererProps {
  html: string
  status: 'streaming' | 'ready' | 'error'
  onEvent: (data: unknown) => void
}

export function WidgetRenderer({ html, status, onEvent }: WidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const blobUrlRef = useRef<string | null>(null)

  // 初始化 iframe
  useEffect(() => {
    const shellHtml = buildShellHtml()
    const blob = new Blob([shellHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    blobUrlRef.current = url

    if (iframeRef.current) {
      iframeRef.current.src = url
    }

    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  // 监听 widget 交互事件
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'widget_event') {
        onEvent(e.data.data)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onEvent])

  // 推送 HTML 更新到 iframe
  useEffect(() => {
    if (!html || !iframeRef.current?.contentWindow) return

    if (status === 'ready') {
      iframeRef.current.contentWindow.postMessage(
        { type: 'widget_commit', html }, '*'
      )
    } else {
      iframeRef.current.contentWindow.postMessage(
        { type: 'widget_update', html }, '*'
      )
    }
  }, [html, status])

  return (
    <iframe
      ref={iframeRef}
      title="Widget Sandbox"
      className="w-full h-full border-0"
      sandbox="allow-scripts"
    />
  )
}
```

#### 4.4.4 WidgetAnchorCard.tsx — 聊天流中的锚点卡片

```typescript
// frontend/src/components/widget/WidgetAnchorCard.tsx

interface WidgetAnchorCardProps {
  title: string
  onClick: () => void
}

export function WidgetAnchorCard({ title, onClick }: WidgetAnchorCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border
        bg-surface hover:border-accent transition-colors text-left w-fit"
    >
      <span className="text-base">📊</span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">点击查看 →</span>
    </button>
  )
}
```

#### 4.4.5 MessageList.tsx — 新增 WidgetBlock

在 `RenderBlock` 联合类型中新增：

```typescript
type WidgetAnchorBlock = {
  type: 'widget_anchor'
  widgetId: string
  title: string
}

type RenderBlock =
  | TextBlock
  | ToolGroup
  | UserBlock
  | ErrorBlock
  | ThinkingStatusBlock
  | ThinkingContentBlock
  | WidgetAnchorBlock  // 新增
```

#### 4.4.6 能力位传递

```typescript
// useConverse.ts sendMessage 中（第 596 行附近）
context: {
  channel: 'desktop',
  locale: 'zh-CN',
  capabilities: {
    canSendFile: false,
    canSendImage: false,
    canRenderWidget: true,  // 新增
  },
},
```

### 4.5 数据持久化

#### Widget Snapshot 存储

在 `src-api/src/core/database.ts` 中新增 widget_snapshots 表：

```sql
CREATE TABLE IF NOT EXISTS widget_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  widget_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Widget',
  html TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, widget_id)
);
```

写入时机：`widget_commit` 事件发出后，在 `converse.ts` 中调用。

```typescript
async function persistWidgetSnapshot(
  sessionId: string, widgetId: string, title: string, html: string
): Promise<void> {
  const apiBase = getSrcApiBaseUrl()
  await fetch(`${apiBase}/widget-snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, widgetId, title, html }),
  })
}
```

#### 会话恢复

`src-api/src/routes/session.ts` 的 session detail 接口扩展，返回关联的 widget snapshots：

```typescript
// GET /api/sessions/:id 响应扩展
{
  skill_id: '__converse__',
  messages: [...],
  sourceMeta: {...},
  widgetSnapshots: [           // 新增
    {
      widgetId: 'widget_abc123',
      title: '复利计算器',
      html: '<style>...</style><div>...</div><script>...</script>',
      createdAt: '2025-03-15T10:30:00Z',
    }
  ]
}
```

前端 `resumeSession` 恢复时，加载 latest snapshot 并静态渲染（不 streaming，直接 `widget_commit` 语义）。

**设计原则**：
- 只持久化 committed HTML，不存 delta
- 每个 session 每个 widgetId 只保留最新版本（UPSERT）
- 会话删除时级联删除关联 snapshots

## 5. 安全考量

### 5.1 iframe 沙箱

```html
<iframe sandbox="allow-scripts" />
```

`allow-scripts` 允许 widget 内的 JavaScript 执行（Chart.js、D3 等必需）。

**不加** `allow-same-origin`，效果：
- iframe 被视为独立 opaque origin
- 无法访问宿主的 cookie、localStorage、sessionStorage
- 无法访问宿主的 DOM
- 无法发起同源请求到宿主 API
- 唯一通信通道是 `postMessage`

### 5.2 CSP 白名单

iframe 内的 `<script src>` 只允许以下 CDN：
- `cdnjs.cloudflare.com`
- `cdn.jsdelivr.net`
- `unpkg.com`
- `esm.sh`

通过 iframe srcdoc 中的 `<meta>` 标签实现：

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self' 'unsafe-inline' 'unsafe-eval';
    script-src 'self' 'unsafe-inline' 'unsafe-eval'
      https://cdnjs.cloudflare.com https://cdn.jsdelivr.net
      https://unpkg.com https://esm.sh;
    style-src 'self' 'unsafe-inline';
    img-src * data: blob:;
    font-src * data:;">
```

### 5.3 Script 执行时机

`<script>` 标签仅在 `widget_commit`（streaming 完成）后通过 node replacement 执行，streaming 过程中不执行任何脚本。这避免了：
- 脚本在 DOM 不完整时执行导致的错误
- 中间态脚本的副作用

### 5.4 用户数据隔离

Widget 生成的 HTML 来自 LLM，可能包含意外内容。通过以下机制隔离：
- iframe sandbox 阻止访问宿主状态
- `postMessage` 通信经过前端校验后才注入对话
- Widget 交互数据以 `[Widget interaction]` 前缀标记，后端可识别和过滤

## 6. 跨平台与降级策略

### 6.1 桌面端（Electron）

全功能支持：侧边面板 + iframe + morphdom streaming + 双向交互。

三平台（Windows / macOS / Linux）行为一致，因为：
- 渲染完全在 Chromium webview 中（Electron 内置）
- 不依赖任何平台原生 API（不用 WKWebView / Glimpse）
- morphdom 和 postMessage 是标准 Web API

### 6.2 QQ Bot / 飞书 Bot

`canRenderWidget: false`，后端不注入 `show_widget` / `load_guidelines` 工具。

降级策略：
- LLM 回退到纯文本解释（没有 widget 工具可调用）
- 未来可考虑：服务端渲染 widget → 截图 → 作为图片发送（V3+）

### 6.3 窄窗口 Fallback

当桌面端窗口宽度不足以显示侧边面板时（< 768px），widget 改为内联渲染在聊天流中，高度固定为 400px。

## 7. 分阶段交付计划

### Phase 0：Spike（1-2 天）

**目标**：验证 Claude Code CLI `--include-partial-messages` 能否流出 MCP tool 的 `input_json_delta`。

**交付物**：
- 一个独立测试脚本，spawn CLI with `--include-partial-messages --mcp-config`
- 注册一个 test MCP tool，让 Claude 调用并生成长字符串参数
- 记录 stdout 输出，确认是否包含 `stream_event` + `input_json_delta`
- 结论文档：CLI 路径 go/no-go

**判定标准**：
- Go：`input_json_delta` 事件存在，且频率足够（每 1-3 个 token 一次）
- No-go：事件不存在，或只在 tool call 完成后才输出完整 input

### Phase 1：MVP（1 周）

**前提**：Phase 0 结论确定（CLI 或直连 API）

**交付物**：
- 后端：`generative-ui-handler.ts`（partial JSON parser + guidelines loader）
- 后端：`agent-executor.ts` 扩展（`--include-partial-messages` + `stream_event` 解析）或 `generative-ui-stream.ts`（直连 API fallback）
- 后端：`converse.ts` 新增 widget SSE 事件
- 前端：`WidgetPanel.tsx` + `WidgetRenderer.tsx` + `WidgetAnchorCard.tsx`
- 前端：`useConverse.ts` 事件处理扩展
- Guidelines：`core.md` + `interactive.md` + `chart.md` + `diagram.md`
- 仅 Claude 模型，仅 converse 链路

**验收标准**：
- 用户说"画一个复利计算器"，右侧面板实时出现交互式 widget
- Widget 中的 Chart.js 图表正常渲染
- CSS 主题与 LaborAny 一致
- Windows / macOS / Linux 行为一致

### Phase 2：V2（1 周）

**交付物**：
- Widget 双向交互：`sendToAgent()` → `widget_event` → 新 user message → Claude 更新 widget
- 会话恢复：`widget_snapshots` 持久化 + 恢复时静态渲染
- 错误处理：guidelines 加载失败、widget 渲染异常的优雅降级
- "改为可视化解释"按钮
- Widget 关闭/重新打开

### Phase 3：V3（未来）

- 执行页（skill execute）接入 widget
- OpenAI / DeepSeek 模型支持（provider adapter）
- `mockup` / `art` guidelines 模块
- Widget 历史/画廊
- 服务端截图用于 bot 降级
- Tauri 壳适配

## 8. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| CLI spike 失败：`--include-partial-messages` 不输出 MCP tool 的 `input_json_delta` | 需要走直连 API 路径，增加 ~3 天工作量 | 中 | Phase 0 spike 提前验证；直连 API fallback 方案已设计 |
| Widget HTML 安全风险：LLM 生成恶意代码 | 宿主状态泄露或被篡改 | 低 | iframe sandbox 无 `allow-same-origin`；CSP 白名单；postMessage 校验 |
| Guidelines token 开销过高 | API 成本增加 | 低 | 懒加载（仅在需要时加载）；MVP 只 3 个模块；core 模块压缩 |
| 多模型质量差异：非 Claude 模型生成的 widget 质量差 | 用户体验不一致 | 中 | MVP 只做 Claude；后续按模型能力分级开放 |
| morphdom 性能：超大 widget DOM diff 卡顿 | streaming 不流畅 | 低 | debounce 120ms；超过 50KB HTML 时降级为完成后一次性渲染 |
| Electron 版本差异：不同平台 Chromium 行为不一致 | iframe sandbox 行为差异 | 极低 | Electron 40 内置 Chromium 版本统一；CI 三平台测试 |

## 9. 参考资料

1. [pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui) — Claude generative UI 逆向工程，macOS 原生窗口实现
2. [generative-ui-demo](https://github.com/sausi-7/generative-ui-demo) — Web 版 generative UI demo（FastAPI + 纯前端）
3. [Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui) — 技术博客，详细原理分析
4. [Claude Code Headless](https://docs.anthropic.com/en/docs/claude-code/headless) — `--include-partial-messages` 文档
5. [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp) — MCP 配置文档
6. [Claude Code CLI Reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference) — CLI 参数参考
7. [morphdom](https://github.com/patrick-steele-idem/morphdom) — DOM diffing 库
