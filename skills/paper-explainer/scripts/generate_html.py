#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                      论文讲解 HTML 生成器                                      ║
║  功能: 将论文分析结果渲染为可视化 HTML                                          ║
║  特性: LaTeX 公式渲染 (MathJax)、响应式布局、代码高亮                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import argparse
import json
import html
import sys
from pathlib import Path
from datetime import datetime

# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              HTML 模板                                        │
# └──────────────────────────────────────────────────────────────────────────────┘

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - 论文精讲</title>

    <!-- MathJax 配置: LaTeX 公式渲染 -->
    <script>
        MathJax = {{
            tex: {{
                inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
                displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
                processEscapes: true
            }},
            options: {{ skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre'] }}
        }};
    </script>
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

    <style>
        :root {{
            --primary: #2563eb;
            --secondary: #64748b;
            --bg: #f8fafc;
            --card-bg: #ffffff;
            --border: #e2e8f0;
            --text: #1e293b;
            --text-muted: #64748b;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: var(--bg); color: var(--text); line-height: 1.7; }}
        .container {{ max-width: 900px; margin: 0 auto; padding: 2rem; }}
        .paper-header {{ text-align: center; margin-bottom: 3rem; padding: 2rem;
                         background: var(--card-bg); border-radius: 12px;
                         box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .paper-title {{ font-size: 1.8rem; color: var(--primary); margin-bottom: 1rem; }}
        .authors {{ font-size: 1.1rem; color: var(--text); margin-bottom: 0.5rem; }}
        .affiliations {{ font-size: 0.95rem; color: var(--text-muted); font-style: italic; }}
        .toc {{ background: var(--card-bg); padding: 1.5rem; border-radius: 8px;
                margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .toc h2 {{ font-size: 1.1rem; margin-bottom: 1rem; color: var(--secondary); }}
        .toc ul {{ list-style: none; display: flex; flex-wrap: wrap; gap: 1rem; }}
        .toc a {{ color: var(--primary); text-decoration: none; padding: 0.5rem 1rem;
                  background: var(--bg); border-radius: 6px; transition: all 0.2s; }}
        .toc a:hover {{ background: var(--primary); color: white; }}
        .section {{ background: var(--card-bg); padding: 2rem; border-radius: 12px;
                    margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .section h2 {{ font-size: 1.4rem; color: var(--primary); margin-bottom: 1.5rem;
                       padding-bottom: 0.5rem; border-bottom: 2px solid var(--border); }}
        .content {{ font-size: 1rem; }}
        .content p {{ margin-bottom: 1rem; }}
        .content h3 {{ font-size: 1.15rem; color: var(--text); margin: 1.5rem 0 1rem; }}
        .content ul, .content ol {{ margin: 1rem 0; padding-left: 1.5rem; }}
        .content li {{ margin-bottom: 0.5rem; }}
        .content code {{ background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px;
                         font-family: 'Fira Code', monospace; font-size: 0.9em; }}
        .content pre {{ background: #1e293b; color: #e2e8f0; padding: 1rem;
                        border-radius: 8px; overflow-x: auto; margin: 1rem 0; }}
        .figures-grid {{ display: grid; gap: 1.5rem; }}
        .figure-item {{ background: var(--bg); padding: 1rem; border-radius: 8px;
                        border: 1px solid var(--border); }}
        .figure-placeholder {{ background: #e2e8f0; height: 200px; display: flex;
                               align-items: center; justify-content: center;
                               border-radius: 6px; color: var(--text-muted);
                               font-size: 0.9rem; margin-bottom: 1rem; }}
        .figure-caption {{ font-size: 0.95rem; color: var(--text-muted); }}
        /* 嵌入式图片样式 */
        .embedded-figure {{ background: var(--bg); padding: 1.5rem; border-radius: 10px;
                           margin: 1.5rem 0; border: 1px solid var(--border); }}
        .embedded-figure img {{ max-width: 100%; height: auto; border-radius: 6px;
                               display: block; margin: 0 auto; }}
        .embedded-figure figcaption {{ margin-top: 1rem; font-size: 0.95rem;
                                      color: var(--text); line-height: 1.6; }}
        .embedded-figure figcaption strong {{ color: var(--primary); }}
        .embedded-figure.architecture {{ border-left: 4px solid var(--primary); }}
        .embedded-figure.experiment {{ border-left: 4px solid #10b981; }}
        .embedded-figure.concept {{ border-left: 4px solid #f59e0b; }}
        footer {{ text-align: center; padding: 2rem; color: var(--text-muted);
                  font-size: 0.9rem; }}
        table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; }}
        th, td {{ padding: 0.75rem; border: 1px solid var(--border); text-align: left; }}
        th {{ background: var(--bg); font-weight: 600; }}
        @media (max-width: 768px) {{
            .container {{ padding: 1rem; }}
            .toc ul {{ flex-direction: column; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <!-- 论文头部信息 -->
        <header class="paper-header">
            <h1 class="paper-title">{title}</h1>
            <div class="paper-meta">
                <div class="authors">{authors}</div>
                <div class="affiliations">{affiliations}</div>
            </div>
        </header>

        <!-- 目录导航 -->
        <nav class="toc">
            <h2>目录</h2>
            <ul>
                <li><a href="#motivation">研究动机</a></li>
                <li><a href="#method">方法详解</a></li>
                <li><a href="#experiments">实验结果</a></li>
                <li><a href="#figures">图表说明</a></li>
            </ul>
        </nav>

        <!-- 研究动机 -->
        <section id="motivation" class="section">
            <h2>研究动机</h2>
            <div class="content">{motivation}</div>
        </section>

        <!-- 方法详解 -->
        <section id="method" class="section">
            <h2>方法详解</h2>
            <div class="content">{method}</div>
        </section>

        <!-- 实验结果 -->
        <section id="experiments" class="section">
            <h2>实验结果</h2>
            <div class="content">{experiments}</div>
        </section>

        <!-- 图表说明 -->
        <section id="figures" class="section">
            <h2>图表说明</h2>
            <div class="figures-grid">{figures}</div>
        </section>

        <!-- 页脚 -->
        <footer>
            <p>生成时间: {generated_at}</p>
        </footer>
    </div>
</body>
</html>'''

# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              辅助函数                                          │
# └──────────────────────────────────────────────────────────────────────────────┘

def escape_html(text: str) -> str:
    """转义 HTML 特殊字符，保留 LaTeX 公式"""
    return html.escape(str(text)) if text else ""


def render_embedded_image(img: dict, caption: str, fig_type: str = "architecture") -> str:
    """
    渲染嵌入式图片
    fig_type: architecture | experiment | concept
    """
    if img.get("base64"):
        ext = img.get("ext", "png")
        img_src = f'data:image/{ext};base64,{img["base64"]}'
    elif img.get("path"):
        img_src = escape_html(img["path"])
    else:
        return ""

    return f'''<figure class="embedded-figure {fig_type}">
    <img src="{img_src}" alt="{escape_html(caption[:50])}">
    <figcaption>{caption}</figcaption>
</figure>'''


def process_embedded_images(content: str, images: list, embedded_config: list) -> str:
    """
    将嵌入图片插入到内容中
    embedded_config: [{"index": 0, "caption": "...", "position": "start|inline|end"}]
    """
    if not embedded_config or not images:
        return content

    start_figs = []
    end_figs = []

    for cfg in embedded_config:
        idx = cfg.get("index", 0)
        if idx >= len(images):
            continue

        img = images[idx]
        caption = cfg.get("caption", f"图 {idx + 1}")
        fig_type = cfg.get("type", "architecture")
        position = cfg.get("position", "end")

        fig_html = render_embedded_image(img, caption, fig_type)
        if not fig_html:
            continue

        if position == "start":
            start_figs.append(fig_html)
        else:
            end_figs.append(fig_html)

    return "\n".join(start_figs) + content + "\n".join(end_figs)


def render_figures(images: list) -> str:
    """渲染图片占位符和图例"""
    if not images:
        return "<p>本论文未提取到图片</p>"

    items = []
    for img in images:
        page = img.get("page_num", "?")
        idx = img.get("image_index", "?")
        w = img.get("width", "?")
        h = img.get("height", "?")

        # 如果有 base64 数据，直接嵌入；否则显示占位符
        if img.get("base64"):
            ext = img.get("ext", "png")
            img_html = f'<img src="data:image/{ext};base64,{img["base64"]}" style="max-width:100%;border-radius:6px;">'
        elif img.get("path"):
            img_html = f'<img src="{escape_html(img["path"])}" style="max-width:100%;border-radius:6px;">'
        else:
            img_html = f'<div class="figure-placeholder">[图片占位符] 第{page}页 图{idx} ({w}×{h})</div>'

        items.append(f'''
        <div class="figure-item">
            {img_html}
            <div class="figure-caption">
                <strong>图 {idx}</strong> (第 {page} 页) - 尺寸: {w}×{h}
            </div>
        </div>''')

    return "\n".join(items)


def generate_html(analysis: dict, output_path: str = None) -> str:
    """
    根据论文分析结果生成 HTML
    analysis 结构: {title, authors, affiliations, motivation, method, experiments, images, embedded_images}
    embedded_images: {motivation: [...], method: [...], experiments: [...]}
    """
    images = analysis.get("images", [])
    embedded = analysis.get("embedded_images", {})

    # 处理各区域的嵌入图片
    motivation_content = process_embedded_images(
        analysis.get("motivation", "<p>待分析</p>"),
        images,
        embedded.get("motivation", [])
    )
    method_content = process_embedded_images(
        analysis.get("method", "<p>待分析</p>"),
        images,
        embedded.get("method", [])
    )
    experiments_content = process_embedded_images(
        analysis.get("experiments", "<p>待分析</p>"),
        images,
        embedded.get("experiments", [])
    )

    html_content = HTML_TEMPLATE.format(
        title=escape_html(analysis.get("title", "未知标题")),
        authors=escape_html(analysis.get("authors", "未知作者")),
        affiliations=escape_html(analysis.get("affiliations", "未知机构")),
        motivation=motivation_content,
        method=method_content,
        experiments=experiments_content,
        figures=render_figures(images),
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"HTML 已保存到: {output_path}")

    return html_content


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              命令行接口                                        │
# └──────────────────────────────────────────────────────────────────────────────┘

def main():
    parser = argparse.ArgumentParser(
        description="将论文分析结果生成为可视化 HTML"
    )
    parser.add_argument(
        "analysis_json",
        help="论文分析结果 JSON 文件路径"
    )
    parser.add_argument(
        "-o", "--output",
        required=True,
        help="输出 HTML 文件路径"
    )

    args = parser.parse_args()

    if not Path(args.analysis_json).exists():
        print(f"错误: 文件不存在 - {args.analysis_json}", file=sys.stderr)
        sys.exit(1)

    with open(args.analysis_json, "r", encoding="utf-8") as f:
        analysis = json.load(f)

    generate_html(analysis, args.output)


if __name__ == "__main__":
    main()
