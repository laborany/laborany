---
name: 邮箱助手
description: |
  智能邮箱管理助手，支持收发邮件、分析总结、识别待办事项和会议、辅助拟稿回复。
  触发场景:
  (1) 用户说"帮我查看邮箱"、"检查邮件"、"未读邮件"、"发送邮件"
  (2) 用户需要总结未读邮件内容
  (3) 用户需要识别邮件中的待办事项和会议安排
  (4) 用户需要拟稿回复邮件或发送新邮件
  (5) 发送邮件支持使用缓存的凭据，无需重复输入密码
  支持: Gmail、Outlook、QQ、163等IMAP/SMTP邮箱服务
icon: 📧
category: 办公
---

# 邮箱助手

智能邮箱管理助手，自动化处理邮件收发、阅读、分析和回复拟稿。

## 安全特性

- **加密存储**: 凭据使用 AES-256-GCM 加密存储
- **用户隔离**: 与 LaborAny 用户ID绑定，不同用户凭据完全隔离
- **自动过期**: 凭据30天自动过期，需要重新验证
- **机器绑定**: 密钥基于用户ID和机器指纹派生，防止凭据文件被挪用

## 工作流程

```
连接邮箱 → 获取未读 → AI分析总结 → 识别待办/会议 → 辅助拟稿 → [发送邮件]
```

发送邮件功能已集成凭据缓存，使用已保存的凭据自动发送。

## 快速开始

### Step 1: 连接邮箱并获取未读邮件

**方式一：自动模式（推荐，用于 AI 调用）**

自动使用缓存的凭据，无需用户交互：

```bash
# 自动使用第一个缓存的凭据
python scripts/fetch_with_cache.py <用户ID> --auto
```

**方式二：带缓存的智能模式**

自动保存凭据，下次无需重复登录，与用户绑定安全加密：

```bash
# 首次使用 - 需要提供邮箱和密码
python scripts/fetch_with_cache.py <用户ID>

# 指定邮箱（首次或更换邮箱）
python scripts/fetch_with_cache.py <用户ID> example@163.com
```

> **注意**: `<用户ID>` 应该是 LaborAny 的当前用户ID，用于隔离不同用户的凭据。
> `--auto` 参数启用非交互模式，直接使用第一个缓存的凭据，无需用户确认。

**方式二：命令行模式**

```bash
# 获取未读邮件
python scripts/fetch_emails.py <邮箱地址> <密码/授权码> [数量]

# 示例
python scripts/fetch_emails.py example@163.com YOUR_AUTH_CODE
```

**方式三：批处理模式**

```bash
python scripts/imap_client_batch.py <邮箱地址> <密码/授权码> [数量] [--all]

# 示例
python scripts/imap_client_batch.py example@163.com YOUR_AUTH_CODE 50
```

**方式四：交互式模式**

```bash
python scripts/imap_client.py
```

邮件会自动保存到 `emails.json`。

### Step 2: 分析邮件内容

```bash
python scripts/email_analyzer.py emails.json
```

查看摘要:

```bash
python scripts/email_analyzer.py --summary emails_analyzed.json
```

## 支持的邮箱服务

| 邮箱 | IMAP服务器 | SMTP服务器 | 特殊要求 |
|------|-----------|-----------|---------|
| Gmail | imap.gmail.com:993 | smtp.gmail.com:587 | 需应用专用密码 |
| Outlook | outlook.office365.com:993 | smtp.office365.com:587 | - |
| QQ邮箱 | imap.qq.com:993 | smtp.qq.com:587 | 需开启SMTP服务 |
| 163邮箱 | imap.163.com:993 | smtp.163.com:465 | 需授权码 + IMAP ID |
| 126邮箱 | imap.126.com:993 | smtp.126.com:465 | 需授权码 + IMAP ID |
| Yahoo | imap.mail.yahoo.com:993 | smtp.mail.yahoo.com:587 | - |

## 重要提示

### 163/126邮箱特殊说明

网易邮箱要求客户端发送 **IMAP ID** 信息，否则会报 "Unsafe Login" 错误。

本技能已在所有脚本中添加了 IMAP ID 支持，但使用时仍需注意：

1. **必须使用授权码**，不是登录密码
2. 开启IMAP服务：设置 → POP3/SMTP/IMAP
3. 如果仍报错，尝试在网页端邮箱设置中重新生成授权码

### Gmail 专用密码

1. 访问 https://myaccount.google.com/apppasswords
2. 生成应用专用密码
3. 使用该密码而非Google账号密码

### QQ邮箱

1. 进入邮箱设置
2. 开启IMAP服务
3. 可能需要使用独立密码

## 脚本说明

### fetch_with_cache.py

带缓存功能的智能邮件获取脚本，推荐使用。

特点：
- 自动检查并使用缓存的凭据
- 与 LaborAny 用户ID绑定，不同用户完全隔离
- 密码/授权码使用 AES-256-GCM 加密存储
- 凭据30天自动过期
- 支持 `--auto` 自动模式，无需用户交互

**命令行用法**:
```bash
# 自动模式：直接使用缓存，适合 AI 调用
python scripts/fetch_with_cache.py <用户ID> --auto

# 交互模式：首次使用或需要用户确认
python scripts/fetch_with_cache.py <用户ID>

# 指定邮箱
python scripts/fetch_with_cache.py <用户ID> example@163.com
```

**Python API**:
```python
from scripts.fetch_with_cache import fetch_with_cache

# 自动模式：使用缓存的凭据，无需交互
result = fetch_with_cache(
    laborany_user_id="user_123",
    limit=50,
    auto_mode=True  # 启用自动模式
)

if result['success']:
    if result['from_cache']:
        print("使用已保存的凭据")
    print(f"获取到 {result['count']} 封邮件")
```

### fetch_emails.py

核心邮件获取模块，可被其他脚本导入。

```python
from scripts.fetch_emails import fetch_emails

result = fetch_emails("example@163.com", "password", limit=20)
if result['success']:
    for email in result['emails']:
        print(email['subject'])
```

### imap_client_batch.py

批处理模式，支持命令行参数。

```bash
python scripts/imap_client_batch.py example@163.com password 50 --all
```

参数说明：
- `--all`: 获取所有邮件，不只未读
- 数字: 指定获取数量

### credential_cache.py

凭据加密缓存模块，提供安全的凭据存储功能。

```python
from scripts.credential_cache import CredentialCache

# 获取当前用户的缓存实例
cache = CredentialCache(laborany_user_id="user_123")

# 列出已保存的凭据
credentials = cache.list_credentials()

# 保存凭据（加密）
cache.save("user@example.com", "password")

# 加载凭据（自动解密）
credential = cache.load("user@example.com")

# 删除凭据
cache.delete("user@example.com")

# 清除所有凭据
cache.clear_all()
```

### email_analyzer.py

分析邮件内容，提取待办事项、会议等。

### send_email.py

**新增：发送邮件模块，支持使用缓存的凭据**

```bash
# 使用缓存的凭据发送草稿
python scripts/send_email.py --draft draft.json --user <用户ID>

# 直接发送邮件（会使用缓存或询问密码）
python scripts/send_email.py --from me@163.com --to you@example.com --subject "测试" --user <用户ID>
```

**Python API:**

```python
from scripts.send_email import send_email_with_cache

# 使用缓存的凭据发送邮件
result = send_email_with_cache(
    user_id="Axel",
    from_email="axel_li@163.com",
    to_emails=["recipient@example.com"],
    subject="邮件主题",
    body="邮件正文"
)

if result['success']:
    print(f"✅ {result['message']}")
    if result['from_cache']:
        print("使用已保存的凭据")
else:
    print(f"❌ {result['error']}")

# 发送草稿文件
from scripts.send_email import send_draft
result = send_draft("draft.json", user_id="Axel")
```

**支持的参数:**
- `to_emails`: 收件人列表
- `cc_emails`: 抄送列表（可选）
- `bcc_emails`: 密送列表（可选）
- `is_html`: 是否为HTML格式
- `from_name`: 发件人名称（可选）

**自动使用缓存:**
- 如果发件人邮箱的凭据已缓存，自动使用缓存中的密码
- 如果没有缓存且设置了 `ask_password=True`，会提示用户输入
- 发送成功后，新输入的密码会自动保存到缓存

## AI辅助流程

当用户使用本技能时，按以下步骤工作:

### 1. 首先检查凭据缓存

**重要**: 使用 `fetch_with_cache.py` 的非交互模式自动处理缓存。

```python
from scripts.credential_cache import CredentialCache

# 获取当前 LaborAny 用户的缓存实例
cache = CredentialCache(laborany_user_id="<当前用户ID>")

# 列出已保存的凭据
saved_credentials = cache.list_credentials()
```

**场景判断**:
- **有缓存**: 直接使用 `fetch_with_cache.py <user_id> --auto` 获取邮件
- **无缓存**: 引导用户输入邮箱和密码

### 2. 有缓存 - 自动获取邮件

当检测到有缓存的凭据时，使用自动模式直接获取邮件:

```bash
python scripts/fetch_with_cache.py <用户ID> --auto
```

Python API 方式:

```python
from scripts.fetch_with_cache import fetch_with_cache

# 自动模式：直接使用第一个缓存的凭据，无需用户交互
result = fetch_with_cache(
    laborany_user_id="<用户ID>",
    limit=50,
    auto_mode=True  # 关键：启用自动模式
)

if result['success']:
    emails = result['emails']
    print(f"获取到 {len(emails)} 封邮件")
else:
    print(f"获取失败: {result['error']}")
```

### 3. 无缓存 - 引导用户输入并缓存

如果没有缓存的凭据，**用问题引导用户**:

```
请问您的邮箱地址是什么? (比如 example@gmail.com)
```

用户回答后，继续询问:

```
好的，请问您的邮箱密码或授权码是什么?
```

> **提示**: 根据用户邮箱类型，给出相应提示:
> - Gmail: "需要应用专用密码，您可以在 https://myaccount.google.com/apppasswords 生成"
> - QQ邮箱: "请确保已在设置中开启IMAP服务"
> - 163/126: "请使用授权码而非登录密码，并确保IMAP服务已开启"

获取凭据后，系统会自动验证并保存到缓存：

```python
from scripts.fetch_with_cache import fetch_with_cache

# 提供邮箱和密码（成功后会自动保存到缓存）
result = fetch_with_cache(
    laborany_user_id="<用户ID>",
    email_address="user@example.com",
    password="<密码或授权码>",
    limit=50
)
```

> **重要**: 凭据只在**首次成功登录**时缓存。后续使用时直接读取缓存，不再重复缓存。

### 3. 分析并展示摘要

```markdown
## 📧 邮件摘要 (X封未读)

### 🔴 高优先级 (2封)
- [ ] 张三 - 项目进度确认 - 需回复
- [ ] 李四 - 紧急会议邀请 - 今天下午3点

### 🟡 中等优先级 (3封)
- [ ] 系统通知 - 周报提醒
- ...

### ⚪ 一般邮件 (5封)
- ...
```

### 4. 待办事项整理

```markdown
## ✅ 待办事项 (5项)
1. [ ] 回复张三关于项目进度的询问
2. [ ] 准备下午3点的会议材料
3. [ ] 提交周报 (截止周五)
...
```

### 5. 会议/日程提醒

```markdown
## 📅 日程安排 (3项)
1. 今天 15:00 - 项目评审会议
2. 明天 10:00 - 客户电话会议
...
```

### 6. 询问是否需要回复

分析完成后，主动询问:

```
发现 4 封邮件需要回复，是否需要我帮您拟稿?

对于需要回复的邮件，我可以:
- 根据邮件内容生成回复草稿
- 您确认后再发送
```

### 7. 发送邮件

用户确认草稿后，使用 `send_email.py` 发送：

```python
from scripts.send_email import send_draft, send_email_with_cache

# 方式一：发送草稿文件
result = send_draft("draft.json", user_id="Axel")

# 方式二：直接构造并发送
result = send_email_with_cache(
    user_id="Axel",
    from_email="axel_li@163.com",
    to_emails=["recipient@example.com"],
    subject="Re: 原始邮件主题",
    body="邮件正文内容"
)
```

**优势：**
- 自动从缓存获取发件人凭据，无需重复输入密码
- 与用户ID绑定，不同用户的凭据隔离
- 密码加密存储，安全可靠

### 8. 凭据缓存流程说明

**缓存逻辑总结**：
- **有缓存** → 直接使用缓存的凭据读取邮件 → **不会重复缓存**
- **无缓存** → 询问用户输入邮箱和授权码 → 验证成功 → **才缓存凭据**

### 9. 完整对话示例

**场景一：有缓存的用户（自动模式，无交互）**

```
用户: 检查我的邮箱

助手: [检查缓存] 发现已保存的邮箱: axel_li@163.com
      [自动获取邮件...]

      📬 您有 1 封未读邮件:

      📊 AlphaQuant - 收盘总结 - 2026-02-09
      - 今日收益率: -1.49%
      - 总资产: 284,273.04 元
      - 持仓: 6只股票
```

**场景二：新用户（需要输入凭据）**

```
用户: 检查我的邮箱

助手: [检查缓存] 未发现已保存的凭据

      请问您的邮箱地址是什么? (比如 example@gmail.com)

用户: example@163.com

助手: 好的，请问您的密码或授权码是什么?
      (提示: 163邮箱需要使用授权码，而非登录密码)

用户: ********

助手: [连接并验证] ✅ 登录成功！
      凭据已加密保存，下次可直接使用。

      📬 您有 5 封未读邮件...
```

**场景三：AI 实现参考**

```python
# AI 处理"检查我的邮箱"请求的参考实现
from scripts.credential_cache import CredentialCache
from scripts.fetch_with_cache import fetch_with_cache

def check_user_email(user_id: str):
    """检查用户邮箱的完整流程"""
    cache = CredentialCache(laborany_user_id=user_id)
    saved = cache.list_credentials()

    if saved:
        # ===== 有缓存：直接使用，不需要用户输入 =====
        print(f"[检查缓存] 发现已保存的邮箱: {saved[0]['email_address']}")
        result = fetch_with_cache(
            laborany_user_id=user_id,
            auto_mode=True  # 自动模式，直接使用缓存
        )
        # result['from_cache'] 将为 True，不会重复缓存
        return result
    else:
        # ===== 无缓存：询问用户输入，成功后自动缓存 =====
        print("[检查缓存] 未发现已保存的凭据")
        email = input("请问您的邮箱地址是什么? ")
        password = input("请问您的邮箱密码或授权码是什么? ")

        result = fetch_with_cache(
            laborany_user_id=user_id,
            email_address=email,
            password=password
        )
        # 如果登录成功，凭据会自动保存到缓存
        # 下次使用时 result['from_cache'] 将为 True
        return result
```

## 依赖

### 核心功能（必需）
无外部依赖 - 使用Python标准库:
- `imaplib` - IMAP连接
- `email` - 邮件解析
- `re` - 正则表达式提取
- `html.parser` - HTML标签清理

### 加密功能（推荐）
凭据缓存功能推荐使用 cryptography 库以获得最佳安全性:
```
pip install cryptography
```

如果未安装 cryptography，会自动降级到标准库实现（安全性较低）。

## 凭据缓存机制

### 工作原理

1. **用户绑定**: 缓存与 LaborAny 用户ID绑定，不同用户的凭据存储在独立目录
2. **加密存储**: 密码/授权码使用 AES-256-GCM 加密后存储
3. **密钥派生**: 通过 PBKDF2 从用户ID和机器指纹派生加密密钥
4. **自动过期**: 凭据有效期30天，过期后需重新验证

### 缓存位置

```
~/.laborany/email_assistant/credentials/<hash_user_id>/<hash_email>.json
```

### 使用方式

```python
from scripts.credential_cache import CredentialCache
from scripts.fetch_emails import fetch_emails

# 获取当前用户的缓存实例（需要提供 LaborAny 用户ID）
cache = CredentialCache(laborany_user_id="user_123")

# 检查是否有缓存的凭据
credential = cache.load("user@example.com")

if credential:
    # 使用缓存的凭据
    result = fetch_emails(
        credential['email_address'],
        credential['password']
    )
else:
    # 没有缓存，提示用户输入
    email = input("邮箱地址: ")
    password = input("密码/授权码: ")

    # 验证凭据后保存到缓存
    result = fetch_emails(email, password)
    if result['success']:
        cache.save(email, password)
```

### 清除凭据

```python
# 删除指定邮箱的凭据
cache.delete("user@example.com")

# 清除当前用户的所有凭据
cache.clear_all()
```

## 安全注意事项

1. **加密存储**: 凭据使用 AES-256-GCM 加密，密钥基于用户ID和机器指纹
2. **用户隔离**: 不同 LaborAny 用户的凭据完全隔离
3. **自动过期**: 凭据30天自动过期，需要重新验证
4. **Gmail**: 必须使用应用专用密码
5. **企业邮箱**: 遵守公司安全政策
6. **163/126**: 必须使用授权码，不要使用登录密码
7. **机器绑定**: 凭据文件与机器绑定，挪用到其他机器无法解密

## 示例对话

```
用户: 帮我查看邮箱

助手: 请问您的邮箱地址是什么?

用户: axel_li@163.com

助手: 好的，请问您的邮箱密码或授权码是什么?
(提示: 163邮箱需要使用授权码，而非登录密码)

用户: ********

助手: [获取邮件] 您有 1 封未读邮件：

📊 AlphaQuant - 收盘总结 - 2026-02-09
- 今日收益率: -1.49%
- 总资产: 284,273.04 元
- 持仓: 6只股票

这是系统自动发送的日报，通常不需要回复。是否需要我帮您分析详情？
```
