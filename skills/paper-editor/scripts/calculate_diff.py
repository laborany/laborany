#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
========================================================================
论文 Diff 计算脚本
========================================================================

功能：
    - 计算原文与修改后论文之间的精确差异（智能分词）
    - 生成带 diff 标记的 HTML（del-text/add-text）
    - 内嵌 HTML 模板，无需外部模板文件

核心思路：
    1. 自适应检测文本语言（中文/英文）
    2. 英文使用词级 diff，中文使用字符级 diff
    3. 遍历 diff 操作，生成混合 HTML（包含删除和新增内容）
    4. 将混合文本转换为 Markdown 再转换为 HTML
    5. 使用内嵌模板生成完整 HTML 文件

用法：
    python calculate_diff.py original.txt modified.txt --output result.html

========================================================================
"""

import sys
import json
import argparse
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import List, Tuple, Optional, Dict
from html import escape


# ============================================================
# HTML 模板（内嵌，消除外部文件依赖）
# ============================================================

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{PAPER_TITLE}</title>
    <style>
        /* ============================================================
         * 基础重置与变量
         * ============================================================ */
        :root {
            --primary-color: #2c3e50;
            --accent-color: #3498db;
            --text-color: #333333;
            --text-light: #666666;
            --border-color: #e0e0e0;
            --bg-color: #ffffff;
            --bg-secondary: #f8f9fa;
            --font-serif: "Georgia", "Times New Roman", serif;
            --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            --priority-high: #e74c3c;
            --priority-medium: #f39c12;
            --priority-low: #3498db;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html {
            font-size: 16px;
            scroll-behavior: smooth;
        }

        /* ============================================================
         * 布局容器
         * ============================================================ */
        body {
            font-family: var(--font-serif);
            line-height: 1.8;
            color: var(--text-color);
            background: var(--bg-secondary);
        }

        .paper-container {
            max-width: 850px;
            margin: 0 auto;
            padding: 40px 30px;
            background: var(--bg-color);
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.05);
        }

        /* ============================================================
         * 标题样式
         * ============================================================ */
        .paper-title {
            font-family: var(--font-sans);
            font-size: 2.2rem;
            font-weight: 700;
            color: var(--primary-color);
            text-align: center;
            margin: 0 0 15px 0;
            line-height: 1.4;
        }

        .paper-meta {
            font-family: var(--font-sans);
            font-size: 0.95rem;
            color: var(--text-light);
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--border-color);
        }

        /* ============================================================
         * 章节标题
         * ============================================================ */
        .section {
            margin-top: 35px;
        }

        .section-title {
            font-family: var(--font-sans);
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--primary-color);
            margin: 0 0 20px 0;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border-color);
        }

        .subsection-title {
            font-family: var(--font-sans);
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--primary-color);
            margin: 25px 0 15px 0;
        }

        .sub-subsection-title {
            font-family: var(--font-sans);
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-color);
            margin: 20px 0 12px 0;
        }

        /* ============================================================
         * 段落与文本
         * ============================================================ */
        .paragraph {
            margin-bottom: 18px;
            text-align: justify;
            text-indent: 2em;
        }

        .paragraph.no-indent {
            text-indent: 0;
        }

        .abstract-text {
            background: var(--bg-secondary);
            padding: 20px 25px;
            border-left: 4px solid var(--accent-color);
            margin-bottom: 30px;
            font-size: 0.95rem;
            line-height: 1.7;
        }

        /* ============================================================
         * 列表
         * ============================================================ */
        .list {
            margin: 15px 0 15px 30px;
        }

        .list li {
            margin-bottom: 8px;
        }

        .list-ordered {
            list-style-type: decimal;
        }

        .list-unordered {
            list-style-type: disc;
        }

        /* ============================================================
         * 表格
         * ============================================================ */
        .table-wrapper {
            margin: 25px 0;
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--font-sans);
            font-size: 0.9rem;
        }

        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }

        th {
            background: var(--bg-secondary);
            font-weight: 600;
            color: var(--primary-color);
        }

        tr:hover {
            background: rgba(52, 152, 219, 0.05);
        }

        /* ============================================================
         * 公式
         * ============================================================ */
        .formula {
            font-family: "Times New Roman", serif;
            text-align: center;
            margin: 25px 0;
            font-size: 1.1rem;
            padding: 15px;
            background: var(--bg-secondary);
            border-radius: 4px;
        }

        .inline-formula {
            font-family: "Times New Roman", serif;
            font-style: italic;
        }

        /* ============================================================
         * 代码块
         * ============================================================ */
        .code-block {
            background: #f4f4f4;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
            border-left: 3px solid var(--accent-color);
            font-family: "Courier New", monospace;
            font-size: 0.85rem;
            overflow-x: auto;
        }

        /* ============================================================
         * 修改意见区域
         * ============================================================ */
        .review-notes {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px 25px;
            border-radius: 12px;
            margin-bottom: 35px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }

        .review-title {
            font-family: var(--font-sans);
            font-size: 1.4rem;
            font-weight: 700;
            color: white;
            margin: 0 0 20px 0;
            text-align: center;
            padding-bottom: 15px;
            border-bottom: 2px solid rgba(255, 255, 255, 0.3);
        }

        .review-section {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            padding: 15px 20px;
            margin-bottom: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .review-section.priority-high {
            border-left: 5px solid var(--priority-high);
        }

        .review-section.priority-medium {
            border-left: 5px solid var(--priority-medium);
        }

        .review-section.priority-low {
            border-left: 5px solid var(--priority-low);
        }

        .priority-heading {
            font-family: var(--font-sans);
            font-size: 0.95rem;
            font-weight: 700;
            margin: 0 0 10px 0;
            color: var(--primary-color);
        }

        .review-section.priority-high .priority-heading {
            color: var(--priority-high);
        }

        .review-section.priority-medium .priority-heading {
            color: var(--priority-medium);
        }

        .review-section.priority-low .priority-heading {
            color: var(--priority-low);
        }

        .review-note {
            font-family: var(--font-sans);
            font-size: 0.9rem;
            line-height: 1.6;
            margin-bottom: 10px;
            color: var(--text-color);
        }

        .review-note:last-child {
            margin-bottom: 0;
        }

        .note-id {
            font-weight: 700;
            color: var(--primary-color);
            margin-right: 6px;
        }

        .note-content {
            color: var(--text-color);
        }

        .note-location {
            display: block;
            font-size: 0.8rem;
            color: var(--text-light);
            margin-top: 4px;
            padding-left: 26px;
        }

        /* ============================================================
         * 引用
         * ============================================================ */
        .citation {
            font-size: 0.8rem;
            color: var(--accent-color);
            vertical-align: super;
        }

        .reference-section {
            margin-top: 40px;
        }

        .reference-item {
            margin-bottom: 10px;
            font-size: 0.9rem;
            text-indent: -2em;
            padding-left: 2em;
        }

        /* ============================================================
         * 响应式设计
         * ============================================================ */
        @media (max-width: 768px) {
            .paper-container {
                padding: 20px 15px;
            }

            .paper-title {
                font-size: 1.6rem;
            }

            .section-title {
                font-size: 1.3rem;
            }

            .abstract-text {
                padding: 15px;
            }

            .review-notes {
                padding: 20px 15px;
            }

            .review-title {
                font-size: 1.2rem;
            }

            .review-section {
                padding: 12px 15px;
            }

            .diff-toggle button {
                padding: 6px 14px;
                font-size: 0.75rem;
            }
        }

        /* ============================================================
         * Diff/修改痕迹样式
         * ============================================================ */
        .diff-toggle-container {
            position: sticky;
            top: 10px;
            z-index: 100;
            text-align: center;
            margin: 10px 0 20px 0;
        }

        .diff-toggle {
            display: inline-flex;
            background: white;
            border-radius: 25px;
            padding: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            font-family: var(--font-sans);
            font-size: 0.85rem;
        }

        .diff-toggle button {
            padding: 8px 20px;
            border: none;
            background: transparent;
            color: var(--text-light);
            cursor: pointer;
            border-radius: 20px;
            transition: all 0.2s ease;
            font-weight: 500;
        }

        .diff-toggle button:hover {
            background: rgba(52, 152, 219, 0.1);
        }

        .diff-toggle button.active {
            background: var(--accent-color);
            color: white;
        }

        /* Diff 样式控制 - 默认隐藏 */
        .del-text {
            display: none;
            text-decoration: line-through;
            color: #e74c3c;
            opacity: 0.6;
        }

        .add-text {
            display: none;
            background: rgba(46, 204, 113, 0.2);
            padding: 2px 4px;
            border-radius: 2px;
            color: #27ae60;
        }

        /* Diff 模式激活时显示 */
        body.show-diff .del-text,
        body.show-changes .del-text {
            display: inline;
        }

        body.show-diff .add-text,
        body.show-changes .add-text {
            display: inline;
        }

        /* ============================================================
         * 打印样式
         * ============================================================ */
        @media print {
            body {
                background: white;
            }

            .paper-container {
                box-shadow: none;
                padding: 0;
            }

            .section-title {
                page-break-before: auto;
            }

            .diff-toggle-container {
                display: none;
            }

            .review-notes {
                background: none !important;
                border: 1px solid var(--border-color) !important;
                padding: 15px !important;
            }

            .review-title {
                color: var(--primary-color) !important;
                border-bottom: 1px solid var(--border-color) !important;
            }
        }
    </style>
</head>
<body>
    <div class="paper-container">
        <!-- Diff 切换开关 -->
        <div class="diff-toggle-container">
            <div class="diff-toggle">
                <button id="btn-clean" class="active" onclick="setDiffMode(\'clean\')">纯净版</button>
                <button id="btn-changes" onclick="setDiffMode(\'changes\')">修改痕迹</button>
                <button id="btn-diff" onclick="setDiffMode(\'diff\')">完整 Diff</button>
            </div>
        </div>
        <!-- 修改意见区域 -->
        {REVIEW_NOTES}
        <!-- 论文内容 -->
        {PAPER_CONTENT}
    </div>

    <script>
        function setDiffMode(mode) {
            document.body.classList.remove(\'show-diff\', \'show-changes\');
            document.querySelectorAll(\'.diff-toggle button\').forEach(btn => btn.classList.remove(\'active\'));

            if (mode === \'diff\') {
                document.body.classList.add(\'show-diff\');
                document.getElementById(\'btn-diff\').classList.add(\'active\');
            } else if (mode === \'changes\') {
                document.body.classList.add(\'show-changes\');
                document.getElementById(\'btn-changes\').classList.add(\'active\');
            } else {
                document.getElementById(\'btn-clean\').classList.add(\'active\');
            }
        }
    </script>
</body>
</html>'''

# ============================================================
# Diff 计算核心类
# ============================================================

class DiffCalculator:
    """
    Diff 计算器（智能分词版）

    核心思路：
        1. 自适应检测语言类型（中文/英文）
        2. 英文使用词级 diff，中文使用字符级 diff
        3. 生成混合文本，包含删除和新增标记
        4. 转换为 HTML
    """

    def __init__(self):
        pass

    def compute_diff(self, original: str, modified: str) -> Tuple[str, Dict]:
        """
        计算两个 Markdown 文本之间的 diff，输出带标记的 HTML
        """
        # ============================================================
        # 步骤 1：计算智能 diff（英文词级，中文字符级）
        # ============================================================
        diff_ops = self._compute_token_diff(original, modified)

        # ============================================================
        # 步骤 2：生成混合文本（带 diff 标记）
        # ============================================================
        mixed_text = self._generate_mixed_text(original, modified, diff_ops)

        # ============================================================
        # 步骤 3：转换混合文本为 HTML
        # ============================================================
        html = self._convert_mixed_to_html(mixed_text)

        # ============================================================
        # 步骤 4：统计
        # ============================================================
        stats = self._count_diffs(mixed_text)

        return html, stats

    # ============================================================
    # 语言检测与分词
    # ============================================================

    def _is_english_text(self, text: str) -> bool:
        """
        检测文本是否以英文为主

        规则：ASCII 字母占比超过 40% 判定为英文文本
        """
        if not text:
            return False
        total_chars = len(text)
        ascii_letters = sum(1 for c in text if c.isalpha() and ord(c) < 128)
        return ascii_letters / max(total_chars, 1) > 0.4

    def _tokenize_for_diff(self, text: str, is_english: bool) -> List[str]:
        """
        根据语言类型进行分词

        英文：单词独立为 token，每个空格和标点作为独立 token
        中文：单字符为 token

        设计理念：
            - 英文单词是语义单位，应整体比较
            - 单个空格/标点作为独立 token，确保单词边界清晰
            - 使用单词+空格交替的模式，让 diff 算法在单词级别工作
        """
        if is_english:
            # 英文分词策略：单词为token，保留原始空格和标点
            # 正则说明：
            #   [a-zA-Z0-9']+      - 单词（包含字母、数字、撇号如 don't）
            #   [^a-zA-Z0-9']      - 非单词字符（空格、标点等），每个单独一个 token
            tokens = re.findall(r"[a-zA-Z0-9']+|[^a-zA-Z0-9']", text)
            return tokens
        else:
            # 中文单字符作为 token
            return list(text)

    def _reconstruct_from_tokens(self, tokens: List[str]) -> str:
        """从 token 列表重建原始字符串"""
        return ''.join(tokens)

    def _compute_token_diff(self, original: str, modified: str) -> List[Dict]:
        """
        智能 diff：英文词级，中文字符级

        核心思路：
            1. 检测文本语言类型
            2. 根据语言选择合适的粒度进行 token 化
            3. 在 token 级别进行 diff
            4. 将 token 级别的操作映射回原始字符串
        """
        # 检测语言类型（以原文为准）
        is_english = self._is_english_text(original)

        # 分词
        orig_tokens = self._tokenize_for_diff(original, is_english)
        mod_tokens = self._tokenize_for_diff(modified, is_english)

        # token 级 diff
        ops = []
        matcher = SequenceMatcher(None, orig_tokens, mod_tokens, autojunk=False)

        # 用于计算原始字符串中的位置
        orig_pos = 0
        mod_pos = 0

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            # 计算原始字符串中的实际位置
            orig_start = sum(len(t) for t in orig_tokens[:i1])
            orig_end = sum(len(t) for t in orig_tokens[:i2])
            mod_start = sum(len(t) for t in mod_tokens[:j1])
            mod_end = sum(len(t) for t in mod_tokens[:j2])

            ops.append({
                'type': tag,
                'orig_start': orig_start,
                'orig_end': orig_end,
                'mod_start': mod_start,
                'mod_end': mod_end,
                'orig_text': original[orig_start:orig_end],
                'mod_text': modified[mod_start:mod_end]
            })

        return ops

    def _has_substantial_content(self, text: str) -> bool:
        """
        检查文本是否有实质内容（排除纯空白和纯标点）

        纯标点或空白不生成 diff 标记，避免产生无意义的花括号
        """
        if not text or text.isspace():
            return False

        # 检查是否包含至少一个非标点字符
        # 标点包括：中英文标点、空格、换行、Markdown 符号等
        punctuation = '，。、；：？！""''（）【】《》·—…\n\r\t ,.;:!?"\'()-[]{}<>*_`~#^'
        stripped = text.strip(punctuation + ' ')

        return len(stripped) > 0

    def _generate_mixed_text(self, original: str, modified: str, diff_ops: List[Dict]) -> str:
        """
        生成混合文本，包含 diff 标记

        标记格式：
            {{DEL:删除的内容}}
            {{ADD:新增的内容}}

        注意：只有包含实质内容（非纯标点/空白）的 diff 才会生成标记
        """
        result = []

        for op in diff_ops:
            if op['type'] == 'equal':
                # 相同部分直接添加
                result.append(op['mod_text'])
            elif op['type'] == 'delete':
                # 删除的内容用特殊标记包裹（仅限有实质内容的）
                deleted = op['orig_text']
                if self._has_substantial_content(deleted):
                    result.append('{{DEL:' + deleted + '}}')
            elif op['type'] == 'insert':
                # 插入的内容用特殊标记包裹（仅限有实质内容的）
                inserted = op['mod_text']
                if self._has_substantial_content(inserted):
                    result.append('{{ADD:' + inserted + '}}')
            elif op['type'] == 'replace':
                # 替换 = 删除 + 插入
                deleted = op['orig_text']
                inserted = op['mod_text']
                if self._has_substantial_content(deleted):
                    result.append('{{DEL:' + deleted + '}}')
                if self._has_substantial_content(inserted):
                    result.append('{{ADD:' + inserted + '}}')

        return ''.join(result)

    def _convert_mixed_to_html(self, mixed_text: str) -> str:
        """
        将混合文本转换为 HTML

        处理流程：
            1. 按行分割
            2. 对每行：
               - 处理 Markdown 标记
               - 处理 diff 标记（{{DEL:...}} 和 {{ADD:...}}）
               - 生成 HTML
        """
        lines = mixed_text.split('\n')

        html_parts = ['<div class="paper-content">']

        in_abstract = False
        in_meta = False
        in_references = False
        in_code = False

        for line in lines:
            line = line.rstrip()

            # 空行
            if not line:
                continue

            # ====================================================
            # 标题处理
            # ====================================================
            if line.startswith('#### '):
                # 四级标题（用于编号的小节）
                content = self._process_diff_markers(line[5:])
                html_parts.append(f'<h4 class="sub-subsection-title">{content}</h4>')
                continue
            elif line.startswith('### '):
                content = self._process_diff_markers(line[4:])
                html_parts.append(f'<h3 class="subsection-title">{content}</h3>')
                continue
            elif line.startswith('## '):
                content = self._process_diff_markers(line[3:])
                html_parts.append(f'<h2 class="section-title">{content}</h2>')
                continue
            elif line.startswith('# '):
                content = self._process_diff_markers(line[2:])
                html_parts.append(f'<h1 class="paper-title">{content}</h1>')
                continue

            # ====================================================
            # 元信息
            # ====================================================
            if line.startswith('**作者**') or line.startswith('**日期**'):
                if not in_meta:
                    in_meta = True
                    content = line.replace('**作者**', '<strong>作者</strong>')
                    content = content.replace('**日期**', '<strong>日期</strong>')
                    html_parts.append(f'<div class="paper-meta"><p>{content}</p>')
                else:
                    content = line.replace('**日期**', '<strong>日期</strong>')
                    html_parts.append(f'<p>{content}</p></div>')
                continue

            # ====================================================
            # 摘要
            # ====================================================
            if '**摘要**' in line:
                in_abstract = True
                # 提取摘要内容部分
                abstract_content = line.replace('**摘要**：', '').replace('**摘要**', '')
                if abstract_content:
                    content = self._process_diff_markers(abstract_content)
                    html_parts.append('<div class="abstract-text"><strong>摘要</strong>')
                    html_parts.append(f'<p class="paragraph no-indent">{content}</p>')
                else:
                    html_parts.append('<div class="abstract-text"><strong>摘要</strong>')
                continue

            # 摘要结束
            if in_abstract and line.startswith('#'):
                in_abstract = False
                # 继续处理当前行作为标题

            # ====================================================
            # 参考文献
            # ====================================================
            if '参考文献' in line and line.startswith('##'):
                in_references = True
                html_parts.append('<div class="reference-section">')
                html_parts.append('<h2 class="section-title">参考文献</h2>')
                continue

            if in_references and line.startswith('['):
                html_parts.append(f'<div class="reference-item">{self._escape_html(line)}</div>')
                continue

            # ====================================================
            # 代码块
            # ====================================================
            if line.startswith('```'):
                if not in_code:
                    in_code = True
                    html_parts.append('<div class="code-block"><code>')
                else:
                    in_code = False
                    html_parts.append('</code></div>')
                continue

            if in_code:
                html_parts.append(self._escape_html(line) + '\n')
                continue

            # ====================================================
            # 列表
            # ====================================================
            stripped = line.strip()
            if stripped.startswith(('- ', '* ', '• ')) or re.match(r'^\d+\.', stripped):
                content = self._process_diff_markers(line)
                html_parts.append(f'<p class="paragraph">{content}</p>')
                continue

            # ====================================================
            # 普通段落
            # ====================================================
            para_class = 'no-indent' if in_abstract else 'paragraph'
            content = self._process_diff_markers(line)
            html_parts.append(f'<p class="{para_class}">{content}</p>')

        html_parts.append('</div>')
        return '\n'.join(html_parts)

    def _process_diff_markers(self, text: str) -> str:
        """
        处理文本中的 diff 标记，转换为 HTML span

        标记格式：
            {{DEL:内容}} -> <span class="del-text">内容</span>
            {{ADD:内容}} -> <span class="add-text">内容</span>

        改进：使用正则表达式一次性匹配，避免字符级遍历导致的问题
        """

        # ============================================================
        # 先处理 DEL，再处理 ADD（避免嵌套问题）
        # ============================================================
        # 使用更健壮的正则：匹配从标记开始到对应结束为止
        # 避免非贪婪匹配在嵌套花括号时出错

        def process_del(match):
            """处理删除标记"""
            content = match.group(1)  # DEL: 后面的内容
            if not content or content.isspace():
                return ''
            content = self._process_inline_markdown(content)
            return f'<span class="del-text">{content}</span>'

        def process_add(match):
            """处理新增标记"""
            content = match.group(1)  # ADD: 后面的内容
            if not content or content.isspace():
                return ''
            content = self._process_inline_markdown(content)
            return f'<span class="add-text">{content}</span>'

        # 先处理 DEL（使用非贪婪但排除嵌套的方案）
        text = re.sub(r'\{\{DEL:(.+?)\}\}', process_del, text, flags=re.DOTALL)
        # 再处理 ADD
        text = re.sub(r'\{\{ADD:(.+?)\}\}', process_add, text, flags=re.DOTALL)

        # ============================================================
        # 清理残留标记（防御性处理）
        # ============================================================
        # 移除未闭合的标记开头
        text = re.sub(r'\{\{DEL:[^{}]*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'\{\{ADD:[^{}]*$', '', text, flags=re.MULTILINE)
        # 移除残留的标记开头（如果有的话）
        text = re.sub(r'\{\{(DEL|ADD):', '', text)

        return text

    def _process_inline_markdown(self, text: str) -> str:
        """
        处理行内 Markdown 格式（粗体、斜体等）

        注意：这里的文本已经被 escape 过，所以需要处理的是转义后的内容
        """
        # 处理粗体 **text** 或 __text__
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'__(.+?)__', r'<strong>\1</strong>', text)

        # 处理斜体 *text* 或 _text_
        text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<em>\1</em>', text)
        text = re.sub(r'(?<!_)_(?!_)(.+?)(?<!_)_(?!_)', r'<em>\1</em>', text)

        return text

    def _count_diffs(self, mixed_text: str) -> Dict:
        """统计 diff 数量"""
        del_count = mixed_text.count('{{DEL:')
        add_count = mixed_text.count('{{ADD:')
        return {'added': add_count, 'deleted': del_count, 'unchanged': 0}

    @staticmethod
    def _escape_html(text: str) -> str:
        """转义 HTML 特殊字符"""
        return escape(text, quote=False)


# ============================================================
# 修改意见转换器
# ============================================================

class ReviewNotesConverter:
    """修改意见转 HTML"""

    @staticmethod
    def convert_to_html(notes_data: Optional[Dict] = None) -> str:
        """将修改意见转换为 HTML"""
        if not notes_data:
            return ''

        html_parts = [
            '<div class="review-notes">',
            '    <h2 class="review-title">论文修改意见</h2>'
        ]

        for priority in ['high', 'medium', 'low']:
            if priority in notes_data and notes_data[priority]:
                label = {'high': '高', 'medium': '中', 'low': '低'}[priority]
                html_parts.append(f'    <div class="review-section priority-{priority}">')
                html_parts.append(f'        <h3 class="priority-heading">【优先级：{label}】</h3>')
                for note in notes_data[priority]:
                    html_parts.extend(ReviewNotesConverter._format_note(note))
                html_parts.append('    </div>')

        html_parts.append('</div>')
        return '\n'.join(html_parts)

    @staticmethod
    def _format_note(note: Dict) -> List[str]:
        """格式化单条修改意见"""
        problem = note.get('problem', '')
        suggestion = note.get('suggestion', '')
        location = note.get('location', '')
        note_id = note.get('id', 0)

        return [
            f'        <div class="review-note">',
            f'            <span class="note-id">{note_id}.</span>',
            f'            <span class="note-content">{problem} → {suggestion}</span>',
            f'            <span class="note-location">位置：{location}</span>',
            f'        </div>'
        ]


# ============================================================
# 主函数
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='计算论文 diff 并生成带标记的 HTML')
    parser.add_argument('original', help='原文文件路径')
    parser.add_argument('modified', help='修改后的文件路径')
    parser.add_argument('--notes', help='修改意见 JSON 文件路径（可选）')
    parser.add_argument('--output', help='输出 HTML 文件路径（必需）')

    args = parser.parse_args()

    # ============================================================
    # 参数校验
    # ============================================================
    if not args.output:
        print("错误：必须指定 --output 参数", file=sys.stderr)
        parser.print_help()
        sys.exit(1)

    # 读取原文和修改后的文本
    original = Path(args.original).read_text(encoding='utf-8')
    modified = Path(args.modified).read_text(encoding='utf-8')

    # ============================================================
    # 计算 diff
    # ============================================================
    calculator = DiffCalculator()
    paper_html, stats = calculator.compute_diff(original, modified)

    # 读取并处理修改意见
    review_html = ''
    if args.notes:
        notes_data = json.loads(Path(args.notes).read_text(encoding='utf-8'))
        review_html = ReviewNotesConverter.convert_to_html(notes_data)

    # ============================================================
    # 使用内嵌模板生成 HTML
    # ============================================================
    html = HTML_TEMPLATE.replace('{REVIEW_NOTES}', review_html)
    html = html.replace('{PAPER_CONTENT}', paper_html)

    # 提取论文标题
    title_match = re.search(r'<h1 class="paper-title">([^<]+)</h1>', paper_html)
    if title_match:
        title = title_match.group(1)
    else:
        title = '论文修改结果'
    html = html.replace('{PAPER_TITLE}', title)

    # ============================================================
    # 输出结果
    # ============================================================
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding='utf-8')

    print(f"✅ 已生成 HTML 文件：{output_path.absolute()}")
    print(f"📊 修改统计：")
    print(f"   - 删除：{stats['deleted']} 处")
    print(f"   - 新增：{stats['added']} 处")


if __name__ == '__main__':
    main()
