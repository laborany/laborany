# LaborAny Generative UI 开发计划

状态：Active

日期：2026-03-16

来源：

- `docs/rfc-generative-ui.md`
- `docs/generative-ui-rfc.md`

适用范围：

- 主路径基于 `Claude Code CLI + per-session MCP`
- 桌面端 `converse` 与 `execute` 共用同一套 widget runtime
- 支持按 profile capability 分层：`full_stream` / `final_only` / 文本退化

## 0. 架构校正

这份计划基于 2026-03-16 的实现和验证结果，替换了早期 RFC 中两条已经被证明会走偏的假设：

- `generative UI` 的产品主路径不是“进入 widget 模式就绕过 Claude Code CLI 直连模型 API”，而是继续复用 `Claude Code CLI`，通过 per-session MCP 注入 `load_guidelines` / `show_widget`。
- 模型支持不是“只有官方 Anthropic Claude 才能做”，而是按 profile capability 决定：
  - `anthropic` 官方 Claude：`full_stream`
  - `anthropic` 兼容 profile（如 GLM、代理 Claude）：`final_only`
  - `openai_compatible` 普通 chat/tool-calling 模型：`final_only`
  - reasoning-first profile：文本退化，不启用 widget
- surface 也需要单独 gating：
  - `converse`：支持 `full_stream` 和 `final_only`
  - `execute`：当前只对 `full_stream` 开 widget；`final_only` 退化为文本解释，避免不稳定的工具绕路

因此，后续开发和测试都必须以 `CLI-first` 为前提，不能再把 direct API 当成默认产品路线。

## 1. 文档目标

这份文档用于把两份已有 RFC 合并为一份可执行的开发计划。

它解决三类问题：

- 哪些决策已经确定，可以直接开工
- 哪些点仍然是技术假设，必须先做 spike
- 后端、前端、资产、安全、测试应按什么顺序推进

本计划优先保证：

- 真正的流式 widget 渲染
- 桌面端跨平台一致性
- 对现有 Claude Code CLI runtime 的最小破坏
- iframe 隔离和脚本执行边界

## 2. 最终范围

### 2.1 In Scope

- 首页 `converse` 中的可视化解释能力
- `execute` 页面在 `full_stream` profile 上复用同一套 widget runtime
- HTML/SVG widget 的流式生成和渲染
- 右侧 `Widget Panel` + 聊天流内锚点卡片
- widget 到对话的新 user turn 回流
- 会话恢复时恢复最后一次 committed widget
- History / 已持久化会话中的 widget 恢复
- 桌面端 `canRenderWidget = true`，bot 通道退化

### 2.2 Out of Scope

- Preview 区域复用
- vendor-specific direct widget runtime
- bot 端截图回传
- 独立 `widget_snapshots` 表
- widget 历史版本 / 画廊
- 完整搬运 claude.ai 全量 guidelines

## 3. 已确认决策

### 3.1 产品与交互

- 桌面壳差异不进入实现层，generative UI 完全放在 web 层完成。
- `converse` 是主交互场景，`execute` 复用同一套 runtime，不另起一条渲染协议。
- `execute` 虽复用同一协议，但当前只在 `full_stream` profile 上启用 widget；兼容 profile 统一文本退化。
- 渲染位置采用右侧 `Widget Panel`，聊天流仅放 `WidgetAnchorCard`。
- 触发方式采用半自动：强触发词 + 模型自决 + 手动“改为可视化解释”入口。
- widget 交互统一回流为新的 user message，不回填为当前 tool result。

### 3.2 模型与运行时

- 主路径固定为 `Claude Code CLI + MCP`。
- 支持能力按 profile capability 分层，而不是按厂商品牌硬编码：
  - 官方 Anthropic Claude：`full_stream`
  - `anthropic` 兼容 profile：`final_only`
  - `openai_compatible` 普通 chat/tool-calling profile：`final_only`
  - reasoning-first profile：文本退化
- surface-specific gate：
  - `converse` 可承载 `final_only`
  - `execute` 当前要求 `full_stream`；兼容 profile 建议回到 `converse` 获取可视化解释
- direct API 可以作为未来独立实验或应急工具，但不是产品默认实现。

### 3.3 安全

- widget 只能在 iframe 中运行。
- iframe 默认只开 `sandbox="allow-scripts"`。
- 不允许 `allow-same-origin`。
- `widget_delta` 阶段不执行模型脚本，只在 `widget_commit` 后执行。
- 通信只走 `postMessage` + schema 校验。

### 3.4 跨平台与降级

- 桌面端开启 `canRenderWidget`。
- QQ / 飞书 / cron 等通道关闭 `canRenderWidget`，退化为文本解释。
- 窄窗口场景允许内联 fallback，但不作为主实现。

## 4. 合并裁决

两份原始文档存在少量冲突，这里给出最终裁决。

### 4.1 持久化方案

裁决：

- MVP 不新增 `widget_snapshots` 表。
- 先复用 `messages.meta` 持久化最后一次 committed widget。
- 如果 V2 需要多 widget 历史、版本回滚或跨消息查询，再单独引入 `widget_snapshots` 表。

原因：

- 当前数据库和 session 恢复链路已经支持 `meta` JSON。
- 先不做数据库迁移，能显著缩短 MVP 周期。

### 4.2 Tool Schema 命名

裁决：

- Tool 输入对模型使用 `snake_case`。
- 前后端内部事件和状态使用 `camelCase`。

推荐 tool 输入字段：

- `load_guidelines.modules`
- `show_widget.title`
- `show_widget.mode`
- `show_widget.widget_code`

说明：

- `widgetId` 由后端在 `widget_start` 时生成，不要求模型自己生成。
- 这样既贴近 Claude 现有公开样式，也减少模型在中间态里反复维护 ID 的负担。

### 4.3 Guidelines 模块

裁决：

- `core` 作为内部默认基础规范，总是加载。
- 当前可选模块为 `interactive`、`chart`、`diagram`、`layout`、`data-table`。
- `mockup` / `art` 继续延后。

### 4.4 外部脚本策略

裁决：

- MVP 不默认允许 widget 自带任意 CDN 脚本。
- `morphdom` 由宿主 shell 预置。
- widget 代码优先使用原生 HTML/CSS/SVG/Canvas。
- 如果确实需要图表库，优先考虑宿主预置单一受控库，而不是开放任意 `script src`。

原因：

- 这比“CSP 白名单 + 外部 CDN”更安全，也更稳定。
- 桌面端离线和网络波动场景更可控。

### 4.5 CLI 事件格式假设

裁决：

- 已通过 spike 和真实 profile 验证 `stream_event` / `input_json_delta` 可用于 widget 事件提取。
- 但不同 profile 的输出粒度不同，运行时仍需保留 capability 分层和 commit-only fallback。

原因：

- 官方能力存在，但 profile 侧代理、兼容层、模型族差异会影响中间态稳定性。

## 5. 核心决策门

### 5.1 Gate A：CLI Spike

状态：已完成。

结论：

- `Claude Code CLI --output-format stream-json --include-partial-messages` 可配合 per-session `--mcp-config` 驱动 generative UI。
- 对官方 Anthropic Claude profile，可稳定拿到足以驱动 `full_stream` 的中间态。
- 对 `anthropic` 兼容和 `openai_compatible` chat profile，应按 `final_only` 处理，不能假设所有 profile 都有同等级别的 partial fidelity。
- 因此，产品实现进入 capability-tier 路线，而不是“CLI 失败就整体切 direct API”。

产出要求：

- `--mcp-config` 必须保持 per-session 隔离
- 运行时必须按 profile capability 选择 `full_stream` / `final_only` / 文本退化
- 前端和持久化层只能依赖统一 widget SSE 协议，不能依赖 provider 私有直连流

### 5.2 Gate B：MVP 安全验收

在 MVP 合并前，必须确认：

- widget 不能访问宿主 cookie、storage、DOM
- 中间态脚本不会执行
- `postMessage` 事件已做来源和 schema 校验
- 会话恢复不会重复执行旧脚本副作用

## 6. 目标架构

### 6.1 运行路径

```text
用户输入
  -> /converse 或 /execute
  -> 根据能力位和意图判断是否启用 generative UI
  -> 解析 active model profile 的 widget capability
  -> 继续走 Claude Code CLI，并按需注入 per-session MCP tools
  -> official profile 走 full_stream；兼容 profile 在 converse 走 final_only，在 execute 文本退化；不支持的 profile 文本退化
  -> 统一输出 text/widget/error SSE 事件
  -> useConverse / useAgent 更新消息流 + Widget Panel
  -> widget 交互通过 postMessage 回流
  -> 前端转成新的 user turn
```

### 6.2 统一事件协议

服务端到前端：

- `widget_start`
- `widget_delta`
- `widget_commit`
- `widget_error`

前端到服务端：

- `widget_event`

推荐 payload：

```json
{
  "widget_start": {
    "widgetId": "w_123",
    "title": "复利计算器",
    "mode": "html"
  },
  "widget_delta": {
    "widgetId": "w_123",
    "html": "<div>...</div>"
  },
  "widget_commit": {
    "widgetId": "w_123",
    "html": "<div>...</div>",
    "title": "复利计算器"
  },
  "widget_error": {
    "widgetId": "w_123",
    "message": "Failed to render widget"
  },
  "widget_event": {
    "widgetId": "w_123",
    "name": "input_changed",
    "payload": {
      "principal": 1000
    }
  }
}
```

约束：

- `widget_delta.html` 是累计完整 HTML，不是 diff patch。
- `widget_commit` 触发最后一次 DOM 对齐和脚本执行。
- 只持久化 commit，不持久化 delta。

### 6.3 Tool 合同

#### `load_guidelines`

用途：

- 按需加载设计规范

输入：

```json
{
  "modules": ["interactive", "chart", "diagram"]
}
```

#### `show_widget`

用途：

- 输出当前 widget 的完整累计 HTML/SVG

输入：

```json
{
  "title": "compound_interest_calculator",
  "mode": "html",
  "widget_code": "<style>...</style><div>...</div><script>...</script>"
}
```

规则：

- 先 `load_guidelines`，后 `show_widget`
- `widget_code` 必须是完整累计内容
- `<style>` 在前，HTML 主体居中，`<script>` 在最后
- 不包含 `html/head/body/doctype`

### 6.4 持久化

MVP 写入 `messages.meta`：

```json
{
  "widget": {
    "widgetId": "w_123",
    "title": "复利计算器",
    "mode": "html",
    "html": "<div>...</div>",
    "status": "ready"
  }
}
```

恢复策略：

- 恢复会话时读取最后一个带 `widget` 元数据的消息
- 直接按 `widget_commit` 语义静态渲染
- 恢复阶段不重复流式更新

### 6.5 安全边界

iframe：

```html
sandbox="allow-scripts"
```

最低要求：

- 无 `allow-same-origin`
- 无 `allow-forms`
- 无 `allow-popups`
- 无 `allow-top-navigation`

脚本策略：

- `widget_delta` 只做 DOM 更新
- `widget_commit` 才执行脚本
- 执行前清理旧 bridge

通信策略：

- widget 仅可通过 `window.sendToAgent(payload)` 与宿主通信
- 宿主转发前必须校验 `widgetId`、事件名、payload 结构

## 7. 推荐目录与文件落点

### 7.1 后端

优先新增或改动：

- `agent-service/src/routes/converse.ts`
- `agent-service/src/agent-executor.ts`
- `agent-service/src/converse-prompt.ts`
- `agent-service/src/generative-ui/handler.ts`
- `agent-service/src/generative-ui/tools.ts`
- `agent-service/src/generative-ui/guidelines/core.md`
- `agent-service/src/generative-ui/guidelines/interactive.md`
- `agent-service/src/generative-ui/guidelines/chart.md`
- `agent-service/src/generative-ui/guidelines/diagram.md`

CLI spike 失败时额外新增：

- `agent-service/src/generative-ui/stream.ts`

### 7.2 前端

优先新增或改动：

- `frontend/src/hooks/useConverse.ts`
- `frontend/src/types/message.ts`
- `frontend/src/components/shared/MessageList.tsx`
- `frontend/src/components/widget/WidgetPanel.tsx`
- `frontend/src/components/widget/WidgetRenderer.tsx`
- `frontend/src/components/widget/WidgetAnchorCard.tsx`

### 7.3 API / 会话恢复

MVP 尽量不改数据库结构，只需要确认：

- `src-api/src/routes/session.ts` 返回 `messages.meta`
- 前端恢复逻辑能识别 `widget` 元数据

## 8. 分阶段实施

### Phase 0：CLI Spike

目标：

- 决定主运行路径

预估：

- 1 到 2 天

任务：

- 写一个独立脚本直接 spawn Claude Code CLI
- 开启 `--output-format stream-json --include-partial-messages`
- 通过 per-session `--mcp-config` 注入一个测试 tool
- 让模型生成一个很长的字符串参数
- 保存原始 JSON lines 日志
- 记录真实事件 schema 和更新频率

交付物：

- spike 脚本
- 一份原始日志样本
- 一份 go/no-go 结论文档

验收：

- 能明确判定 CLI-first 或 Direct API

### Phase 1：MVP

目标：

- 在桌面端 `converse` 中跑通真实 streaming widget

预估：

- Gate A 确定后 5 到 7 个工程日

后端任务：

- 扩展 `converse.ts` 支持 widget SSE 事件
- 新增 `generative-ui/handler.ts`
- 新增 guidelines loader
- 新增 partial JSON 提取逻辑
- CLI-first 时扩展 `agent-executor.ts` 解析中间态
- Direct API 时新增 `generative-ui/stream.ts`
- 在 prompt 中注入 widget 工具使用规则和能力位约束

前端任务：

- 扩展 `useConverse.ts` 接收 widget 事件
- 扩展 message 类型，支持 `widget_anchor`
- 在 `MessageList.tsx` 中渲染 anchor block
- 新增 `WidgetPanel`
- 新增 `WidgetRenderer`
- 打通 `postMessage` 回流为新的 user turn

资产任务：

- 完成 `core` / `interactive` / `chart` / `diagram` 四个 guidelines 文件
- 先覆盖流程图、图表、计算器、状态卡片等高频场景

MVP 验收：

- 输入“请画一个复利计算器”时，右侧出现流式 widget
- widget 在生成过程中持续变化，而不是最终一次性出现
- commit 前脚本不执行，commit 后脚本正常运行
- Widget Panel 在 macOS / Windows / Linux 行为一致
- 关闭并恢复会话后可看到最后一次 committed widget

### Phase 2：硬化

目标：

- 把 MVP 从“可演示”提升到“可长期维护”

预估：

- 4 到 5 个工程日

任务：

- 增加 `widget_error` 和失败退化路径
- 完善 `postMessage` schema 校验与节流
- 处理多次 commit / 重复脚本注册
- 为超大 HTML 做 debounce 或大小阈值控制
- 增加更多恢复场景测试
- 增加“改为可视化解释”显式入口

验收：

- 常见失败场景不会导致对话卡死
- widget 关闭、重新打开、恢复会话均稳定

### Phase 3：扩展

目标：

- 扩大能力边界，但不影响现有稳定链路

候选项：

- OpenAI 兼容 provider
- `execute` 页面接入
- bot 降级截图
- 独立 `widget_snapshots` 表
- widget 历史版本 / 画廊
- 更完整 guidelines 模块

## 9. 工作流拆分

### 9.1 后端工作流

1. 完成 Gate A spike
2. 固化 tool schema 和内部事件协议
3. 实现 widget delta 提取
4. 接入 `converse` SSE
5. 实现 commit 持久化和恢复

### 9.2 前端工作流

1. 扩展 `useConverse` 状态
2. 做 `WidgetPanel` 和 `WidgetRenderer`
3. 在 `MessageList` 挂 `WidgetAnchorCard`
4. 打通交互回流
5. 完成移动窄屏 fallback

### 9.3 资产工作流

1. 产出压缩版 guidelines
2. 写出示例 widget 样本
3. 用真实场景压测 prompt 质量

## 10. 测试计划

### 10.1 Spike 测试

- 验证 partial messages 是否包含可消费的 tool 参数中间态
- 验证 `--mcp-config` 的 per-session 行为

### 10.2 单元测试

- partial JSON 提取器
- guidelines loader
- widget event schema 校验

### 10.3 集成测试

- `converse` SSE 在 `widget_start -> widget_delta -> widget_commit` 的顺序正确
- 会话恢复能读出最后一次 widget
- `widget_event` 能变成新的 user turn

### 10.4 手工验收场景

- 复利计算器
- TCP 三次握手流程图
- 饼图 / 柱状图解释
- 交互式决策树
- 窄窗口 fallback
- bot 通道退化

## 11. 风险与缓解

### 11.1 CLI 中间态不可用

缓解：

- profile capability 分层
- `final_only` fallback
- 文本退化，而不是切换成另一套默认 runtime

### 11.2 widget 代码安全风险

缓解：

- iframe 严格 sandbox
- 不开放同源权限
- 中间态不执行脚本
- `postMessage` 做 schema 校验

### 11.3 widget HTML 过大导致卡顿

缓解：

- `widget_delta` 增加 debounce
- HTML 超阈值时减少更新频率
- 必要时降级为只在 commit 渲染

### 11.4 模型输出质量不稳定

缓解：

- 按 profile capability 分层，而不是做厂商特判
- 先用最小 guidelines 套件打高频场景
- 通过样本回归持续修 prompt

## 12. 成功标准

项目完成 MVP 后，应同时满足：

- 用户能在 `converse` 中获得真正 streaming 的可视化解释
- `execute` 能复用同一套 widget 协议，不再分叉 runtime
- 实现不依赖 macOS-only 能力
- Electron 和未来 Tauri 都能复用同一套前端实现
- 主链路仍然保留 Claude Code CLI 优先策略
- 不同 profile 之间能稳定落到 `full_stream` / `final_only` / 文本退化

## 13. 建议的继续执行顺序

1. 清理所有残留的 direct-runtime / official-Claude-only 假设。
2. 固化真实验证脚本，明确选择 widget-capable profile。
3. 围绕 capability-tier 继续补回归测试。
4. 按需扩充 guidelines 和更细的降级策略。
5. bot 截图回传、独立 snapshot 表等放到后续阶段。

## 14. 参考文档

- [rfc-generative-ui.md](/Users/chensnathan/Projects/laborany/docs/rfc-generative-ui.md)
- [generative-ui-rfc.md](/Users/chensnathan/Projects/laborany/docs/generative-ui-rfc.md)
