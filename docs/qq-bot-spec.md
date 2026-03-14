# QQ Bot 集成规范

## 概述

LaborAny QQ Bot 允许用户通过 QQ 消息远程触发 AI 任务执行，当前仅支持 **C2C 私聊** 场景。

## 架构设计

QQ Bot 采用与飞书 Bot 相同的架构模式：

```
QQ 用户发消息（C2C 私聊）
    ↓
WebSocket 接收事件
    ↓
handleQQMessage() 入口
    ├─ 权限验证（allowlist 检查）
    ├─ 去重检查（10 分钟 TTL）
    └─ 串行队列处理（防并发）
    ↓
命令解析（/new、/skill、/help 等）
    ├─ 命令 → handleCommand()
    └─ 普通消息 → 进入两阶段流程
    ↓
═══ 阶段一：Converse（意图分析）═══
    ↓
runConverse()
    ├─ POST /converse（agent-service 本地调用）
    ├─ SSE 事件流消费
    │  ├─ type=text → 流式消息显示分析过程
    │  ├─ type=action → 进入阶段二
    │  ├─ type=question → 回 QQ 追问，等待用户回复
    │  └─ type=done → converse 结束
    └─ 多轮对话历史管理
    ↓
═══ 阶段二：Execute（实际执行）═══
    ↓
executeSkill()
    ├─ POST /api/skill/execute（src-api）
    ├─ SSE 事件流消费
    │  ├─ type=text → 流式消息实时更新
    │  ├─ type=tool_use → 显示工具调用
    │  └─ type=done/stopped/aborted → 执行结束
    ├─ 产物回传（sendArtifactsToTarget）
    └─ Session 自动入库
```

## 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# QQ Bot 启用开关
QQ_ENABLED=true

# QQ Bot 应用凭证（从 QQ 开放平台获取）
QQ_APP_ID=your-qq-app-id
QQ_APP_SECRET=your-qq-app-secret   # 必填，LaborAny 会使用 App Secret 自动换取访问令牌
# QQ_BOT_TOKEN=your-qq-bot-token   # 已弃用，仅兼容旧版本配置，建议不要再使用

# QQ Bot 沙箱模式（测试环境使用）
QQ_SANDBOX=false

# QQ Bot 用户白名单（逗号分隔的用户 ID，留空表示允许所有用户）
QQ_ALLOW_USERS=user_id_1,user_id_2

# QQ Bot 是否强制白名单（为 true 时，白名单为空则拒绝所有消息）
QQ_REQUIRE_ALLOWLIST=false

# QQ Bot 显示名称
QQ_BOT_NAME=LaborAny

# QQ Bot 默认技能 ID
QQ_DEFAULT_SKILL=__generic__
```

## 支持的消息场景

### C2C 私聊（当前唯一支持）

- 事件类型：`C2C_MESSAGE_CREATE`
- 适用场景：用户与机器人的一对一私聊
- 用户标识：`userId`

## 命令系统

QQ Bot 支持以下命令：

| 命令 | 功能 | 示例 |
|------|------|------|
| `/new` | 重置会话（清除 converse + execute 状态） | `/new` |
| `/help` | 显示帮助信息 | `/help` |
| `/skill <id> [query]` | 跳过 converse，直接执行指定技能 | `/skill ppt-generator 创建一个产品介绍 PPT` |
| `/skills` | 列出可用技能 | `/skills` |
| `/cron ...` | 创建/查看/删除定时任务 | `/cron help` |
| `/model [name|id]` | 查看或切换默认模型配置 | `/model` |
| `/stop` | 中止当前执行中的任务 | `/stop` |

## 流式消息展示

由于 QQ Bot API 不支持消息编辑，LaborAny 使用“占位 + 最终结果”方式展示过程：

1. **初始消息**：发送“分析中...”或“执行中...”表示任务开始
2. **最终消息**：发送完整结果；若内容过长会自动分段

示例：
```
分析中...
✅ 完成

[完整结果内容]
```

## 文件处理

### 接收文件

QQ Bot 支持接收以下类型的文件：

- 图片：PNG、JPG、GIF、SVG
- 文档：PDF、DOCX、XLSX、PPTX
- 其他：通过 attachments 字段获取

文件会自动下载到 `data/uploads/` 目录，并生成 `[LABORANY_FILE_IDS: uuid]` 标记。

### 发送文件

执行完成后，QQ Bot 会自动回传产物文件：

- **C2C 私聊**：使用 `postFile` API 上传图片或文件

限制：
- 单次最多发送 5 个文件
- 单文件大小上限 20MB

## 管理 API

QQ Bot 提供以下管理接口：

### 查看状态

```bash
GET /qq/status
```

响应示例：
```json
{
  "enabled": true,
  "running": true,
  "config": {
    "appId": "your-app-id",
    "sandbox": false,
    "botName": "LaborAny",
    "defaultSkillId": "__generic__",
    "allowUsersCount": 2,
    "requireAllowlist": false
  }
}
```

### 启动 Bot

```bash
POST /qq/start
```

### 停止 Bot

```bash
POST /qq/stop
```

### 重启 Bot

```bash
POST /qq/restart
```

### 测试消息发送

```bash
POST /qq/test
Content-Type: application/json

{
  "targetId": "user_openid",
  "targetType": "c2c",
  "message": "测试消息"
}
```

## 用户白名单

为了安全性，建议配置用户白名单：

```bash
# 允许特定用户
QQ_ALLOW_USERS=user_id_1,user_id_2,user_id_3

# 强制白名单模式（白名单为空时拒绝所有消息）
QQ_REQUIRE_ALLOWLIST=true
```

如果不配置白名单，任何用户都可以触发 Bot。

## 使用示例

### 1. 普通对话

```
用户: 帮我写一篇关于 AI 的文章
Bot: ⏳ 思考中...
Bot: 📝 更新 1: 正在分析需求...
Bot: ✅ 完成

[生成的文章内容]
```

### 2. 直接执行技能

```
用户: /skill ppt-generator 创建一个产品介绍 PPT
Bot: 🚀 执行技能: ppt-generator
Bot: ⏳ 执行中...
Bot: ✅ 完成

[生成的 PPT 文件]
Bot: 📎 已发送 1 个文件
```

### 3. 查看可用技能

```
用户: /skills
Bot: **可用技能：**

• PPT 生成器 (ppt-generator)
  根据主题生成专业的 PPT 演示文稿

• 文档总结 (doc-summarizer)
  提取文档关键信息并生成摘要

...
```

## 故障排查

### Bot 无法启动

1. 检查环境变量是否正确配置
2. 确认 `QQ_ENABLED=true`
3. 确认 `QQ_APP_ID` 与 `QQ_APP_SECRET` 已填写（QQ 官方已弃用 Bot Token）
4. 查看日志：`[QQ] Bot started` 或错误信息

### Bot 不响应消息

1. 检查用户是否在白名单中（如果配置了白名单）
2. 确认 Bot 已启动且当前为 C2C 私聊消息
3. 查看日志是否有鉴权错误或消息去重提示

### 文件无法发送

1. 检查文件大小是否超过 20MB
2. 确认文件格式是否支持

## 技术限制

1. **消息编辑**：QQ Bot API 不支持编辑已发送的消息，因此使用多条消息模拟流式效果
2. **消息长度**：单条消息最大 1000 字符，超长内容会分段发送
3. **会话范围**：当前仅支持 C2C 私聊，不处理群聊和频道

## 与飞书 Bot 的差异

| 特性 | 飞书 Bot | QQ Bot |
|------|---------|--------|
| 流式展示 | CardKit 卡片编辑 | 多条消息 |
| 文件发送 | 全场景支持 | C2C 私聊支持 |
| 消息架构 | 单聊/群聊 | C2C 私聊 |
| SDK | @larksuiteoapi/node-sdk | qq-bot-sdk |

## 参考资源

- QQ Bot 官方文档：https://bot.q.qq.com/wiki
- QQ 开放平台：https://open.qq.com
- SDK GitHub：https://github.com/feilongproject/QQNodeSDK
