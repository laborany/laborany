# LaborAny 飞书 Bot 集成规范（v0.3.5）

> 更新时间：2026-02-23
> 适用版本：LaborAny v0.3.5

---

## 1. 概述

飞书 Bot 是 LaborAny 的远程触发入口，允许用户通过飞书消息远程执行任务，并以流式卡片实时回传结果。

功能定位：

- 与桌面端等价的任务执行能力（智能路由 + 技能执行）
- 飞书消息作为输入，流式卡片作为输出
- 自动复用 session 入库、memory 收集、skill 体系等现有能力

架构位置：飞书模块位于 `agent-service` 内部（与 cron 同级），通过 HTTP 调用 `src-api` 的 `/skill/execute` 完成执行。

---

## 2. 架构与调用链路

### 2.1 两阶段流程

```
飞书用户发消息
    ↓
agent-service: Lark WSClient (WebSocket 长连接)
    ↓
im.message.receive_v1 → feishu/handler.ts
    ↓
═══ 阶段一：Converse（意图分析 + skill 匹配）═══
    ↓
HTTP POST → agent-service /converse（本地调用）
    ↓
SSE 事件流：
  type=text    → 流式卡片显示分析过程
  type=action  → LABORANY_ACTION 决策 → 进入阶段二
  type=question → 回飞书追问，等待用户回复
  type=done    → converse 结束
    ↓
═══ 阶段二：Execute（实际执行）═══
    ↓
HTTP POST → src-api /api/skill/execute
    ↓
SSE 事件流 → 流式卡片实时更新
    ↓
src-api 自动完成：session 入库 / messages 入库 / memory 收集
```

### 2.2 与桌面端的等价关系

| 桌面端 | 飞书 Bot |
|--------|----------|
| 前端输入框 → converse | 飞书消息 → converse |
| 候选确认卡 → 用户点击 | 自动执行推荐 skill |
| ExecutionPanel 实时渲染 | 流式卡片实时更新 |
| 前端历史页面 | 同一数据库，自动可见 |

---

## 3. 模块结构

```
agent-service/src/feishu/     # 5 个文件
├── config.ts                  # 配置读取与类型定义
├── client.ts                  # Lark SDK 客户端工厂
├── handler.ts                 # 消息处理核心
├── streaming.ts               # 流式卡片（CardKit schema 2.0）
└── index.ts                   # 模块入口 + 用户状态管理
```

各文件职责：

- **config.ts** — 从环境变量读取飞书配置，纯函数 + 类型定义，零副作用
- **client.ts** — 创建 `Lark.Client`（REST API）和 `Lark.WSClient`（WebSocket 事件接收）
- **handler.ts** — 消息处理核心：接收飞书消息 → 解析内容 → 命令/converse 分发 → SSE 消费 → 卡片更新 → 产物回传
- **streaming.ts** — 流式卡片生命周期管理：创建 → 更新 → 关闭（移植自 openclaw，简化为单账号）
- **index.ts** — 模块启动/停止、用户状态管理（converseSessionId / executeSessionId / 消息历史）

---

## 4. 配置

所有配置通过环境变量读取，不侵入现有配置体系。

| 环境变量 | 必填 | 默认值 | 说明 |
|----------|------|--------|------|
| `FEISHU_ENABLED` | 是 | — | 设为 `true` 启用飞书 Bot |
| `FEISHU_APP_ID` | 是 | — | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | 是 | — | 飞书应用 App Secret |
| `FEISHU_ALLOW_USERS` | 否 | 空（全部允许） | 允许的用户 open_id，逗号分隔 |
| `FEISHU_REQUIRE_ALLOWLIST` | 否 | `false` | 设为 `true` 时，allowlist 为空则拒绝所有消息 |
| `FEISHU_DOMAIN` | 否 | `feishu` | `feishu`（国内）或 `lark`（国际版） |
| `FEISHU_BOT_NAME` | 否 | `LaborAny` | 流式卡片标题显示名 |
| `FEISHU_DEFAULT_SKILL` | 否 | `__generic__` | 默认技能 ID（通用执行时使用） |

---

## 5. 消息处理

### 5.1 支持的消息类型

| 类型 | 处理方式 |
|------|----------|
| `text` | 提取文本内容 |
| `image` | 下载图片到 uploads 目录，生成 fileId |
| `file` | 下载文件到 uploads 目录，生成 fileId |
| `audio` | 下载音频到 uploads 目录，生成 fileId |
| `media` | 下载视频到 uploads 目录，生成 fileId |
| `post`（富文本） | 提取文本 + 下载内嵌图片/文件 |

文件下载后通过 `[LABORANY_FILE_IDS: uuid1, uuid2]` 标记嵌入 query，后续复用现有文件水合链路。

### 5.2 命令系统

| 命令 | 功能 |
|------|------|
| `/new` | 重置会话（清除 converse + execute 状态） |
| `/help` | 显示帮助信息 |
| `/skill <id> [query]` | 跳过 converse，直接执行指定技能 |
| `/skills` | 列出可用技能 |
| `/stop` | 中止当前执行中的任务 |

### 5.3 Converse 多轮对话

- 用户回复 question 时，handler 检测到 `converseSessionId` 存在 → 继续走 converse，messages 包含完整历史
- converse 的 sessionId（`feishu-conv-{uuid}`）和 execute 的 sessionId（`feishu-{uuid}`）分开管理
- `/new` 命令同时清除两个 sessionId

### 5.4 Action 分发

| Action 类型 | 飞书行为 |
|-------------|----------|
| `recommend_capability` | 自动执行推荐的 skill |
| `execute_generic` | 用默认 skill 执行 |
| `create_capability` | 提示用户在桌面端创建 |
| `setup_schedule` | 提示用户在桌面端配置 |

---

## 6. 流式卡片

### 6.1 CardKit 生命周期

1. **创建** — 调用飞书 CardKit API 创建流式卡片，获取 `cardId`
2. **发送** — 通过 `client.im.message.create` 将卡片发送到聊天
3. **更新** — 通过 CardKit API 更新卡片文本内容（队列化，防并发）
4. **关闭** — 关闭流式模式，卡片变为静态

### 6.2 与 openclaw 的差异

| 维度 | openclaw | LaborAny |
|------|----------|----------|
| 多账号 | 支持多飞书应用 | 单账号 |
| 日志 | `getChildLogger` | `console.*` |
| 配置 | `accountConfig` 对象 | 直接传 `appId/appSecret/domain` |

---

## 7. 文件处理

### 7.1 下载链路

```
飞书用户发送文件/图片
    ↓
handler.ts: Lark SDK 下载文件
    ↓
保存到 uploads/{uuid}.{ext}
    ↓
query 中嵌入 [LABORANY_FILE_IDS: uuid]
    ↓
converse/execute 标准流程（自动水合到 task dir）
```

### 7.2 产物回传

执行完成后，handler 对比执行前后的 task files 快照，将新增/变更的文件通过飞书 API 回传：

- 图片文件（png/jpg/gif/svg）→ 以图片消息发送
- 其他文件（pdf/docx/xlsx 等）→ 以文件消息发送
- 单次最多回传 5 个文件，单文件上限 20MB

### 7.3 支持类型

复用 uploads 目录，与桌面端 `POST /files/upload` 写入同一位置，后续链路完全一致。

---

## 8. 生命周期管理

### 8.1 启动流程

1. `loadFeishuConfig()` → 返回 null 则跳过
2. `createLarkClient(config)` → REST API 客户端
3. 创建 `EventDispatcher`，注册 `im.message.receive_v1`
4. `createLarkWsClient(config, dispatcher)` → WebSocket 客户端
5. `wsClient.start()` → 开始接收消息

### 8.2 管理路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/feishu/status` | GET | 查询 Bot 运行状态 |
| `/feishu/start` | POST | 启动 Bot |
| `/feishu/stop` | POST | 停止 Bot |
| `/feishu/restart` | POST | 重启 Bot |

### 8.3 自动获得的能力（零额外代码）

- 智能 skill 匹配（converse 端点）
- Session / Messages 自动入库（runtimeTaskManager）
- 前端历史页面自动可见
- Memory 自动收集与注入
- Skill 系统完整复用
- 多轮对话支持
- 任务中止支持
