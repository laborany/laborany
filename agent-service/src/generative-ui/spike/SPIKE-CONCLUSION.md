# Generative UI — CLI Spike 结论

日期：2026-03-15

## 验证结果

### Gate A: CLI Spike

| 验证项 | 结果 | 说明 |
|--------|------|------|
| MCP 工具注入 | GO | `--mcp-config` 成功注入 load_guidelines 和 show_widget |
| Tool 调用 | GO | 模型正确调用了两个 tool，先 load_guidelines 再 show_widget |
| Partial messages | PARTIAL | `--include-partial-messages` 有效，能拿到 `input_json_delta`，但 CLI 做了 buffering |
| Delta 粒度 | NO-GO | 3073 字符的 widget_code 只产生 1 个 delta，不是逐 token 的 |
| Per-session 隔离 | GO | `--mcp-config` 是 per-invocation 的，不影响全局配置 |

### 关键发现

1. MCP server 必须用官方 `@modelcontextprotocol/sdk`，手写 Content-Length framing 会失败
2. Tool 名称自动加前缀：`mcp__<server-name>__<tool-name>`
3. CLI 的 `stream_event` 结构与 Anthropic API 一致：`content_block_start` / `content_block_delta` / `content_block_stop`
4. `input_json_delta` 存在但被 CLI 合并为单个大 chunk，无法驱动逐 token 的 streaming 渲染
5. 完整的 `assistant` message 在 `content_block_stop` 之后到达，包含完整的 tool input

### 事件流时序

```
stream_event: message_start
stream_event: content_block_start (text)
stream_event: content_block_delta (text_delta) × N
assistant: {text: "先加载设计规范。"}              ← 完整文本
stream_event: content_block_stop
stream_event: content_block_start (tool_use: load_guidelines)
stream_event: content_block_delta (input_json_delta) × 1  ← 合并后的完整 JSON
assistant: {tool_use: load_guidelines, input: {...}}       ← 完整 tool call
stream_event: content_block_stop
stream_event: message_delta (stop_reason: tool_use)
stream_event: message_stop
user: {tool_result: "guidelines text..."}                  ← MCP server 返回
stream_event: message_start                                ← 第二轮
stream_event: content_block_start (tool_use: show_widget)
stream_event: content_block_delta (input_json_delta) × 1  ← 3073 chars 一次到达
assistant: {tool_use: show_widget, input: {...}}
stream_event: content_block_stop
...
user: {tool_result: "Widget rendered..."}
stream_event: message_start                                ← 第三轮
stream_event: content_block_delta (text_delta) × N         ← 最终回复
assistant: {text: "复利计算器已渲染完成..."}
```

## 决策

### 主路径：CLI-first + 非流式渲染

由于 CLI 的 delta 粒度不足以驱动真正的 streaming widget 渲染，采用以下策略：

1. **CLI-first 路径**：使用 `--mcp-config` 注入 tool，通过 `content_block_start` 检测 `show_widget` 调用
2. **widget_start**：在 `content_block_start` (tool_use: show_widget) 时发出
3. **widget_commit**：在 `assistant` message 到达时（包含完整 tool input）发出，一次性渲染
4. **前端体验**：widget_start 时显示 skeleton loading，widget_commit 时一次性渲染完整 HTML

### 备选：Direct API 流式渲染

如果未来需要真正的逐 token streaming：

1. 直接调用 Anthropic API（不经过 CLI）
2. 逐 token 接收 `input_json_delta`
3. 用 partial JSON parser 提取累计 `widget_code`
4. 驱动 morphdom 增量渲染

### 推荐

MVP 先用 CLI-first 非流式方案，体验已经足够好（skeleton → 完整渲染）。
Direct API 作为 Phase 2 的可选升级路径。
