#!/usr/bin/env python3
"""
# ============================================================
#  scripts/utils.py
#  共享工具函数 — 解析 SKILL.md frontmatter 和 body
# ============================================================
"""

import re
import yaml
from pathlib import Path


# ────────────────────────────────────────────────────────────
#  SKILL.md 解析
# ────────────────────────────────────────────────────────────

def parse_skill_md(skill_path):
    """
    解析 SKILL.md，返回 (frontmatter_dict, body_str)。
    skill_path 可以是 skill 目录或 SKILL.md 文件本身。
    """
    skill_path = Path(skill_path)
    skill_md = skill_path / "SKILL.md" if skill_path.is_dir() else skill_path

    if not skill_md.exists():
        raise FileNotFoundError(f"SKILL.md not found: {skill_md}")

    content = skill_md.read_text(encoding="utf-8")
    return _split_frontmatter(content)


def _split_frontmatter(content):
    """将 '---\\n...\\n---\\n...' 拆分为 (dict, str)"""
    match = re.match(r"^---\n(.*?)\n---\n?(.*)", content, re.DOTALL)
    if not match:
        return {}, content

    frontmatter = yaml.safe_load(match.group(1)) or {}
    body = match.group(2)
    return frontmatter, body


# ────────────────────────────────────────────────────────────
#  SKILL.md 写回
# ────────────────────────────────────────────────────────────

def write_skill_md(skill_path, frontmatter, body):
    """将 frontmatter + body 写回 SKILL.md"""
    skill_path = Path(skill_path)
    skill_md = skill_path / "SKILL.md" if skill_path.is_dir() else skill_path

    fm_str = yaml.dump(frontmatter, allow_unicode=True, default_flow_style=False).strip()
    content = f"---\n{fm_str}\n---\n\n{body}"
    skill_md.write_text(content, encoding="utf-8")


# ────────────────────────────────────────────────────────────
#  辅助函数
# ────────────────────────────────────────────────────────────

def ensure_eval_dir(skill_path):
    """确保 eval/ 目录存在，返回 Path"""
    eval_dir = Path(skill_path) / "eval"
    eval_dir.mkdir(parents=True, exist_ok=True)
    return eval_dir
