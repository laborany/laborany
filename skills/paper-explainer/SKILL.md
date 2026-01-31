---
name: 论文讲解助手
description: |
  将学术论文PDF转化为结构化、可视化的精讲文档。
  触发场景:
  (1) 用户提供PDF论文文件并要求讲解/分析
  (2) 用户询问"帮我讲解这篇论文"、"分析这个PDF"
  (3) 用户需要提取论文的核心方法、实验结果
  (4) 用户希望生成论文的可视化HTML摘要
  支持: AI/ML、CV、NLP、系统、理论等计算机科学领域论文
icon: 📚
category: 学术
---

# 论文讲解助手

将复杂学术论文转化为结构化、易理解的知识文档。

## 工作流程

```
PDF输入 → 解析提取 → 深度分析 → HTML输出
```

### Step 1: PDF解析

运行 `scripts/parse_pdf.py` 提取原始内容:

```bash
python scripts/parse_pdf.py <论文.pdf> -o parsed.json --image-dir ./images
```

输出结构:
```json
{
  "pages": [{"page_num": 1, "text": "...", "tables": [...]}],
  "images": [{"page_num": 1, "image_index": 1, "path": "..."}]
}
```

### Step 2: 内容分析

阅读解析结果，提取以下信息:

| 字段 | 来源 | 说明 |
|------|------|------|
| title | 首页顶部 | 论文标题 |
| authors | 标题下方 | 作者列表 |
| affiliations | 脚注/作者下 | 机构信息 |
| motivation | Abstract + Intro | 研究动机与问题 |
| method | Method章节 | 核心方法详解 |
| experiments | Experiments章节 | 实验设置与结果 |

**分析要点** (详见 [references/analysis_guide.md](references/analysis_guide.md)):
- 动机: 回答What/Why/Gap三问
- 方法: 分层讲解(直觉→架构→细节→数学)
- 公式: 提供符号表+直觉解释
- 实验: 批判性分析基线公平性

### Step 2.5: 图片智能分类与嵌入

对提取的图片进行分类，识别其用途:

| 类型 | 特征 | 嵌入位置 |
|------|------|----------|
| 框架图 | 展示整体架构/流程，通常较大，含模块和箭头 | method 开头 |
| 模块细节图 | 展示单个组件内部结构 | method 对应段落 |
| 实验曲线 | 折线图/柱状图，含坐标轴和图例 | experiments 对应分析处 |
| 可视化结果 | 热力图/注意力图/生成样本 | experiments 定性分析处 |
| 示意图 | 概念解释/对比图 | motivation 或 method |
| 其他 | Logo/装饰/无关图片 | 仅放附录或忽略 |

**分类方法**:
1. 查看图片尺寸: 框架图通常宽度 > 高度，且尺寸较大
2. 查看所在页码: 第1-2页多为示意图，Method章节多为架构图
3. 结合论文正文中的 "Figure X" 引用，匹配图片与描述
4. 分析图片内容: 含箭头/模块框的是架构图，含坐标轴的是实验图

**嵌入策略**:
- 框架图: 在 method 开头用 `<figure>` 标签嵌入，配详细说明
- 实验图: 在 experiments 对应结论处嵌入，解释图中趋势
- 其他关键图: 根据论文引用位置，嵌入对应段落

### Step 3: 生成HTML

构造分析结果JSON:

```json
{
  "title": "论文标题",
  "authors": "作者1, 作者2",
  "affiliations": "机构1; 机构2",
  "motivation": "<p>HTML格式的动机分析</p>",
  "method": "<p>HTML格式的方法讲解，支持$LaTeX$公式</p>",
  "experiments": "<p>HTML格式的实验分析</p>",
  "images": [...],
  "embedded_images": {
    "motivation": [{"index": 0, "caption": "图1说明", "position": "after_intro"}],
    "method": [{"index": 1, "caption": "框架图说明", "position": "start"}],
    "experiments": [{"index": 2, "caption": "实验结果图", "position": "inline"}]
  }
}
```

**embedded_images 字段说明**:
- `index`: 对应 images 数组中的索引
- `caption`: 图片说明文字
- `position`: 嵌入位置 (start/inline/end)

运行生成脚本:

```bash
python scripts/generate_html.py analysis.json -o 论文讲解.html
```

## 输出规范

### LaTeX公式

- 行内公式: `$E=mc^2$`
- 独立公式: `$$\sum_{i=1}^n x_i$$`

### 内容格式

```html
<h3>子标题</h3>
<p>段落文本，支持<code>代码</code>和<strong>强调</strong></p>
<ul><li>列表项</li></ul>
```

### 图片处理

**智能嵌入** (推荐):
- 框架图/架构图: 嵌入 method 区域开头，配详细图注
- 实验结果图: 嵌入 experiments 对应分析段落
- 概念示意图: 嵌入 motivation 帮助理解问题

**嵌入语法**:
```html
<figure class="embedded-figure">
  <img src="data:image/png;base64,..." alt="框架图">
  <figcaption>图1: 模型整体架构。输入经过编码器...</figcaption>
</figure>
```

**附录处理**:
- 所有图片仍在"图表说明"区域保留完整列表
- 嵌入的图片会同时出现在正文和附录

## 依赖

```bash
pip install pdfplumber PyMuPDF
```

## 快速示例

```bash
# 1. 解析PDF
python scripts/parse_pdf.py attention.pdf -o parsed.json

# 2. 分析内容 (Claude完成)
# 生成 analysis.json

# 3. 生成HTML
python scripts/generate_html.py analysis.json -o attention_explained.html
```
