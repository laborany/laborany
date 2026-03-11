#!/usr/bin/env python3
"""
Report Generator
Generates Markdown and HTML reports from filtered RSS items.
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict
from collections import defaultdict

def generate_markdown(items: List[Dict], metadata: Dict) -> str:
    """Generate Markdown report."""
    md = []

    # Header
    date_str = datetime.now().strftime('%Y-%m-%d')
    md.append(f"# 优质资讯 - {date_str}\n")

    # Overview
    md.append("## 📊 概览\n")
    md.append(f"- 总计：{metadata['total_items']} 条资讯")

    sources = set(item['source'] for item in items)
    md.append(f"- 来源：{len(sources)} 个")

    if metadata.get('query'):
        md.append(f"- 查询条件：{metadata['query']}")

    md.append(f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Group by category
    by_category = defaultdict(list)
    for item in items:
        by_category[item['category']].append(item)

    # Category icons
    category_icons = {
        'AI/ML': '🤖',
        'Software Development': '💻',
        'Security': '🔒',
        'System Architecture': '🏗️',
        'Web Development': '🌐',
        'DevOps': '⚙️',
        'Database': '🗄️',
        'Startup/Business': '🚀',
        'Other': '📄'
    }

    # Output by category
    for category in sorted(by_category.keys()):
        icon = category_icons.get(category, '📄')
        md.append(f"## {icon} {category}\n")

        for item in by_category[category]:
            md.append(f"### [{item['title']}]({item['link']})")

            # Metadata line
            meta_parts = [
                f"**来源**: {item['source']}",
                f"**质量**: {item['quality_score']:.0f}/100"
            ]

            if item['published']:
                try:
                    pub_date = datetime.fromisoformat(item['published'].replace('Z', '+00:00'))
                    time_ago = format_time_ago(pub_date)
                    meta_parts.insert(1, f"**时间**: {time_ago}")
                except:
                    pass

            md.append(' | '.join(meta_parts) + '\n')

            # Summary
            if item['summary']:
                summary = item['summary'].strip()[:300]
                md.append(f"{summary}...\n")

            md.append("---\n")

    return '\n'.join(md)

def format_time_ago(dt: datetime) -> str:
    """Format datetime as relative time."""
    now = datetime.now(dt.tzinfo)
    delta = now - dt

    hours = delta.total_seconds() / 3600
    if hours < 1:
        return f"{int(delta.total_seconds() / 60)} 分钟前"
    elif hours < 24:
        return f"{int(hours)} 小时前"
    else:
        days = int(hours / 24)
        return f"{days} 天前"

def generate_html(items: List[Dict], metadata: Dict) -> str:
    """Generate HTML report with Linear style."""
    date_str = datetime.now().strftime('%Y-%m-%d')

    # Group by category
    by_category = defaultdict(list)
    for item in items:
        by_category[item['category']].append(item)

    # Category icons
    category_icons = {
        'AI/ML': '🤖',
        'Software Development': '💻',
        'Security': '🔒',
        'System Architecture': '🏗️',
        'Web Development': '🌐',
        'DevOps': '⚙️',
        'Database': '🗄️',
        'Startup/Business': '🚀',
        'Other': '📄'
    }

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>优质资讯 - {date_str}</title>
    <style>
        :root {{
            --bg-primary: #f7f8f9;
            --bg-secondary: #ffffff;
            --text-primary: #16171a;
            --text-secondary: #6e7781;
            --border-color: #e6e8eb;
            --accent-blue: #5e6ad2;
            --accent-purple: #8b5cf6;
            --shadow: 0 1px 3px rgba(0,0,0,0.08);
            --shadow-hover: 0 4px 12px rgba(0,0,0,0.12);
        }}

        @media (prefers-color-scheme: dark) {{
            :root {{
                --bg-primary: #16171a;
                --bg-secondary: #1f2023;
                --text-primary: #e6e8eb;
                --text-secondary: #9ca3af;
                --border-color: #2d2f33;
            }}
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro', sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 2rem 1rem;
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}

        header {{
            margin-bottom: 3rem;
        }}

        h1 {{
            font-size: 2.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: var(--text-primary);
        }}

        .meta {{
            display: flex;
            gap: 2rem;
            flex-wrap: wrap;
            color: var(--text-secondary);
            font-size: 0.95rem;
        }}

        .meta-item {{
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }}

        .category-section {{
            margin-bottom: 3rem;
        }}

        .category-title {{
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }}

        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
            gap: 1.5rem;
        }}

        .card {{
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: var(--shadow);
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }}

        .card::before {{
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: var(--accent-blue);
            opacity: 0;
            transition: opacity 0.2s ease;
        }}

        .card:hover {{
            transform: translateY(-2px);
            box-shadow: var(--shadow-hover);
        }}

        .card:hover::before {{
            opacity: 1;
        }}

        .card-title {{
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
            line-height: 1.4;
        }}

        .card-title a {{
            color: var(--text-primary);
            text-decoration: none;
        }}

        .card-title a:hover {{
            color: var(--accent-blue);
        }}

        .card-meta {{
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 0.75rem;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }}

        .card-meta span {{
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }}

        .quality-badge {{
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
        }}

        .quality-high {{
            background: #dcfce7;
            color: #166534;
        }}

        .quality-medium {{
            background: #fef3c7;
            color: #92400e;
        }}

        .quality-low {{
            background: #fee2e2;
            color: #991b1b;
        }}

        @media (prefers-color-scheme: dark) {{
            .quality-high {{
                background: #166534;
                color: #dcfce7;
            }}
            .quality-medium {{
                background: #92400e;
                color: #fef3c7;
            }}
            .quality-low {{
                background: #991b1b;
                color: #fee2e2;
            }}
        }}

        .card-summary {{
            color: var(--text-secondary);
            font-size: 0.95rem;
            line-height: 1.6;
        }}

        @media (max-width: 768px) {{
            .grid {{
                grid-template-columns: 1fr;
            }}

            h1 {{
                font-size: 2rem;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📰 优质资讯 - {date_str}</h1>
            <div class="meta">
                <div class="meta-item">
                    <span>📊</span>
                    <span>总计 {metadata['total_items']} 条资讯</span>
                </div>
                <div class="meta-item">
                    <span>🌐</span>
                    <span>{len(set(item['source'] for item in items))} 个来源</span>
                </div>"""

    if metadata.get('query'):
        html += f"""
                <div class="meta-item">
                    <span>🔍</span>
                    <span>查询: {metadata['query']}</span>
                </div>"""

    html += """
            </div>
        </header>

        <main>
"""

    # Output by category
    for category in sorted(by_category.keys()):
        icon = category_icons.get(category, '📄')
        html += f"""
            <section class="category-section">
                <h2 class="category-title">{icon} {category}</h2>
                <div class="grid">
"""

        for item in by_category[category]:
            quality_class = 'quality-high' if item['quality_score'] >= 80 else \
                           'quality-medium' if item['quality_score'] >= 60 else 'quality-low'

            time_str = ''
            if item['published']:
                try:
                    pub_date = datetime.fromisoformat(item['published'].replace('Z', '+00:00'))
                    time_str = format_time_ago(pub_date)
                except:
                    pass

            summary = item['summary'].strip()[:200] if item['summary'] else ''

            html += f"""
                    <article class="card">
                        <h3 class="card-title">
                            <a href="{item['link']}" target="_blank" rel="noopener">{item['title']}</a>
                        </h3>
                        <div class="card-meta">
                            <span>🔗 {item['source']}</span>"""

            if time_str:
                html += f"""
                            <span>⏰ {time_str}</span>"""

            html += f"""
                            <span class="quality-badge {quality_class}">{item['quality_score']:.0f}/100</span>
                        </div>"""

            if summary:
                html += f"""
                        <p class="card-summary">{summary}...</p>"""

            html += """
                    </article>
"""

        html += """
                </div>
            </section>
"""

    html += """
        </main>
    </div>
</body>
</html>
"""

    return html

def main():
    parser = argparse.ArgumentParser(description='Generate Markdown and HTML reports')
    parser.add_argument('--input', type=str, required=True, help='Input JSON file from filter_content.py')
    parser.add_argument('--output-dir', type=str, default='docs/news', help='Output directory')
    parser.add_argument('--format', type=str, choices=['md', 'html', 'both'], default='both',
                       help='Output format')
    args = parser.parse_args()

    # Load input
    with open(args.input, 'r', encoding='utf-8') as f:
        data = json.load(f)

    items = data['items']
    metadata = {k: v for k, v in data.items() if k != 'items'}

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime('%Y-%m-%d')

    # Generate Markdown
    if args.format in ['md', 'both']:
        md_content = generate_markdown(items, metadata)
        md_path = output_dir / f'rss-news-{date_str}.md'
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
        print(f"✓ Markdown saved to {md_path}")

    # Generate HTML
    if args.format in ['html', 'both']:
        html_content = generate_html(items, metadata)
        html_path = output_dir / f'rss-news-{date_str}.html'
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✓ HTML saved to {html_path}")

if __name__ == '__main__':
    main()
