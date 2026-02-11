#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI热点采集工具
用法:
    python collect.py                    # 采集今日热点并输出到终端
    python collect.py --output-md        # 生成 Markdown 文件
    python collect.py --output-html      # 生成 HTML 文件
    python collect.py --all              # 生成所有格式
"""

import argparse
import json
import re
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# 修复 Windows 控制台编码问题
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ============================================================
# 配置
# ============================================================

# 输出目录配置
OUTPUT_DIR = Path("docs/hotspots")
HTML_DIR = Path("docs/hotspot")

# 聚焦领域（优先级排序）
FOCUS_AREAS = [
    "Vibe Coding - 自然语言编程、Cursor、Claude Code",
    "Claude生态 - Claude Skill、MCP Server、Claude Code技巧",
    "AI Agent - 自动化工作流、n8n、Make",
    "AI知识管理 - 第二大脑、PKM、Obsidian+AI",
    "模型更新 - GPT、Claude、Gemini版本发布",
    "AI新产品 - Product Hunt上榜、独立开发者作品",
    "海外热点 - 行业大事件、收购、融资",
]

# 数据源定义
DATA_SOURCES = {
    "ai_blogs": {
        "name": "AI博主/KOL",
        "icon": "🧑‍💻",
        "accounts": [
            "@AnthropicAI - Anthropic官方",
            "@OpenAI - OpenAI官方",
            "@kaborsk1 - Boris Cherny（Claude Code创作者）",
            "@swyx - AI工程师，Latent Space播客",
            "@simonw - Simon Willison，AI工具实践",
            "@levelsio - Pieter Levels，AI独立开发",
        ],
        "queries_template": [
            '"Claude Code" OR "Cursor" tips tricks "{month_day}"',
            'AI agent n8n automation "{month}"',
        ],
    },
    "products": {
        "name": "创业公司/新产品",
        "icon": "🚀",
        "sources": [
            "Product Hunt - 当日上榜产品",
            "Hacker News - Show HN 项目",
        ],
        "queries_template": [
            'Product Hunt AI tools "{month_day}"',
            'Hacker News AI "{month_day}"',
        ],
    },
    "research": {
        "name": "AI研究/学术动态",
        "icon": "🔬",
        "sources": [
            "arXiv - AI 论文",
            "Google DeepMind 博客",
            "Meta AI 博客",
            "Microsoft Research",
        ],
        "queries_template": [
            'site:arxiv.org "Claude" OR "AI agent" after:{yesterday}',
            'site:deepmind.google {month}',
            'site:ai.meta.com {month}',
            'site:openai.com blog {month}',
        ],
    },
    "companies": {
        "name": "模型厂商动态",
        "icon": "🏢",
        "queries_template": [
            'site:anthropic.com OR "Claude" announcement after:{yesterday}',
            'site:openai.com OR "ChatGPT" update {month}',
            '"Gemini" update OR site:blog.google AI after:{yesterday}',
            '"Grok" update {month}',
        ],
    },
    "community": {
        "name": "社区热议",
        "icon": "💬",
        "subreddits": [
            "r/ClaudeAI",
            "r/ChatGPT",
            "r/LocalLLaMA",
            "r/artificial",
            "r/vibecoding",
            "r/MachineLearning",
        ],
        "queries_template": [
            'site:reddit.com/r/ClaudeAI "{date}" OR "{yesterday}"',
            'site:reddit.com/r/vibecoding "{month_day}"',
            'site:reddit.com/r/artificial "{date}"',
        ],
    },
}


# ============================================================
# 日期工具
# ============================================================

class DateContext:
    """日期上下文管理器"""

    def __init__(self):
        self.now = datetime.utcnow()
        self.today = self.now.strftime("%Y-%m-%d")
        self.yesterday = (self.now - timedelta(days=1)).strftime("%Y-%m-%d")
        self.month = self.now.strftime("%B %Y")  # 例如 "February 2026"
        self.month_day = self.now.strftime("%B %d, %Y")  # 例如 "February 09, 2026"
        self.short_date = self.now.strftime("%m%d")  # 例如 "0209"
        self.iso_time = self.now.isoformat()[:19] + " UTC"

    def format_for_search(self) -> dict:
        """返回用于搜索的日期字典"""
        return {
            "date": self.today,
            "yesterday": self.yesterday,
            "month": self.month,
            "month_day": self.month_day,
        }

    def format_for_display(self) -> dict:
        """返回用于显示的日期字典"""
        return {
            "short_date": self.short_date,
            "iso_time": self.iso_time,
            "date": self.today,
        }


# ============================================================
# 搜索查询生成器
# ============================================================

def build_search_queries(date_ctx: DateContext) -> dict:
    """构建各数据源的搜索查询"""
    dates = date_ctx.format_for_search()
    queries = {}

    for key, source in DATA_SOURCES.items():
        source_queries = []
        if "queries_template" in source:
            for tmpl in source["queries_template"]:
                # 替换日期占位符
                query = tmpl.format(**dates)
                source_queries.append(query)
        queries[key] = source_queries

    return queries


def print_search_queries(queries: dict):
    """打印搜索查询（供手动执行或调试）"""
    print("=" * 60)
    print("🔍 搜索查询列表（请使用 WebSearch 工具执行）")
    print("=" * 60)
    print()

    for key, source in DATA_SOURCES.items():
        print(f"{source['icon']} **{source['name']}**")
        for query in queries[key]:
            print(f"  - {query}")
        print()


# ============================================================
# Markdown 生成器
# ============================================================

def render_markdown(hotspots: dict, date_ctx: DateContext) -> str:
    """渲染 Markdown 格式输出"""
    display = date_ctx.format_for_display()

    lines = [
        f"## 今日AI热点 - {display['short_date']}",
        "",
        f"> 采集时间：{display['iso_time']}",
        "> 时间范围：近24小时",
        "",
        "---",
        "",
    ]

    # 按分类渲染热点
    for key, source in DATA_SOURCES.items():
        items = hotspots.get(key, [])
        if not items:
            continue

        lines.append(f"### {source['icon']} {source['name']}")
        lines.append("")

        for i, item in enumerate(items, 1):
            lines.append(f"{i}. **{item.get('title', '无标题')}**")
            lines.append(f"   - 原文：[{item.get('source', '链接')}]({item.get('url', '#')})")

            if item.get('author'):
                lines.append(f"   - 作者：{item['author']}")
            if item.get('publish_time'):
                lines.append(f"   - 发布时间：{item['publish_time']}")
            if item.get('heat'):
                lines.append(f"   - 热度：{item['heat']}")
            if item.get('summary'):
                lines.append(f"   - 要点：{item['summary']}")

            lines.append("")

        lines.append("---")
        lines.append("")

    # 添加页脚
    lines.extend([
        "## 📊 聚焦领域",
        "",
    ])
    for i, area in enumerate(FOCUS_AREAS, 1):
        lines.append(f"{i}. {area}")

    lines.extend([
        "",
        "---",
        "",
        "*由 Topic Collector 自动生成 | 数据来源：Twitter/X、Reddit、Product Hunt、Hacker News*",
    ])

    return "\n".join(lines)


# ============================================================
# HTML 生成器
# ============================================================

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 热点日报 - {short_date}</title>
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
            max-width: 720px;
            margin: 0 auto;
            padding: 60px 24px 40px;
        }}

        .header {{
            margin-bottom: 48px;
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

        .section {{
            margin-bottom: 40px;
        }}

        .section-title {{
            font-size: 1.15rem;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 20px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e8e6e1;
        }}

        .section-title .icon {{
            margin-right: 6px;
        }}

        .item {{
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #f0eeea;
        }}

        .item:last-child {{
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }}

        .item-title {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
            font-weight: 600;
            color: #1a1a1a;
            font-size: 1rem;
            line-height: 1.5;
            margin-bottom: 6px;
        }}

        .item-title a {{
            color: #1a1a1a;
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: border-color 0.2s;
        }}

        .item-title a:hover {{
            border-bottom-color: #999;
        }}

        .item-meta {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.78rem;
            color: #aaa;
            margin-bottom: 8px;
        }}

        .item-meta span {{
            margin-right: 12px;
        }}

        .item-summary {{
            font-size: 0.92rem;
            color: #555;
            line-height: 1.7;
        }}

        .item-source {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: inline-block;
            margin-top: 8px;
            font-size: 0.78rem;
            color: #888;
            text-decoration: none;
            transition: color 0.2s;
        }}

        .item-source:hover {{
            color: #555;
        }}

        .empty-state {{
            text-align: center;
            padding: 24px;
            color: #bbb;
            font-size: 0.9rem;
        }}

        .focus-section {{
            margin-top: 48px;
            padding-top: 24px;
            border-top: 1px solid #e0ddd8;
        }}

        .focus-section h3 {{
            font-size: 0.95rem;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 16px;
        }}

        .focus-list {{
            list-style: none;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }}

        .focus-list li {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 4px 12px;
            background: #f3f1ed;
            border-radius: 3px;
            font-size: 0.8rem;
            color: #666;
        }}

        .footer {{
            margin-top: 48px;
            padding-top: 20px;
            border-top: 1px solid #e0ddd8;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.75rem;
            color: #bbb;
        }}

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
            <h1>AI 热点日报</h1>
            <div class="header-meta">
                <span>{date}</span>
                <span>采集于 {iso_time}</span>
                <span>近 24 小时</span>
            </div>
        </header>

        <main>
            {sections}

            <div class="focus-section">
                <h3>聚焦领域</h3>
                <ul class="focus-list">
                    {focus_areas}
                </ul>
            </div>
        </main>

        <footer class="footer">
            Topic Collector 自动生成 · 数据来源：Twitter/X、Reddit、Product Hunt、Hacker News
        </footer>
    </div>
</body>
</html>'''


def render_html_item(item: dict) -> str:
    """渲染单个热点项为 HTML"""
    title = item.get('title', '无标题')
    url = item.get('url', '#')
    source = item.get('source', '查看原文')
    summary = item.get('summary', '')
    author = item.get('author', '')
    publish_time = item.get('publish_time', '')
    heat = item.get('heat', '')

    meta_parts = []
    if publish_time:
        meta_parts.append(f'<span>{publish_time}</span>')
    if author:
        meta_parts.append(f'<span>{author}</span>')
    if heat:
        meta_parts.append(f'<span>{heat}</span>')

    meta_html = '\n                    '.join(meta_parts) if meta_parts else ''

    summary_html = f'\n                <p class="item-summary">{summary}</p>' if summary else ''

    return f'''            <article class="item">
                <div class="item-title"><a href="{url}" target="_blank">{title}</a></div>
                <div class="item-meta">{meta_html}</div>{summary_html}
                <a href="{url}" class="item-source" target="_blank">{source} &rarr;</a>
            </article>'''


def render_html(hotspots: dict, date_ctx: DateContext) -> str:
    """渲染完整 HTML 页面"""
    display = date_ctx.format_for_display()

    # 渲染各个分类
    sections_html = []
    for key, source in DATA_SOURCES.items():
        items = hotspots.get(key, [])

        section_items = '\n'.join(render_html_item(item) for item in items)
        if not section_items:
            section_items = '<div class="empty-state">暂无内容</div>'

        sections_html.append(f'''            <section class="section">
                <h2 class="section-title"><span class="icon">{source['icon']}</span> {source['name']}</h2>
                {section_items}
            </section>''')

    # 渲染聚焦领域
    focus_html = '\n                    '.join(
        f'<li>{area}</li>' for area in FOCUS_AREAS
    )

    return HTML_TEMPLATE.format(
        short_date=display['short_date'],
        date=display['date'],
        iso_time=display['iso_time'],
        sections='\n\n'.join(sections_html),
        focus_areas=focus_html,
    )


# ============================================================
# 文件输出
# ============================================================

def save_files(markdown: str, html: str, date_ctx: DateContext,
               save_md: bool = False, save_html: bool = False):
    """保存输出文件"""
    display = date_ctx.format_for_display()
    date_str = display['date']

    results = {}

    if save_md:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        md_path = OUTPUT_DIR / f"ai-hotspot-{date_str}.md"
        md_path.write_text(markdown, encoding="utf-8")
        results['markdown'] = str(md_path.absolute())
        print(f"✅ Markdown 文件已保存: {md_path}")

    if save_html:
        HTML_DIR.mkdir(parents=True, exist_ok=True)
        html_path = HTML_DIR / f"ai-hotspot-{date_str}.html"
        html_path.write_text(html, encoding="utf-8")
        results['html'] = str(html_path.absolute())
        print(f"✅ HTML 文件已保存: {html_path}")

    return results


# ============================================================
# 主程序
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="AI热点采集工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python collect.py                    # 显示搜索查询
    python collect.py --output-md        # 生成 Markdown 文件
    python collect.py --output-html      # 生成 HTML 文件
    python collect.py --all              # 生成所有格式
        """
    )

    parser.add_argument(
        "--output-md", "-m",
        action="store_true",
        help="生成 Markdown 文件"
    )

    parser.add_argument(
        "--output-html", "-w",
        action="store_true",
        help="生成 HTML 文件"
    )

    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="生成所有格式文件"
    )

    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="静默模式，仅输出文件路径"
    )

    args = parser.parse_args()

    # 如果指定了 --all，启用所有输出
    if args.all:
        save_md = True
        save_html = True
    else:
        save_md = args.output_md
        save_html = args.output_html

    # 创建日期上下文
    date_ctx = DateContext()

    if not args.quiet:
        print("=" * 60)
        print("🤖 Topic Collector - AI热点采集工具")
        print("=" * 60)
        print(f"⏰ 当前时间: {date_ctx.iso_time}")
        print()

    # 构建搜索查询
    queries = build_search_queries(date_ctx)

    # 如果不需要生成文件，只显示搜索查询
    if not save_md and not save_html:
        print_search_queries(queries)
        print()
        print("💡 提示：使用 WebSearch 工具执行上述搜索，")
        print("   然后将结果整理成热点数据结构。")
        print()
        print("📝 要生成文件，请使用 --output-md 或 --output-html 参数。")
        return

    # 创建空的热点数据结构（待搜索后填充）
    hotspots = {key: [] for key in DATA_SOURCES.keys()}

    # 生成输出
    markdown = render_markdown(hotspots, date_ctx)
    html = render_html(hotspots, date_ctx)

    # 保存文件
    results = save_files(markdown, html, date_ctx, save_md, save_html)

    if args.quiet:
        # 静默模式：只输出文件路径
        if save_md:
            print(results['markdown'])
        if save_html:
            print(results['html'])
    else:
        print()
        print("=" * 60)
        print("📊 采集完成")
        print("=" * 60)
        print()
        print("⚠️ 注意：当前输出为模板格式。")
        print("   请使用 WebSearch 工具执行搜索查询，")
        print("   然后将结果填入热点数据结构。")


if __name__ == "__main__":
    main()
