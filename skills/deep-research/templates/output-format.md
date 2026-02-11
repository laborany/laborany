# 输出格式模板集合

本文档包含不同详细程度的输出格式模板，用于在生成提示词时根据用户需求选择合适的输出格式。

---

## 1. 简洁版输出格式

**适用场景：**
- 快速获取核心信息
- 时间有限的研究
- 概览性研究

**格式内容：**
```
请按照以下简洁格式输出：

# [研究主题] - 研究摘要

## 核心要点
1. [要点1]：[简要说明]
2. [要点2]：[简要说明]
3. [要点3]：[简要说明]
4. [要点4]：[简要说明]
5. [要点5]：[简要说明]

## 关键数据
- [数据1]：[数值/描述]
- [数据2]：[数值/描述]
- [数据3]：[数值/描述]

## 主要来源
- [来源1] - [链接/描述]
- [来源2] - [链接/描述]
```

---

## 2. 标准版输出格式

**适用场景：**
- 常规深度研究
- 获取全面且结构化的信息
- 大多数研究场景

**格式内容：**
```
请按照以下标准格式输出：

# [研究主题] 深度研究报告

## 1. 执行摘要
[用2-3段概括核心发现，包括：
- 研究目标
- 主要发现
- 关键结论]

## 2. 研究框架说明
[简要说明使用的研究框架和维度]

## 3. 详细分析
[按照研究框架分章节详细呈现]

### 3.1 [章节1标题]
[详细内容]

### 3.2 [章节2标题]
[详细内容]

[继续其他章节...]

## 4. 关键数据与引用

### 重要数据
| 指标 | 数值 | 来源 | 时间 |
|------|------|------|------|
| [数据1] | [数值] | [来源] | [时间] |
| [数据2] | [数值] | [来源] | [时间] |

### 直接引用
- "[引用1]" — [来源/人物]
- "[引用2]" — [来源/人物]

## 5. 信息来源
### 主要来源
1. [来源1]：[简要说明]
2. [来源2]：[简要说明]
3. [来源3]：[简要说明]

### 来源类型分布
- 官方发布：[数量/占比]
- 新闻报道：[数量/占比]
- 分析评论：[数量/占比]
- 学术研究：[数量/占比]
- 其他：[数量/占比]

## 6. 研究局限性
[说明研究过程中可能存在的限制，如：
- 信息获取限制
- 时间限制
- 数据可获得性
- 主观判断因素]

## 7. 延伸阅读建议
- 方向1：[说明] - 推荐来源/关键词
- 方向2：[说明] - 推荐来源/关键词
- 方向3：[说明] - 推荐来源/关键词

---
**报告生成时间**：[时间]
**信息时效性**：[说明数据的时间范围]
```

---

## 3. 完整版输出格式

**适用场景：**
- 需要极度详尽的研究
- 学术或专业用途
- 需要完整存档的研究

**格式内容：**
```
请按照以下完整格式输出：

# [研究主题] 综合研究报告

## 目录
[自动生成目录]

---

## 第一部分：执行摘要

### 1.1 研究背景
[详细描述研究背景和动机]

### 1.2 研究目标
[列出具体研究目标]

### 1.3 核心发现
[按优先级列出最重要的发现]

### 1.4 关键结论
[总结关键结论和洞察]

### 1.5 行动建议（如适用）
[提供具体的行动建议]

---

## 第二部分：研究方法

### 2.1 研究框架
[详细说明使用的研究框架]

### 2.2 信息来源
[详细列出信息来源类型和具体来源]

### 2.3 研究过程
[描述研究过程和方法论]

---

## 第三部分：详细分析

### 3.1 [分析维度1]
#### 3.1.1 [子维度]
[详细内容，包括：
- 数据/事实
- 分析
- 图表说明（如适用）]

#### 3.1.2 [子维度]
[详细内容]

### 3.2 [分析维度2]
[同上结构]

[继续其他维度...]

---

## 第四部分：对比分析（如适用）

### 4.1 [对比维度]
| 对比项 | 选项A | 选项B | 选项C |
|--------|-------|-------|-------|
| [指标1] | [值A] | [值B] | [值C] |
| [指标2] | [值A] | [值B] | [值C] |

### 4.2 对比结论
[分析对比结果]

---

## 第五部分：关键数据

### 5.1 数据汇总
| 类别 | 指标 | 数值 | 单位 | 来源 | 时间 |
|------|------|------|------|------|------|
| [类别] | [指标] | [数值] | [单位] | [来源] | [时间] |

### 5.2 数据可视化说明
[描述如何可视化呈现关键数据]

---

## 第六部分：重要引用

### 6.1 直接引用
- **引用1**
  > "[完整引用内容]"
  > — [来源/人物]，[场合/时间]

- **引用2**
  > "[完整引用内容]"
  > — [来源/人物]，[场合/时间]

### 6.2 观点摘录
[摘录重要观点并标注来源]

---

## 第七部分：时间线

### 7.1 发展时间线
```mermaid
[如适用，使用时间线图表]
或使用表格：
时间 | 事件 | 影响 | 来源
-----|------|------|------
[时间] | [事件] | [影响] | [来源]
```

---

## 第八部分：人物/机构简介

### 8.1 重要人物
- **[姓名]**
  - 职位/身份：[描述]
  - 主要贡献：[列举]
  - 相关观点：[概述]

### 8.2 重要机构
- **[机构名]**
  - 类型：[描述]
  - 主要活动：[列举]
  - 影响力：[说明]

---

## 第九部分：争议与分歧

### 9.1 主要争议点
- **争议1**：[描述]
  - 支持方观点：[说明]
  - 反对方观点：[说明]
  - 中间立场：[说明]

### 9.2 共识领域
[列出各方达成共识的领域]

---

## 第十部分：未来展望

### 10.1 短期预期（1年内）
[预测和说明]

### 10.2 中期预期（1-3年）
[预测和说明]

### 10.3 长期预期（3-5年）
[预测和说明]

### 10.4 关键不确定因素
[列出影响未来的不确定因素]

---

## 第十一部分：信息来源详录

### 11.1 官方来源
1. [来源名]：[链接]：[说明]

### 11.2 新闻报道
1. [标题]：[媒体名]，[日期]：[链接]

### 11.3 分析报告
1. [标题]：[机构名]，[日期]：[链接]

### 11.4 学术文献
1. [标题]：[作者]，[期刊/会议]，[日期]

### 11.5 其他来源
1. [类型]：[说明]

---

## 第十二部分：附录

### 12.1 术语表
| 术语 | 定义 |
|------|------|
| [术语1] | [定义] |
| [术语2] | [定义] |

### 12.2 缩略语
| 缩略语 | 全称 | 说明 |
|--------|------|------|
| [缩写] | [全称] | [说明] |

### 12.3 补充材料
[任何额外的图表、数据等]

---

## 第十三部分：研究元数据

- **研究主题**：[主题]
- **研究时间**：[日期范围]
- **研究深度**：[简洁/标准/完整]
- **框架使用**：[框架名称]
- **信息源数量**：[数量]
- **信息时效性**：[时间范围]
- **研究工具**：[工具名称]

---

**报告结束**
```

---

## 4. 特殊用途格式

### 4.1 对比分析格式
```
# [对比主题] 对比分析报告

## 对比对象
- 对象A：[描述]
- 对象B：[描述]

## 对比维度
| 维度 | 对象A | 对象B | 对比说明 |
|------|-------|-------|----------|
| [维度1] | [描述] | [描述] | [分析] |
| [维度2] | [描述] | [描述] | [分析] |

## 结论
[总结对比结果和推荐]
```

### 4.2 时间线格式
```
# [主题] 发展时间线

## 时间线表格
| 时间 | 事件 | 重要性 | 影响 | 来源 |
|------|------|--------|------|------|
| [时间] | [事件] | 高/中/低 | [影响] | [来源] |

## 阶段划分
### 阶段1：[名称] ([时间范围])
- 主要特征：[描述]
- 关键事件：[列举]
- 历史意义：[说明]
```

### 4.3 观点整理格式
```
# [主题] 观点整理报告

## 观点分布
| 立场 | 支持率估计 | 主要代表 | 核心论据 |
|------|-----------|----------|----------|
| 支持 | [估计] | [列表] | [概述] |
| 反对 | [估计] | [列表] | [概述] |
| 中立 | [估计] | [列表] | [概述] |

## 争议焦点
[列出主要分歧点]

## 演进趋势
[描述观点随时间的变化]
```

---

## 5. HTML 输出格式

**适用场景：**
- 需要可直接在浏览器中查看的调研报告
- 分享给非技术人员或管理层阅读
- 需要响应式排版、表格样式、目录导航等增强体验
- 作为 Markdown 报告的可视化补充

**设计风格：** 浅色背景、简洁清新、正式调研报告风格。无花哨装饰，重点突出内容可读性。

**生成方式：**

在完成 Markdown 报告后，使用 Python `markdown` 模块将 `.md` 转换为自包含的单文件 HTML。

**转换脚本模板：**
```python
#!/usr/bin/env python3
"""将 Markdown 研究报告转换为 HTML 调研报告。"""
import markdown
import re
import sys
import os

INPUT = sys.argv[1] if len(sys.argv) > 1 else "report.md"
OUTPUT = os.path.splitext(INPUT)[0] + ".html"

with open(INPUT, "r", encoding="utf-8") as f:
    raw = f.read()

# 提取 YAML front matter 中的元数据
title, date, tags = "", "", []
fm = re.match(r"^---\n(.*?)\n---\n", raw, re.DOTALL)
if fm:
    for line in fm.group(1).splitlines():
        if line.startswith("title:"):
            title = line.split(":", 1)[1].strip().strip('"\'')
        elif line.startswith("date:"):
            date = line.split(":", 1)[1].strip()
        elif line.startswith("tags:"):
            tags = [t.strip() for t in line.split("[")[1].rstrip("]").split(",")]
    raw = raw[fm.end():]

# Markdown → HTML
md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "attr_list"])
body_html = md.convert(raw)
body_html = body_html.replace("<a ", '<a target="_blank" rel="noopener" ')
toc_html = md.toc if hasattr(md, "toc") else ""

# 生成标签 HTML
tags_html = "".join(f'<span class="tag">{t}</span>' for t in tags)

# 读取 CSS（内联）
CSS = """/* === 调研报告浅色主题 === */
:root {
  --bg: #fafbfc; --surface: #ffffff; --surface2: #f4f6f8;
  --text: #2c3e50; --text2: #6b7b8d; --text3: #95a5b6;
  --accent: #3574d4; --accent-light: #e8f0fe;
  --border: #e2e8f0; --border-light: #edf2f7;
  --code-bg: #f1f5f9;
  --shadow: 0 1px 3px rgba(0,0,0,.06);
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI",
    Helvetica, Arial, sans-serif;
  background: var(--bg); color: var(--text);
  line-height: 1.8; font-size: 15px;
  -webkit-font-smoothing: antialiased;
}

/* 布局 */
.page { max-width: 860px; margin: 0 auto; padding: 0 28px; }

/* 页头 */
header {
  padding: 52px 0 32px; margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
header h1 {
  font-size: 24px; font-weight: 700; color: var(--text);
  line-height: 1.4; margin-bottom: 12px; letter-spacing: -0.3px;
}
header .meta { font-size: 13px; color: var(--text3); margin-bottom: 14px; }
header .meta span { margin-right: 16px; }
.tag {
  display: inline-block; font-size: 12px; color: var(--accent);
  background: var(--accent-light); padding: 2px 10px;
  border-radius: 3px; margin: 2px 4px 2px 0; font-weight: 500;
}

/* 目录 */
.toc-box {
  background: var(--surface); border: 1px solid var(--border-light);
  border-radius: 6px; padding: 20px 24px; margin: 28px 0;
  box-shadow: var(--shadow);
}
.toc-box .toc-title {
  font-size: 14px; font-weight: 600; color: var(--text2);
  text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;
}
.toc-box ul { list-style: none; margin: 0; padding: 0; }
.toc-box li { margin: 4px 0; font-size: 14px; line-height: 1.6; }
.toc-box li li { margin-left: 20px; }
.toc-box a { color: var(--text2); text-decoration: none; border-bottom: 1px solid transparent; }
.toc-box a:hover { color: var(--accent); border-bottom-color: var(--accent); }

/* 正文链接 */
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* 标题 */
h1 { font-size: 24px; margin: 48px 0 16px; color: var(--text); font-weight: 700; }
h2 {
  font-size: 19px; margin: 40px 0 16px; padding-bottom: 8px;
  border-bottom: 1px solid var(--border); color: var(--text); font-weight: 600;
}
h3 { font-size: 16px; margin: 28px 0 10px; color: var(--text); font-weight: 600; }
h4 { font-size: 14px; margin: 20px 0 8px; color: var(--text2); font-weight: 600; }
p { margin: 10px 0; }
ul, ol { margin: 10px 0 10px 22px; }
li { margin: 4px 0; }
strong { color: var(--text); font-weight: 600; }

/* 引用 */
blockquote {
  border-left: 3px solid var(--accent); padding: 10px 18px; margin: 18px 0;
  background: var(--surface2); color: var(--text2);
  font-size: 14px; border-radius: 0 4px 4px 0;
}

/* 表格 */
table {
  width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px;
  display: block; overflow-x: auto; -webkit-overflow-scrolling: touch;
}
thead th {
  background: var(--surface2); color: var(--text); font-weight: 600;
  text-align: left; padding: 10px 14px;
  border-bottom: 2px solid var(--border); white-space: nowrap;
}
tbody td {
  padding: 9px 14px; border-bottom: 1px solid var(--border-light);
  vertical-align: top;
}
tbody tr:hover { background: var(--accent-light); }

/* 代码 */
pre {
  background: var(--code-bg); border: 1px solid var(--border-light);
  border-radius: 4px; padding: 14px 18px; overflow-x: auto;
  margin: 14px 0; font-size: 13px; line-height: 1.6;
}
code {
  font-family: "JetBrains Mono", "Fira Code", "SF Mono", Consolas,
    "Courier New", monospace; font-size: 13px;
}
p code, li code {
  background: var(--code-bg); padding: 1px 5px;
  border-radius: 3px; font-size: 0.9em;
}

/* 页脚 */
footer {
  margin-top: 60px; padding: 20px 0; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--text3); text-align: center;
}

/* 响应式 */
@media (max-width: 640px) {
  .page { padding: 0 16px; }
  header { padding: 32px 0 24px; }
  header h1 { font-size: 20px; }
  h2 { font-size: 17px; }
  table { font-size: 12px; }
  thead th, tbody td { padding: 7px 8px; }
}
@media print {
  body { font-size: 12px; }
  .toc-box { break-inside: avoid; }
  a { color: var(--text); text-decoration: underline; }
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; color: var(--text3); }
}"""

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>{CSS}</style>
</head>
<body>
<div class="page">
  <header>
    <h1>{title}</h1>
    <div class="meta"><span>{date}</span><span>深度研究报告</span></div>
    <div>{tags_html}</div>
  </header>
  <nav class="toc-box">
    <div class="toc-title">目录</div>
    {toc_html}
  </nav>
  <main>{body_html}</main>
  <footer>本报告由 Deep Research 自动生成 · {date}</footer>
</div>
</body>
</html>"""

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Done → {OUTPUT} ({len(html):,} bytes)")
```

**使用方式：**
```bash
pip install markdown   # 首次使用需安装
python convert.py path/to/report.md
# 自动输出 path/to/report.html
```

**HTML 输出规范：**
- 自包含单文件，所有 CSS 内联在 `<style>` 标签中
- 浅色背景（`#fafbfc`），白色内容区，蓝色强调色，无花哨装饰
- 中文字体栈：Noto Sans SC → PingFang SC → Microsoft YaHei → 系统默认
- 表格：无竖线边框，仅底部分隔线，hover 浅蓝高亮，横向可滚动
- 代码块：浅灰背景 + 等宽字体
- 自动生成目录导航（基于 `markdown.extensions.toc`）
- 所有外部链接 `target="_blank"`
- 响应式设计，640px 以下自适应移动端
- 支持打印样式（`@media print`），链接自动展示 URL
- 页头展示标题、日期、标签；页脚展示生成信息

---

## 格式选择指南

| 需求场景 | 推荐格式 | 说明 |
|---------|---------|------|
| 快速了解核心信息 | 简洁版 | 2-3分钟阅读 |
| 常规研究 | 标准版 | 10-15分钟阅读 |
| 专业/学术用途 | 完整版 | 30分钟+阅读 |
| 多方案对比 | 对比分析格式 | 含对比表格 |
| 历史事件梳理 | 时间线格式 | 含时间线 |
| 争议问题研究 | 观点整理格式 | 含立场分布 |
| 可视化分享/浏览器阅读 | HTML 格式 | 精美排版，响应式 |
