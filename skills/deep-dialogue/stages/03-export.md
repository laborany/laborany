# 阶段3：总结与导出

## 目标

当用户结束对话时，生成结构化总结和完整对话记录，同时输出 Markdown 和 HTML 两种格式。

## 触发条件

用户说出以下关键词时进入本阶段：
- "总结"、"结束"、"今天就到这"、"导出"、"保存"
- "wrap up"、"summarize"、"export"

---

## 步骤1：确保输出目录存在

在写入任何文件之前，先确保 `docs/` 目录存在：

```bash
mkdir -p docs
```

## 步骤2：确定主题关键词

从对话内容中提取 2-4 个字的主题关键词，用于文件命名。
例如："AI创业"、"认知科学"、"技术趋势"

## 步骤3：生成对话总结

按照 `templates/summary-format.md` 的格式生成总结，保存为：
- `docs/对话总结-{主题}-{YYYY-MM-DD}.md`

## 步骤4：导出完整对话记录

将本次对话的所有内容完整导出，按照 `templates/transcript-format.md` 的格式，保存为：
- `docs/对话记录-{主题}-{YYYY-MM-DD}.md`

完整对话记录要求：
- 包含对话中的每一轮交互（用户和助手的所有消息）
- 保留原始内容，不做删减或改写
- 每轮标注时间顺序编号
- 如果对话中进行了搜索验证，记录搜索结果摘要
- 如果对话中引用了外部资料，保留链接

## 步骤5：生成 HTML 版本

将 Markdown 文件转换为 HTML。优先使用 Python `markdown` 模块，如果不可用则使用内置 fallback。

### 方案 A：Python markdown 模块（优先）

先检测是否可用：
```bash
python3 -c "import markdown" 2>/dev/null && echo "OK" || echo "MISSING"
```

如果输出 `OK`，将以下脚本保存为 `/tmp/deep-dialogue-convert.py` 并执行：

```python
#!/usr/bin/env python3
"""将对话 Markdown 转换为 HTML。"""
import markdown
import sys
import os
import re

INPUT = sys.argv[1]
OUTPUT = os.path.splitext(INPUT)[0] + ".html"

with open(INPUT, "r", encoding="utf-8") as f:
    raw = f.read()

title = "深度对话"
for line in raw.splitlines():
    if line.startswith("# "):
        title = line[2:].strip()
        break

md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "attr_list"])
body_html = md.convert(raw)
body_html = body_html.replace("<a ", '<a target="_blank" rel="noopener" ')
toc_html = md.toc if hasattr(md, "toc") else ""

CSS = """:root {
  --bg: #fafbfc; --surface: #ffffff; --surface2: #f4f6f8;
  --text: #2c3e50; --text2: #6b7b8d; --text3: #95a5b6;
  --accent: #5b6abf; --accent-light: #eef0fb;
  --border: #e2e8f0; --border-light: #edf2f7;
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
}
.page { max-width: 860px; margin: 0 auto; padding: 0 28px; }
header {
  padding: 52px 0 32px; margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
header h1 { font-size: 24px; font-weight: 700; line-height: 1.4; margin-bottom: 12px; }
header .meta { font-size: 13px; color: var(--text3); }
.toc-box {
  background: var(--surface); border: 1px solid var(--border-light);
  border-radius: 6px; padding: 20px 24px; margin: 28px 0;
  box-shadow: var(--shadow);
}
.toc-box .toc-title {
  font-size: 14px; font-weight: 600; color: var(--text2);
  text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;
}
.toc-box ul { list-style: none; }
.toc-box li { margin: 4px 0; font-size: 14px; }
.toc-box li li { margin-left: 20px; }
.toc-box a { color: var(--text2); text-decoration: none; }
.toc-box a:hover { color: var(--accent); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { font-size: 24px; margin: 48px 0 16px; font-weight: 700; }
h2 { font-size: 19px; margin: 40px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); font-weight: 600; }
h3 { font-size: 16px; margin: 28px 0 10px; font-weight: 600; }
h4 { font-size: 14px; margin: 20px 0 8px; color: var(--text2); font-weight: 600; }
p { margin: 10px 0; }
ul, ol { margin: 10px 0 10px 22px; }
li { margin: 4px 0; }
strong { font-weight: 600; }
blockquote {
  border-left: 3px solid var(--accent); padding: 10px 18px; margin: 18px 0;
  background: var(--surface2); color: var(--text2); font-size: 14px;
  border-radius: 0 4px 4px 0;
}
table {
  width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px;
  display: block; overflow-x: auto;
}
thead th {
  background: var(--surface2); font-weight: 600; text-align: left;
  padding: 10px 14px; border-bottom: 2px solid var(--border);
}
tbody td { padding: 9px 14px; border-bottom: 1px solid var(--border-light); }
tbody tr:hover { background: var(--accent-light); }
pre {
  background: #f1f5f9; border: 1px solid var(--border-light);
  border-radius: 4px; padding: 14px 18px; overflow-x: auto;
  margin: 14px 0; font-size: 13px;
}
code { font-family: "JetBrains Mono", "Fira Code", Consolas, monospace; font-size: 13px; }
p code, li code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; }
footer {
  margin-top: 60px; padding: 20px 0; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--text3); text-align: center;
}
@media (max-width: 640px) {
  .page { padding: 0 16px; }
  header { padding: 32px 0 24px; }
  header h1 { font-size: 20px; }
}
@media print {
  body { font-size: 12px; }
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; color: var(--text3); }
}"""

from datetime import date
today = date.today().isoformat()

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
    <div class="meta"><span>{today}</span> · <span>深度对话</span></div>
  </header>
  <nav class="toc-box">
    <div class="toc-title">目录</div>
    {toc_html}
  </nav>
  <main>{body_html}</main>
  <footer>由深度对话思考生成 · {today}</footer>
</div>
</body>
</html>"""

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Done → {OUTPUT} ({len(html):,} bytes)")
```

执行转换：
```bash
python3 /tmp/deep-dialogue-convert.py "docs/对话总结-{主题}-{YYYY-MM-DD}.md"
python3 /tmp/deep-dialogue-convert.py "docs/对话记录-{主题}-{YYYY-MM-DD}.md"
```

### 方案 B：Fallback（Python markdown 不可用时）

如果 `python3 -c "import markdown"` 失败，使用以下 Node.js 脚本作为 fallback。
将脚本保存为 `/tmp/deep-dialogue-convert.mjs` 并执行：

```javascript
#!/usr/bin/env node
/**
 * 简易 Markdown → HTML 转换（无外部依赖）
 * 支持：标题、段落、列表、粗体、斜体、链接、代码块、表格、引用、分隔线
 */
import { readFileSync, writeFileSync } from 'fs';

const INPUT = process.argv[2];
if (!INPUT) { console.error('Usage: node convert.mjs <input.md>'); process.exit(1); }
const OUTPUT = INPUT.replace(/\.md$/, '.html');
const raw = readFileSync(INPUT, 'utf-8');

let title = '深度对话';
for (const line of raw.split('\n')) {
  if (line.startsWith('# ')) { title = line.slice(2).trim(); break; }
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function convertInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

const lines = raw.split('\n');
const htmlParts = [];
let i = 0;
let inCodeBlock = false;
let codeBuffer = [];

while (i < lines.length) {
  const line = lines[i];

  // Code blocks
  if (line.startsWith('```')) {
    if (inCodeBlock) {
      htmlParts.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
      codeBuffer = [];
      inCodeBlock = false;
    } else {
      inCodeBlock = true;
    }
    i++; continue;
  }
  if (inCodeBlock) { codeBuffer.push(line); i++; continue; }

  // Empty line
  if (!line.trim()) { i++; continue; }

  // Headings
  const hMatch = line.match(/^(#{1,6})\s+(.+)/);
  if (hMatch) {
    const level = hMatch[1].length;
    htmlParts.push(`<h${level}>${convertInline(hMatch[2])}</h${level}>`);
    i++; continue;
  }

  // Horizontal rule
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    htmlParts.push('<hr>');
    i++; continue;
  }

  // Blockquote
  if (line.startsWith('> ')) {
    const quoteLines = [];
    while (i < lines.length && lines[i].startsWith('> ')) {
      quoteLines.push(lines[i].slice(2));
      i++;
    }
    htmlParts.push(`<blockquote><p>${convertInline(quoteLines.join('<br>'))}</p></blockquote>`);
    continue;
  }

  // Unordered list
  if (/^[-*+]\s/.test(line)) {
    const items = [];
    while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
      items.push(lines[i].replace(/^[-*+]\s+/, ''));
      i++;
    }
    htmlParts.push('<ul>' + items.map(it => `<li>${convertInline(it)}</li>`).join('') + '</ul>');
    continue;
  }

  // Ordered list
  if (/^\d+\.\s/.test(line)) {
    const items = [];
    while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
      items.push(lines[i].replace(/^\d+\.\s+/, ''));
      i++;
    }
    htmlParts.push('<ol>' + items.map(it => `<li>${convertInline(it)}</li>`).join('') + '</ol>');
    continue;
  }

  // Table
  if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i + 1])) {
    const headerCells = line.split('|').map(c => c.trim()).filter(Boolean);
    i += 2; // skip header + separator
    const rows = [];
    while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
      rows.push(lines[i].split('|').map(c => c.trim()).filter(Boolean));
      i++;
    }
    let table = '<table><thead><tr>' + headerCells.map(c => `<th>${convertInline(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const row of rows) {
      table += '<tr>' + row.map(c => `<td>${convertInline(c)}</td>`).join('') + '</tr>';
    }
    table += '</tbody></table>';
    htmlParts.push(table);
    continue;
  }

  // Paragraph
  htmlParts.push(`<p>${convertInline(line)}</p>`);
  i++;
}

const today = new Date().toISOString().split('T')[0];
const CSS = `:root{--bg:#fafbfc;--surface:#fff;--surface2:#f4f6f8;--text:#2c3e50;--text2:#6b7b8d;--text3:#95a5b6;--accent:#5b6abf;--accent-light:#eef0fb;--border:#e2e8f0;--border-light:#edf2f7;--shadow:0 1px 3px rgba(0,0,0,.06)}*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}body{font-family:"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.8;font-size:15px}.page{max-width:860px;margin:0 auto;padding:0 28px}header{padding:52px 0 32px;margin-bottom:8px;border-bottom:1px solid var(--border)}header h1{font-size:24px;font-weight:700;margin-bottom:12px}header .meta{font-size:13px;color:var(--text3)}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}h1{font-size:24px;margin:48px 0 16px;font-weight:700}h2{font-size:19px;margin:40px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--border);font-weight:600}h3{font-size:16px;margin:28px 0 10px;font-weight:600}h4{font-size:14px;margin:20px 0 8px;color:var(--text2);font-weight:600}p{margin:10px 0}ul,ol{margin:10px 0 10px 22px}li{margin:4px 0}strong{font-weight:600}blockquote{border-left:3px solid var(--accent);padding:10px 18px;margin:18px 0;background:var(--surface2);color:var(--text2);font-size:14px;border-radius:0 4px 4px 0}table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}thead th{background:var(--surface2);font-weight:600;text-align:left;padding:10px 14px;border-bottom:2px solid var(--border)}tbody td{padding:9px 14px;border-bottom:1px solid var(--border-light)}tbody tr:hover{background:var(--accent-light)}pre{background:#f1f5f9;border:1px solid var(--border-light);border-radius:4px;padding:14px 18px;overflow-x:auto;margin:14px 0;font-size:13px}code{font-family:"JetBrains Mono","Fira Code",Consolas,monospace;font-size:13px}p code,li code{background:#f1f5f9;padding:1px 5px;border-radius:3px}hr{border:none;border-top:1px solid var(--border);margin:28px 0}footer{margin-top:60px;padding:20px 0;border-top:1px solid var(--border);font-size:12px;color:var(--text3);text-align:center}@media(max-width:640px){.page{padding:0 16px}header{padding:32px 0 24px}header h1{font-size:20px}}@media print{body{font-size:12px}a[href]::after{content:" (" attr(href) ")";font-size:.8em;color:var(--text3)}}`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${title}</h1>
    <div class="meta"><span>${today}</span> · <span>深度对话</span></div>
  </header>
  <main>${htmlParts.join('\n')}</main>
  <footer>由深度对话思考生成 · ${today}</footer>
</div>
</body>
</html>`;

writeFileSync(OUTPUT, html, 'utf-8');
console.log(`Done → ${OUTPUT} (${html.length.toLocaleString()} bytes)`);
```

执行 fallback 转换：
```bash
node /tmp/deep-dialogue-convert.mjs "docs/对话总结-{主题}-{YYYY-MM-DD}.md"
node /tmp/deep-dialogue-convert.mjs "docs/对话记录-{主题}-{YYYY-MM-DD}.md"
```

### 转换策略

按以下顺序尝试：
1. 检测 `python3 -c "import markdown"` 是否成功
2. 成功 → 使用方案 A（Python，效果更好，支持 TOC）
3. 失败 → 使用方案 B（Node.js fallback，零依赖）

## 步骤6：展示结果

向用户展示：
1. 对话总结的核心内容（直接在聊天中展示）
2. 保存的文件列表和路径
3. 询问是否需要调整或补充
