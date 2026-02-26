#!/usr/bin/env python3
"""
# ============================================================
#  scripts/package_skill.py
#  打包 skill 为可分发的 .skill 文件（zip 格式）
# ============================================================
"""

import sys
import zipfile
from pathlib import Path

from .utils import parse_skill_md


# ────────────────────────────────────────────────────────────
#  验证
# ────────────────────────────────────────────────────────────

def validate_skill(skill_path):
    """基础验证：frontmatter 必须包含 name 和 description"""
    try:
        fm, _ = parse_skill_md(skill_path)
    except FileNotFoundError:
        return False, "SKILL.md not found"

    if "name" not in fm:
        return False, "Missing 'name' in frontmatter"
    if "description" not in fm:
        return False, "Missing 'description' in frontmatter"

    name = str(fm["name"]).strip()
    if len(name) > 64:
        return False, f"Name too long ({len(name)} chars, max 64)"

    desc = str(fm["description"]).strip()
    if len(desc) > 1024:
        return False, f"Description too long ({len(desc)} chars, max 1024)"

    return True, "Skill is valid"


# ────────────────────────────────────────────────────────────
#  打包
# ────────────────────────────────────────────────────────────

SKIP_PATTERNS = {"__pycache__", ".pyc", "eval/runs"}


def should_skip(path):
    """跳过缓存和运行数据"""
    return any(p in str(path) for p in SKIP_PATTERNS)


def package_skill(skill_path, output_dir=None):
    """打包 skill 目录为 .skill 文件"""
    skill_path = Path(skill_path).resolve()

    if not skill_path.is_dir():
        print(f"Error: not a directory: {skill_path}")
        return None

    # 验证
    valid, msg = validate_skill(skill_path)
    if not valid:
        print(f"Validation failed: {msg}")
        return None
    print(f"Validated: {msg}")

    # 输出路径
    skill_name = skill_path.name
    out_dir = Path(output_dir).resolve() if output_dir else Path.cwd()
    out_dir.mkdir(parents=True, exist_ok=True)
    skill_file = out_dir / f"{skill_name}.skill"

    # 创建 zip
    with zipfile.ZipFile(skill_file, "w", zipfile.ZIP_DEFLATED) as zf:
        for fp in skill_path.rglob("*"):
            if fp.is_file() and not should_skip(fp):
                arcname = fp.relative_to(skill_path.parent)
                zf.write(fp, arcname)
                print(f"  Added: {arcname}")

    print(f"\nPackaged: {skill_file}")
    return skill_file


# ────────────────────────────────────────────────────────────
#  CLI 入口
# ────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: package_skill.py <path/to/skill-folder> [output-dir]")
        sys.exit(1)

    skill_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    result = package_skill(skill_path, output_dir)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
