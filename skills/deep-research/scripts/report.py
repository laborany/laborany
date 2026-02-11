#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Deep Research 报告生成工具

用法:
    python report.py --topic "研究主题"              # 显示报告模板
    python report.py --topic "研究主题" --output-md   # 生成 Markdown 文件
    python report.py --topic "研究主题" --output-html  # 生成 HTML 文件
    python report.py --topic "研究主题" --all          # 生成所有格式
"""

import argparse
import sys
import re
from datetime import datetime
from pathlib import Path

# ============================================================
# Windows 控制台编码修复
# ============================================================

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ============================================================
# 配置
# ============================================================

OUTPUT_DIR = Path("docs/research")


# ============================================================
# 日期上下文
# ============================================================

class DateContext:
    """日期上下文"""

    def __init__(self):
        self.now = datetime.utcnow()
        self.date = self.now.strftime("%Y-%m-%d")
        self.iso_time = self.now.isoformat()[:19] + " UTC"


# ============================================================
# 文件名工具
# ============================================================

def slugify(text: str) -> str:
    """将中英文标题转为文件名安全的 slug"""
    # 保留中文、英文、数字、连字符
    text = text.strip().lower()
    text = re.sub(r'[^\w\u4e00-\u9fff\-]', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')[:60]


# ============================================================
# Markdown 生成器
# ============================================================

def render_markdown(topic: str, date_ctx: DateContext,
                    sections: dict = None) -> str:
    """渲染 Markdown 报告"""
    s = sections or {}

    summary = s.get("summary", "[摘要内容]")
    background = s.get("background", "[背景与现状]")
    findings = s.get("findings", "[核心发现]")
    analysis = s.get("analysis", "[深度分析]")
    trends = s.get("trends", "[趋势与展望]")
    actions = s.get("actions", "[行动建议]")
    references = s.get("references", "[参考来源]")

    return f"""# {topic} - 深度研究报告

> 研究时间：{date_ctx.date}
> 生成工具：Deep Research

## 摘要

{summary}

---

## 目录

1. [背景与现状](#1-背景与现状)
2. [核心发现](#2-核心发现)
3. [深度分析](#3-深度分析)
4. [趋势与展望](#4-趋势与展望)
5. [行动建议](#5-行动建议)
6. [参考来源](#6-参考来源)

---

## 1. 背景与现状

{background}

## 2. 核心发现

{findings}

## 3. 深度分析

{analysis}

## 4. 趋势与展望

{trends}

## 5. 行动建议

{actions}

## 6. 参考来源

{references}

---

*由 Deep Research 生成 | {date_ctx.date}*
"""


# ============================================================
# HTML 生成器
# ============================================================

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{topic} - 深度研究报告</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: "Georgia", "Noto Serif SC", "Source Han Serif CN", serif;
            line-height: 1.8;
            color: #2c2c2c;
            background: #fafaf8;
        }}

        .container {{
            max-width: 760px;
            margin: 0 auto;
            padding: 60px 24px 40px;
        }}

        /* ---- 头部 ---- */
        .header {{
            margin-bottom: 40px;
            padding-bottom: 24px;
            border-bottom: 1px solid #e0ddd8;
        }}

        .header h1 {{
            font-size: 1.75rem;
            font-weight: 700;
            color: #1a1a1a;
            letter-spacing: -0.02em;
            margin-bottom: 12px;
        }}

        .header-meta {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.82rem;
            color: #999;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }}

        /* ---- 摘要 ---- */
        .summary {{
            background: #f5f4f0;
            border-left: 3px solid #c8c4bc;
            padding: 20px 24px;
            margin-bottom: 40px;
            font-size: 0.95rem;
            color: #444;
        }}

        /* ---- 目录 ---- */
        .toc {{
            margin-bottom: 40px;
            padding: 20px 24px;
            background: #fafaf8;
            border: 1px solid #e8e6e1;
        }}

        .toc h2 {{
            font-size: 0.95rem;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 12px;
        }}

        .toc ol {{
            padding-left: 20px;
        }}

        .toc li {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.88rem;
            margin-bottom: 6px;
        }}

        .toc a {{
            color: #555;
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: border-color 0.2s;
        }}

        .toc a:hover {{
            border-bottom-color: #999;
        }}

        /* ---- 章节 ---- */
        .section {{
            margin-bottom: 40px;
        }}

        .section h2 {{
            font-size: 1.25rem;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e8e6e1;
        }}

        .section h3 {{
            font-size: 1.05rem;
            font-weight: 600;
            color: #333;
            margin: 24px 0 12px;
        }}

        .section p {{
            margin-bottom: 14px;
            font-size: 0.95rem;
        }}

        .section ul, .section ol {{
            padding-left: 24px;
            margin-bottom: 14px;
        }}

        .section li {{
            margin-bottom: 8px;
            font-size: 0.93rem;
        }}

        .section blockquote {{
            border-left: 3px solid #d0cdc6;
            padding: 8px 16px;
            margin: 16px 0;
            color: #666;
            font-style: italic;
        }}

        .section a {{
            color: #4a6fa5;
            text-decoration: none;
            border-bottom: 1px solid #b8c8de;
            transition: border-color 0.2s;
        }}

        .section a:hover {{
            border-bottom-color: #4a6fa5;
        }}

        /* ---- 参考来源 ---- */
        .references {{
            margin-top: 40px;
            padding-top: 24px;
            border-top: 1px solid #e0ddd8;
        }}

        .references h2 {{
            font-size: 1.1rem;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 16px;
        }}

        .references ol {{
            padding-left: 20px;
        }}

        .references li {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.85rem;
            margin-bottom: 10px;
            color: #666;
            line-height: 1.6;
        }}

        .references a {{
            color: #4a6fa5;
            text-decoration: none;
        }}

        .references a:hover {{
            text-decoration: underline;
        }}

        /* ---- 页脚 ---- */
        .footer {{
            margin-top: 48px;
            padding-top: 20px;
            border-top: 1px solid #e0ddd8;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.75rem;
            color: #bbb;
        }}

        /* ---- 响应式 ---- */
        @media (max-width: 600px) {{
            .container {{
                padding: 32px 16px 24px;
            }}
            .header h1 {{
                font-size: 1.4rem;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>{topic}</h1>
            <div class="header-meta">
                <span>深度研究报告</span>
                <span>{date}</span>
            </div>
        </header>

        <div class="summary">
            {summary_html}
        </div>

        <nav class="toc">
            <h2>目录</h2>
            <ol>
                <li><a href="#background">背景与现状</a></li>
                <li><a href="#findings">核心发现</a></li>
                <li><a href="#analysis">深度分析</a></li>
                <li><a href="#trends">趋势与展望</a></li>
                <li><a href="#actions">行动建议</a></li>
                <li><a href="#references">参考来源</a></li>
            </ol>
        </nav>

        <main>
            <section class="section" id="background">
                <h2>1. 背景与现状</h2>
                {background_html}
            </section>

            <section class="section" id="findings">
                <h2>2. 核心发现</h2>
                {findings_html}
            </section>

            <section class="section" id="analysis">
                <h2>3. 深度分析</h2>
                {analysis_html}
            </section>

            <section class="section" id="trends">
                <h2>4. 趋势与展望</h2>
                {trends_html}
            </section>

            <section class="section" id="actions">
                <h2>5. 行动建议</h2>
                {actions_html}
            </section>

            <div class="references" id="references">
                <h2>6. 参考来源</h2>
                {references_html}
            </div>
        </main>

        <footer class="footer">
            Deep Research 生成 · {date}
        </footer>
    </div>
</body>
</html>'''


def render_html(topic: str, date_ctx: DateContext,
                sections: dict = None) -> str:
    """渲染 HTML 报告"""
    s = sections or {}

    def placeholder(key: str, default: str = "") -> str:
        val = s.get(key, default)
        return f"<p>{val}</p>" if val else f"<p>{default}</p>"

    return HTML_TEMPLATE.format(
        topic=topic,
        date=date_ctx.date,
        summary_html=placeholder("summary", "摘要内容待填充"),
        background_html=placeholder("background", "背景内容待填充"),
        findings_html=placeholder("findings", "核心发现待填充"),
        analysis_html=placeholder("analysis", "深度分析待填充"),
        trends_html=placeholder("trends", "趋势展望待填充"),
        actions_html=placeholder("actions", "行动建议待填充"),
        references_html=placeholder("references", "参考来源待填充"),
    )


# ============================================================
# 文件输出
# ============================================================

def save_files(topic: str, markdown: str, html: str,
               date_ctx: DateContext,
               save_md: bool = False, save_html: bool = False) -> dict:
    """保存输出文件"""
    slug = slugify(topic)
    prefix = f"deep-research-{date_ctx.date}-{slug}"
    results = {}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if save_md:
        md_path = OUTPUT_DIR / f"{prefix}.md"
        md_path.write_text(markdown, encoding="utf-8")
        results["markdown"] = str(md_path.absolute())
        print(f"  Markdown: {md_path}")

    if save_html:
        html_path = OUTPUT_DIR / f"{prefix}.html"
        html_path.write_text(html, encoding="utf-8")
        results["html"] = str(html_path.absolute())
        print(f"  HTML: {html_path}")

    return results


# ============================================================
# 主程序
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Deep Research 报告生成工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python report.py --topic "AI Agent 现状"
    python report.py --topic "RAG vs Fine-tuning" --output-md
    python report.py --topic "MCP 协议" --all
        """,
    )

    parser.add_argument("--topic", "-t", required=True, help="研究主题")
    parser.add_argument("--output-md", "-m", action="store_true", help="生成 Markdown")
    parser.add_argument("--output-html", "-w", action="store_true", help="生成 HTML")
    parser.add_argument("--all", "-a", action="store_true", help="生成所有格式")
    parser.add_argument("--quiet", "-q", action="store_true", help="静默模式")

    args = parser.parse_args()

    save_md = args.all or args.output_md
    save_html = args.all or args.output_html

    date_ctx = DateContext()

    if not args.quiet:
        print(f"Deep Research | {args.topic}")
        print(f"  日期: {date_ctx.date}")
        print()

    # 生成模板内容
    markdown = render_markdown(args.topic, date_ctx)
    html = render_html(args.topic, date_ctx)

    if not save_md and not save_html:
        print("提示：使用 --output-md 或 --output-html 生成文件")
        print(f"  输出目录: {OUTPUT_DIR}")
        return

    results = save_files(args.topic, markdown, html, date_ctx, save_md, save_html)

    if args.quiet:
        for path in results.values():
            print(path)


if __name__ == "__main__":
    main()
