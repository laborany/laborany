# LaborAny Generative UI RFC

> 合并说明：该 RFC 已与 `docs/rfc-generative-ui.md` 合并为执行版开发计划，见 `docs/generative-ui-development-plan.md`
>
> 注意：本文保留为历史草稿。文中关于“只支持 Claude”“spike 失败后默认走直连 Anthropic API”等判断已过时，当前以 `docs/generative-ui-development-plan.md` 中的 `CLI-first + capability-tier` 方案为准。

状态：Draft

日期：2026-03-15

作者：Codex

## 1. 背景

Claude 最新的 generative UI 公开资料已经比较一致地指向同一套机制组合：

- UI 不混在自然语言里，而是通过工具调用参数单独输出
- 流式过程中需要从不完整的工具参数里提取当前可渲染片段
- 前端不是整块重渲染，而是对已有 DOM 做增量更新
- `<script>` 不应在中间态执行，只在最终提交时执行
- widget 需要继承宿主主题，但不能拿到宿主 DOM 权限
- widget 交互需要能把事件送回对话

对 LaborAny 而言，这个能力最适合先落在首页 `converse`，而不是 `execute`：

- `converse` 的典型需求是解释、对比、图解、流程说明，天然适合 widget
- `execute` 的主价值仍然是技能执行，widget 只是附属能力
- 先在 `converse` 落地，风险、范围和交互复杂度都更可控

## 2. 当前现状

当前仓库的关键现实如下：

- Electron 仍是主运行壳，`package.json` 的入口是 `electron/main.js`，Tauri 仍处于迁移中配套状态
- `converse` 路由当前复用 `executeAgent`，本质上仍是一条 Claude Code CLI 流式链路
- 后端 SSE 写法是标准 `event + data` 文本事件，但目前没有 widget 协议
- CLI 解析器只处理完整的 `text`、`tool_use`、`tool_result`，没有 partial tool args
- 前端 `useConverse` 只认识 `session/text/action/state/question/tool_use/tool_result/error/done`
- `MessageList` 当前只会组装用户消息、文本块、工具块、thinking 块，不存在 widget block
- 现有 Preview `HtmlRenderer` 使用 `sandbox="allow-scripts allow-same-origin"`，不适合作为 generative UI 的安全边界
- `sessions/messages` 已经有 `meta` JSON 字段，可以承载 widget 快照和附加状态

因此，本 RFC 的核心不是“怎么渲染 HTML”，而是“怎么把 widget 流安全地接进现有对话链路”。

## 3. 目标与非目标

### 3.1 目标

- 在 `converse` 中实现接近 Claude 风格的实时 generative UI
- 支持桌面端跨平台复用，不依赖 Electron 或 Tauri 的平台特性
- widget 在流式过程中持续更新，而不是等完整生成后一次性出现
- widget 交互可以回流到对话，形成新的后续问答
- 在 bot/远端通道中允许能力退化，而不是强行渲染

### 3.2 非目标

- 第一阶段不改造 `execute` 主链路
- 第一阶段不追求多模型统一协议
- 第一阶段不复用现有 Preview 面板
- 第一阶段不追求完全复制 claude.ai 的全部 guidelines 体系

## 4. 产品决策

### 4.1 渲染位置

MVP 采用“右侧 widget panel + 聊天流内锚点卡片”。

原因：

- 比纯内联更稳定，不会把聊天流打碎
- 比复用 Preview 更贴近 `converse` 的任务语义
- 右侧 panel 天然适合持续更新、放大查看和后续交互
- 窄屏时可以退化为内联展开

### 4.2 触发方式

MVP 采用半自动触发。

- 强触发词：`可视化`、`图解`、`流程图`、`画图`、`diagram`、`chart`
- 其余情况允许模型自行决定是否调用 widget，但只在满足能力位时开放
- UI 上提供一个显式入口，例如“改为可视化解释”

### 4.3 模型范围

MVP 只支持 Claude。

原因：

- LaborAny 当前首页对话路径本来就深度依赖 Claude Code CLI
- 先把协议、交互和安全模型做稳，再抽象到 OpenAI 兼容流
- 如果后续走直连 API 路径，OpenAI 支持会自然更容易补上

## 5. 关键决策：先 Spike，再决定主路径

### 5.1 决策前提

Claude 官方文档已经明确存在以下能力：

- Claude Code CLI 支持 `--output-format stream-json`
- Claude Code CLI 支持 `--include-partial-messages`
- Claude Code CLI 支持 `--mcp-config`
- Anthropic API 在工具流中会输出 `partial_json`
- Anthropic API 还有 fine-grained tool streaming beta，允许更早流出工具参数

但截至 2026-03-15，我没有在公开 CLI 文档里看到“工具参数增量事件格式”的明确承诺。也就是说：

- CLI 能输出部分消息，不等于它一定会把 `show_widget` 的参数以可消费的粒度暴露出来
- 现有 LaborAny 代码也没有解析 partial tool args 的能力

所以，这不是实现细节，而是主架构分叉点。

### 5.2 正式结论

本项目必须先做一个 Spike，用真实 Claude Code CLI 验证以下问题：

1. 在 `--output-format stream-json --include-partial-messages` 下，工具调用参数是否会提前暴露。
2. 暴露出来的是完整累计 JSON、局部 JSON，还是只有最终完整输入。
3. 这些中间态是否稳定到足以驱动 `widget_delta`。
4. 是否可以通过会话级 `--mcp-config` 注入 `show_widget` / `load_guidelines`，而不污染全局 `~/.claude/settings.json`。

### 5.3 路径选择规则

如果 Spike 成功：

- 继续沿用 Claude Code CLI 作为 `converse` 的主运行时
- 扩展现有流式协议和解析器
- 避免复制 Claude Code 的大量会话/工具/runtime 语义

如果 Spike 失败：

- 为 `converse` 单独新增一条直连 Anthropic API 的 generative UI 流
- 不改造整个 LaborAny runtime
- `execute`、skills、现有 CLI 驱动链路保持不动

这两条路径都要在 RFC 中预先设计好，不能等 Spike 失败后再临时补架构。

## 6. 推荐架构

### 6.1 顶层流程

```text
用户提问
  -> converse 路由判断是否进入 generative UI 模式
  -> 建立标准 SSE 响应
  -> 运行 Claude 路径（CLI Spike 成功则走 CLI；否则走 Direct API）
  -> 输出 text/widget/tool/error 事件
  -> 前端 useConverse 接收并更新消息流与 widget panel
  -> widget 交互通过 postMessage 回到前端
  -> 前端转为新的 user message 继续对话
```

### 6.2 能力位

请求上下文新增：

```ts
context.capabilities = {
  canSendFile: boolean
  canSendImage: boolean
  canRenderWidget: boolean
  canWidgetInteract?: boolean
}
```

建议：

- 桌面端：`canRenderWidget = true`
- QQ / 飞书 / cron：`canRenderWidget = false`

模型提示词中必须明确：当 `canRenderWidget = false` 时，不允许调用 widget 工具，退化成文本解释或后续截图方案。

## 7. SSE 事件协议

本 RFC 采用以下事件：

### 7.1 `widget_start`

用途：前端预先分配容器并显示 skeleton。

```json
{
  "widgetId": "w_123",
  "title": "TCP 三次握手图解",
  "mode": "html"
}
```

字段：

- `widgetId`: 当前 widget 的稳定 ID
- `title`: 面板标题
- `mode`: `html | svg`

### 7.2 `widget_delta`

用途：流式更新中间态内容。

```json
{
  "widgetId": "w_123",
  "html": "<div>...</div>"
}
```

约束：

- `html` 是当前累计完整 HTML，不是 patch
- 前端收到后用 `morphdom` 做 DOM diff
- 中间态不执行模型生成的 `<script>`

### 7.3 `widget_commit`

用途：最终提交，触发最后一次 DOM 对齐和脚本执行。

```json
{
  "widgetId": "w_123",
  "html": "<div>...</div>"
}
```

约束：

- 前端先做最后一次 `morphdom`
- 然后通过受控 node replacement 执行脚本
- 只持久化 commit 快照，不持久化每次 delta

### 7.4 `widget_event`

用途：widget 到 agent 的反向通道。

```json
{
  "widgetId": "w_123",
  "name": "node_click",
  "payload": {
    "nodeId": "syn_ack"
  }
}
```

MVP 语义：

- 前端收到 widget 内交互后，不把它回填为当前 tool result
- 统一转成新的 user message 注入对话

原因：

- widget 交互通常发生在 tool call 已结束之后
- 用“新 user turn”语义最简单，也最稳

### 7.5 `widget_error`

用途：展示 guidelines 加载失败、渲染失败或生成失败。

```json
{
  "widgetId": "w_123",
  "message": "Failed to render widget"
}
```

## 8. Tool 设计

### 8.1 `load_guidelines`

目标：按需懒加载设计规范，而不是一次性塞进主提示词。

建议 schema：

```json
{
  "name": "load_guidelines",
  "description": "Load widget design guidelines by module",
  "input_schema": {
    "type": "object",
    "properties": {
      "modules": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "layout",
            "typography",
            "chart",
            "diagram",
            "interaction"
          ]
        }
      }
    },
    "required": ["modules"]
  }
}
```

MVP 不需要完整搬运 72KB guidelines，可以先做缩小版：

- `layout`
- `chart`
- `diagram`
- `interaction`

### 8.2 `show_widget`

目标：以独立工具通道输出 widget。

建议 schema：

```json
{
  "name": "show_widget",
  "description": "Render or update a live widget",
  "input_schema": {
    "type": "object",
    "properties": {
      "widgetId": { "type": "string" },
      "title": { "type": "string" },
      "mode": {
        "type": "string",
        "enum": ["html", "svg"]
      },
      "widgetCode": { "type": "string" }
    },
    "required": ["widgetId", "title", "mode", "widgetCode"]
  }
}
```

约束：

- `widgetCode` 必须是完整累计内容
- 首次出现时发 `widget_start`
- 中间态持续发 `widget_delta`
- 完成时发 `widget_commit`

## 9. 后端设计

### 9.1 Converse 路由

`converse` 仍然作为统一入口，但增加 generative UI 模式分流：

- 判定请求是否满足可视化条件
- 判定 `context.capabilities.canRenderWidget`
- 判定当前模型是否支持该模式
- 满足条件时进入 generative UI runner

这个分流应当只影响首页对话，不影响现有执行链路。

### 9.2 Path A：CLI-first

适用条件：Spike 证明 Claude Code CLI 能稳定提供 tool 参数中间态。

实现方式：

- 扩展 `agent-executor.ts` 的 stream-json 解析器
- 识别 `show_widget` 的中间态参数
- 把累计 `widgetCode` 映射成 `widget_delta`
- 在工具结束时发 `widget_commit`

优点：

- 最大程度复用现有 Claude Code runtime
- 保留现有会话、记忆、工具生态一致性
- 不需要在 `converse` 重新实现完整 tool loop

风险：

- CLI 中间事件格式不是公开稳定契约
- 需要验证 MCP 工具在该链路里的稳定性

### 9.3 Path B：Direct API

适用条件：CLI Spike 失败，或者 CLI 中间态粒度不够稳定。

实现方式：

- 新增 `agent-service/src/generative-ui-stream.ts`
- 只给 `converse` 使用，不替代全局 runtime
- 用 `@anthropic-ai/sdk` 直接调用 `messages.stream()`
- 注册 `load_guidelines` 和 `show_widget`
- 维护一个轻量 tool loop

这里可以利用 Anthropic 官方的两层能力：

- 标准工具流里的 `partial_json`
- fine-grained tool streaming beta

优点：

- 协议更可控
- 更接近 claude.ai 的原生实现路径
- 后续扩展 OpenAI 兼容模型更自然

代价：

- `converse` 会出现一条独立于 Claude Code CLI 的专用流
- 需要自己维护工具循环、错误处理和中间态解析

### 9.4 Partial JSON 解析

如果走 Direct API 路径，后端需要一个小型 partial JSON parser，用来从工具参数中提取当前累计 `widgetCode`。

要求：

- 允许输入是不完整 JSON
- 在不破坏转义和字符串边界的前提下尽早提取 `widgetCode`
- 不依赖“等 JSON 完整再 parse”

这个解析器应该单独放在一个可测试模块中，不嵌进路由逻辑。

### 9.5 持久化

持久化策略：

- 文本消息照旧持久化
- widget 只持久化最终 commit 快照
- 不持久化每次 delta

建议：

- 继续复用 `messages.meta`
- 对应 assistant message 或单独 widget anchor message 里写入：

```json
{
  "widget": {
    "widgetId": "w_123",
    "title": "TCP 三次握手图解",
    "mode": "html",
    "html": "<div>...</div>",
    "version": 1
  }
}
```

这样既不需要重做数据库结构，也不影响现有消息恢复逻辑。

## 10. 前端设计

### 10.1 `useConverse`

需要扩展新的 SSE 事件：

- `widget_start`
- `widget_delta`
- `widget_commit`
- `widget_error`

建议做法：

- 文本流仍按现有方式累积
- widget 状态单独维护，不混进 assistant 纯文本字符串
- 当前轮次的 assistant 文本和 widget 可以并行存在

### 10.2 `MessageList`

新增一种 `WidgetBlock` 或 `WidgetAnchorBlock`：

- 聊天流内显示标题、状态、展开入口
- 实际渲染主体优先进入右侧 panel
- 在窄屏或 panel 不可见时允许内联降级

### 10.3 `WidgetPanel`

新增独立容器组件：

- 根据 `widgetId` 管理当前激活 widget
- 显示 skeleton、标题、错误态
- 承载 iframe

### 10.4 `WidgetRenderer`

核心要求：

- 使用独立 iframe
- 使用 `srcdoc` 注入宿主 bootstrap
- 使用 `morphdom` 在 iframe 内部更新 DOM
- 中间态禁止脚本执行
- commit 时才执行脚本

推荐 iframe sandbox：

```html
sandbox="allow-scripts"
```

不建议直接复用 Preview 的 `allow-same-origin` 方案。

原因：

- generative UI 是模型生成代码，不应获得更强同源权限
- widget 与宿主通信只需要 `postMessage`
- 去掉 `allow-same-origin` 后，安全边界更清晰

### 10.5 主题桥接

widget 使用 CSS variables，而不是复制宿主样式表。

建议注入：

- 颜色变量
- 字体变量
- 圆角
- 阴影
- 间距基准

渲染器在 iframe 的 `:root` 中写入这些变量，widget 自己只消费变量名。

### 10.6 双向通信

widget 内部暴露一个稳定桥：

```js
window.sendToAgent = (payload) => {
  window.parent.postMessage(
    { source: 'laborany-widget', widgetId, payload },
    '*'
  )
}
```

宿主收到后：

- 校验来源和 schema
- 转成 `widget_event`
- 作为新的 user message 再次调用 `sendMessage`

MVP 不做“继续当前 tool call”的复杂语义。

## 11. 安全模型

本方案的安全边界必须比普通 HTML 预览更严格。

### 11.1 隔离原则

- widget 只运行在 iframe 内
- 不允许直接注入宿主 DOM
- 不共享宿主 JS 上下文

### 11.2 sandbox

- 默认只开 `allow-scripts`
- 不开 `allow-same-origin`
- 不开 `allow-top-navigation`
- 不开 `allow-popups`
- 不开 `allow-forms`

### 11.3 CSP

建议在 `srcdoc` 中写入严格 CSP：

```text
default-src 'none';
img-src data: blob: https:;
style-src 'unsafe-inline';
script-src 'unsafe-inline';
font-src data:;
connect-src 'none';
media-src data: blob:;
frame-src 'none';
child-src 'none';
```

说明：

- 允许图片，但禁止主动联网请求
- 允许内联样式和受控脚本
- 不允许 iframe 再嵌套外部页面

### 11.4 脚本执行策略

- `widget_delta` 阶段只更新 DOM，不执行模型脚本
- `widget_commit` 阶段才用受控 replacement 执行脚本
- 每次 commit 前清理旧的 event bridge，避免重复注册

### 11.5 反向通道防护

- `postMessage` payload 必须做 schema 校验
- 必须校验 `widgetId`
- 加简单频率限制，避免 widget 高频刷消息

## 12. Guidelines 策略

MVP 不建议一开始就把完整逆向 guidelines 全量接入。

推荐分两步：

第一步：

- 维护缩小版 guidelines
- 重点覆盖布局、图表、交互、主题变量

第二步：

- 根据真实失败案例继续补模块
- 把 guidelines 做成独立 assets，而不是硬编码在 prompt 中

这样可以把主要复杂度留给 streaming pipeline，而不是 prompt 资产管理。

## 13. 测试与验收

### 13.1 Spike 验收

成功标准：

- CLI 能稳定流出 `show_widget` 的中间态参数
- 可以从中间态恢复出累计 `widgetCode`
- 中间态频率足够驱动前端肉眼可见的持续更新
- `--mcp-config` 能在会话级生效

如果任一项失败，直接切换到 Direct API 路径。

### 13.2 MVP 验收

- 用户输入“请把 TCP 三次握手画成图解释”时，`converse` 中出现流式 widget
- widget 在生成过程中持续变化
- 最终脚本只在 commit 后运行
- 点击 widget 内节点能触发新的 user turn
- 关闭并恢复会话后，能看到最后一次 commit 快照
- QQ/飞书等 `canRenderWidget = false` 场景不会触发 widget

## 14. 分阶段计划

### Phase 0：Spike

- 验证 Claude Code CLI partial messages 对工具参数的粒度
- 验证会话级 MCP 注入
- 产出结论：CLI-first 或 Direct API

### Phase 1：MVP

- 后端接入 widget SSE 协议
- 前端接入 `WidgetPanel`、`WidgetRenderer`
- 支持 `load_guidelines` / `show_widget`
- 支持 widget -> user message 回流

### Phase 2：硬化

- 完成快照恢复
- 加强 CSP 与 bridge 校验
- 补更多 guidelines 模块
- 补 e2e 测试

### Phase 3：扩展

- 评估 OpenAI 兼容 provider
- 评估 inline 模式与 bot 降级截图方案
- 视需要再讨论 `execute` 侧是否引入 widget

## 15. 建议落地顺序

推荐按下面顺序推进：

1. 先做 CLI Spike，不写大规模业务代码
2. 明确主路径后，再固定后端事件协议
3. 前端先做 `WidgetRenderer` 和 panel，不急着接复杂 guidelines
4. 最后做持久化恢复和交互回流

## 16. 结论

这件事在 LaborAny 里是可做的，而且不需要任何 macOS-only 技术。

最重要的不是“把逆向 demo 搬进来”，而是：

- 在 `converse` 中建立一条正式 widget 协议
- 用 Spike 先确认 Claude Code CLI 是否足够支撑
- 无论 CLI 成败，都把 Direct API 作为同等成熟的备用路径提前设计好

MVP 的正确目标不是“一次做到 claude.ai 同级别完整体验”，而是：

- Claude-only
- converse-only
- cross-platform
- side panel
- true streaming
- safe sandbox

只要这六点成立，后续扩展到更多模型和更多场景就是演进问题，不再是架构赌注。

## 17. 参考资料

- Claude Code CLI Reference: https://docs.anthropic.com/en/docs/claude-code/cli-reference
- Claude Code MCP docs: https://docs.anthropic.com/en/docs/claude-code/mcp
- Anthropic Streaming Messages API: https://docs.anthropic.com/en/docs/build-with-claude/streaming
- Anthropic Fine-grained tool streaming: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/fine-grained-tool-streaming
- Michaelliv reverse engineering write-up: https://michaellivs.com/blog/reverse-engineering-claude-generative-ui
- `pi-generative-ui`: https://github.com/Michaelliv/pi-generative-ui
- `generative-ui-demo`: https://github.com/sausi-7/generative-ui-demo
