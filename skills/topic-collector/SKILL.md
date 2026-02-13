---
name: topic-collector
description: AI热点采集工具。从Twitter/X、Product Hunt、Reddit、Hacker News、博客等采集AI相关热点内容。当用户说"开始今日选题"、"采集热点"、"看看今天有什么新闻"、"今日AI热点"时触发。聚焦领域：Vibe Coding、Claude Skill、AI知识管理、AI模型更新、AI新产品、海外热点。支持输出 Markdown 和 HTML 文件。
icon: 📰
---

# Topic Collector - AI热点采集

## 功能特性

- **严格时间控制**：所有搜索限制在24小时内
- **多源采集**：Twitter/X、Product Hunt、Reddit、Hacker News、官方博客
- **自动日期**：动态生成搜索日期，避免硬编码
- **多格式输出**：支持 Markdown 和 HTML 两种格式

---

## 快速开始

### 方式一：查看搜索查询（推荐）

```bash
python skills/topic-collector/scripts/collect.py
```

这会显示当前日期应该使用的搜索查询列表。

### 方式二：生成文件

```bash
# 生成 Markdown 文件
python skills/topic-collector/scripts/collect.py --output-md

# 生成 HTML 文件
python skills/topic-collector/scripts/collect.py --output-html

# 同时生成两种格式
python skills/topic-collector/scripts/collect.py --all

# 静默模式
python skills/topic-collector/scripts/collect.py --all --quiet
```

### 方式三：静默模式（仅输出文件路径）

```bash
python skills/topic-collector/scripts/collect.py --all --quiet
```

---

## 使用流程

当用户请求采集今日热点时：

### 第一步：获取搜索查询

```bash
python skills/topic-collector/scripts/collect.py
```

输出示例：
```
🔍 搜索查询列表（请使用 WebSearch 工具执行）
============================================================

🧑‍💻 **AI博主/KOL**
  - "Claude Code" OR "Cursor" tips tricks "February 09, 2026"
  - AI agent n8n automation "February 2026"

🚀 **创业公司/新产品**
  - Product Hunt AI tools "February 09, 2026"
  - Hacker News AI "2026-02-09"

...
```

### 第二步：执行搜索

使用 WebSearch 工具执行上述查询，每个分类独立搜索。

### 第三步：整理结果

将搜索结果按分类整理，提取：
- 标题
- 原文链接
- 作者/来源
- 发布时间
- 要点总结
- 热度数据

### 第四步：生成文件

将整理好的数据填入脚本，生成输出文件。

---

## 输出文件

| 文件类型 | 保存位置 | 用途 |
|---------|----------|------|
| Markdown | `docs/hotspots/ai-hotspot-YYYY-MM-DD.md` | 复制粘贴到其他平台 |
| HTML | `docs/hotspots/ai-hotspot-YYYY-MM-DD.html` | 浏览器直接查看 |

---

## 数据源分类

### 🧑‍💻 AI博主/KOL（实践玩法、观点分享）

**重点账号**：
- @AnthropicAI - Anthropic官方
- @OpenAI - OpenAI官方
- @kaborsk1 - Boris Cherny（Claude Code创作者）
- @swyx - AI工程师，Latent Space播客
- @simonw - Simon Willison，AI工具实践
- @levelsio - Pieter Levels，AI独立开发

**搜索方向**：Claude Code、Cursor、Vibe Coding、AI Agent、n8n

### 🚀 创业公司/新产品

**数据源**：
- Product Hunt - 当日上榜 AI 产品
- Hacker News - Show HN 项目

### 🔬 AI研究/学术动态

**关注来源**：
- arXiv - AI 论文新提交
- Google DeepMind 博客
- Meta AI 博客
- Microsoft Research
- OpenAI 官方博客

### 🏢 模型厂商动态

**关注厂商**：
- Anthropic - Claude 更新
- OpenAI - ChatGPT 更新
- Google - Gemini 更新
- xAI - Grok 更新
- Mistral - 模型发布

### 💬 技术社区讨论

**Reddit 子版**：
- r/ClaudeAI
- r/ChatGPT
- r/LocalLLaMA
- r/artificial
- r/vibecoding
- r/MachineLearning

---

## 聚焦领域

1. **Vibe Coding** - 自然语言编程、Cursor、Claude Code
2. **Claude生态** - Claude Skill、MCP Server、Claude Code技巧
3. **AI Agent** - 自动化工作流、n8n、Make
4. **AI知识管理** - 第二大脑、PKM、Obsidian+AI
5. **模型更新** - GPT、Claude、Gemini版本发布
6. **AI新产品** - Product Hunt上榜、独立开发者作品
7. **海外热点** - 行业大事件、收购、融资

---

## 输出格式预览

### Markdown 格式

```markdown
## 今日AI热点 - 0209

> 采集时间：2026-02-09 12:00:00 UTC
> 时间范围：近24小时

---

### 🧑‍💻 AI博主实践分享

1. **Claude Code vs Cursor: 两扇门通向同一个房间**
   - 原文：[Raj Sarkar Substack](https://...)
   - 作者：@rajsarkar
   - 发布时间：2小时前
   - 要点：Cursor是居住的地方，Claude Code是驾驶的工具

---
```

### HTML 格式

HTML 文件包含完整的样式，支持：
- 响应式设计（手机/平板/桌面）
- 渐变色头部
- 卡片式布局
- 悬停效果
- 可分享

直接在浏览器中打开即可查看。

---

## 注意事项

### 时间控制（最重要）
- **必须提取发布时间**：每条热点都要标注发布时间
- **严格24小时限制**：超过24小时的内容不采集
- **时区意识**：统一使用 UTC 时间
- **动态日期**：使用脚本生成的日期，不要硬编码

### 内容质量
- **必须提取原文链接**：每条热点都要有可点击的具体URL
- 不采集纯学术论文（除非引发广泛讨论）
- 不采集重复/相似内容，合并同类
- 标注内容语言（中/英）
- 优先采集有实操价值的内容（教程、技巧、工具）

### 搜索技巧
- 使用引号进行精确匹配
- 使用 OR 连接同义词
- 使用 site: 限制来源
- 使用具体日期进行时间过滤

---

## 常见用法示例

| 用户说 | 执行操作 |
|--------|----------|
| "开始今日选题" | 运行脚本获取搜索查询，执行搜索，生成文件 |
| "采集热点" | 同上 |
| "看看今天有什么新闻" | 同上 |
| "今日AI热点" | 同上 |
| "生成热点 HTML" | 运行 `python collect.py --output-html` |
| "只看搜索查询" | 运行 `python collect.py` |
