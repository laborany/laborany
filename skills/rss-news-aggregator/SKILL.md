---
name: 优质资讯
description: RSS 资讯聚合工具。从全球 92 个高质量技术博客采集 AI/科技资讯，支持关键词搜索、主题分类、时间范围过滤、来源筛选，输出 Markdown 和 HTML 双格式报告。
icon: 📡
---

# 优质资讯 - RSS 资讯聚合工具

从全球 92 个高质量技术博客采集最新的 AI/科技资讯，支持多维度过滤和智能质量评估。

## ✨ 功能特性

- **多源聚合**：从 92 个精选 RSS 源（HN Popularity Contest 2025）采集资讯
- **智能过滤**：支持关键词搜索、自然语言查询、主题分类、时间范围、精准来源筛选
- **质量评估**：基于来源权威性、内容质量、时效性自动评分排序（0-100 分）
- **双格式输出**：Markdown（便于编辑）+ HTML（Linear 简约风格 + 卡片布局）
- **实时更新**：直接从 RSS feeds 获取，分钟级时效性

## 🚀 快速开始

### 方式 1：获取最近 3 天的所有资讯

```bash
python scripts/fetch_rss.py --days 3 --output /tmp/raw.json
python scripts/filter_content.py --input /tmp/raw.json --output /tmp/filtered.json
python scripts/generate_report.py --input /tmp/filtered.json --output-dir docs/news
```

### 方式 2：搜索特定主题

```bash
# 搜索 "Claude" 相关资讯
python scripts/fetch_rss.py --days 7 --output /tmp/raw.json
python scripts/filter_content.py --input /tmp/raw.json --query "Claude" --output /tmp/filtered.json
python scripts/generate_report.py --input /tmp/filtered.json --output-dir docs/news
```

### 方式 3：精准过滤特定来源

```bash
# 只获取 Simon Willison 和 Gary Marcus 的文章
python scripts/fetch_rss.py --days 3 --sources "simonwillison.net,garymarcus.substack.com" --output /tmp/raw.json
python scripts/filter_content.py --input /tmp/raw.json --output /tmp/filtered.json
python scripts/generate_report.py --input /tmp/filtered.json --output-dir docs/news
```

## 📋 使用流程

### 步骤 1：获取 RSS 数据

```bash
python scripts/fetch_rss.py [选项]
```

**选项**：
- `--days N`：获取最近 N 天的资讯（默认 3 天）
- `--sources "source1,source2"`：只获取指定来源（可选）
- `--output FILE`：输出 JSON 文件路径

### 步骤 2：过滤和评分

```bash
python scripts/filter_content.py [选项]
```

**选项**：
- `--input FILE`：输入 JSON 文件（来自步骤 1）
- `--query "关键词"`：搜索查询（可选）
- `--sources "source1,source2"`：过滤特定来源（可选）
- `--min-quality N`：最低质量分数 0-100（可选）
- `--output FILE`：输出 JSON 文件路径

### 步骤 3：生成报告

```bash
python scripts/generate_report.py [选项]
```

**选项**：
- `--input FILE`：输入 JSON 文件（来自步骤 2）
- `--output-dir DIR`：输出目录（默认 `docs/news`）
- `--format md|html|both`：输出格式（默认 both）

### 步骤 4：查看报告

- **Markdown**：`docs/news/rss-news-YYYY-MM-DD.md`
- **HTML**：在浏览器中打开 `docs/news/rss-news-YYYY-MM-DD.html`

## 📊 数据源分类

### 来源统计
- **总计**：92 个高质量技术博客
- **来源**：HN Popularity Contest 2025

### 主要领域
- **AI/ML**：Simon Willison, Gary Marcus, Gwern 等
- **软件开发**：Dan Abramov (Overreacted), Mitchell Hashimoto 等
- **安全**：Troy Hunt, Krebs on Security, lcamtuf 等
- **系统架构**：Jeff Geerling, antirez 等
- **科技评论**：Daring Fireball, Pluralistic 等

### 知名博主
- Simon Willison (simonwillison.net) - AI/数据库专家
- Paul Graham (paulgraham.com) - YC 创始人
- Gary Marcus (garymarcus.substack.com) - AI 研究者
- Mitchell Hashimoto (mitchellh.com) - HashiCorp 创始人
- Dan Abramov (overreacted.io) - React 核心开发者

## 🎯 质量评估机制

### 评分算法（0-100 分）

**来源权威性（40%）**：
- 官方博客：1.5x 权重
- 学术/研究：1.3x 权重
- 科技媒体：1.2x 权重
- 个人博客：1.0x 权重

**内容质量（30%）**：
- 高质量关键词：research, analysis, deep dive, tutorial, guide 等（+2 分/个）
- 低质量关键词：clickbait, shocking, viral 等（-5 分/个）

**时效性（20%）**：
- 24 小时内：+10 分
- 72 小时内：+5 分

**相关性（10%）**：
- 关键词匹配度（查询时）

**综合排序**：
```
final_score = quality_score * 0.6 + relevance_score * 100 * 0.4
```

### 主题分类

自动将资讯分类到以下主题：
- 🤖 AI/ML
- 💻 Software Development
- 🔒 Security
- 🏗️ System Architecture
- 🌐 Web Development
- ⚙️ DevOps
- 🗄️ Database
- 🚀 Startup/Business
- 📄 Other

## 🆚 与 topic-collector 的差异

| 特性 | topic-collector | rss-news-aggregator |
|-----|----------------|---------------------|
| **数据源** | WebSearch 搜索引擎 | RSS feeds 直接订阅 |
| **时效性** | 依赖搜索引擎索引 | 实时 RSS 更新（分钟级） |
| **覆盖面** | 广泛但不稳定 | 精选高质量源（92 个） |
| **过滤能力** | 手动整理 | 自动化多维过滤 |
| **质量控制** | 人工筛选 | 算法自动评分 |
| **适用场景** | 每日热点采集 | 专题资讯聚合 |
| **用户输入** | 固定主题 | 灵活查询（关键词/自然语言） |

**定位**：
- `topic-collector`：每日 AI 热点快照（广度优先）
- `rss-news-aggregator`：专题资讯深度聚合（深度优先）

## 🛠️ 技术挑战与解决方案

### 挑战 1：RSS 源失效或格式不一致
**解决方案**：
- 使用 `feedparser` 库统一解析 RSS/Atom/JSON Feed
- 实现容错机制：单个源失败不影响整体
- 并发获取（ThreadPoolExecutor，max_workers=10）

### 挑战 2：内容去重
**解决方案**：
- 基于 URL 去重（优先）
- 基于标题相似度去重（可选）

### 挑战 3：HTML 样式独立性
**解决方案**：
- 所有样式内联到 HTML 文件（无外部 CSS）
- 使用 CSS 变量实现暗色模式
- 响应式设计（移动端友好）

## 📦 依赖说明

```bash
pip install feedparser python-dateutil
```

**依赖列表**：
- `feedparser`：RSS/Atom feed 解析
- `python-dateutil`：日期时间处理

## 📁 输出文件

| 文件类型 | 保存位置 | 命名规则 |
|---------|----------|---------|
| Markdown | `docs/news/` | `rss-news-{YYYY-MM-DD}.md` |
| HTML | `docs/news/` | `rss-news-{YYYY-MM-DD}.html` |

## 🔮 未来扩展

- [ ] 订阅管理：用户自定义 RSS 源（Web UI）
- [ ] 智能摘要：使用 LLM 生成更精炼的摘要
- [ ] 趋势分析：识别热门话题和趋势（词云、时间线）
- [ ] 邮件推送：定时发送资讯摘要到邮箱
- [ ] 多语言翻译：自动翻译外文资讯
- [ ] 收藏功能：用户标记感兴趣的资讯

## 📝 示例输出

### Markdown 格式

```markdown
# 优质资讯 - 2026-03-11

## 📊 概览
- 总计：45 条资讯
- 来源：28 个
- 生成时间：2026-03-11 10:30:00

## 🤖 AI/ML
### [Claude 4.6 Released with Enhanced Reasoning](https://example.com)
**来源**: simonwillison.net | **时间**: 2 小时前 | **质量**: 95/100

Anthropic announces Claude 4.6 with significant improvements...
```

### HTML 格式

Linear 简约风格，包含：
- 响应式卡片布局
- 暗色模式支持
- 悬停动画效果
- 质量徽章（颜色编码）
- 移动端友好

## 📞 支持

如有问题或建议，请在 laborany 项目中提交 issue。
