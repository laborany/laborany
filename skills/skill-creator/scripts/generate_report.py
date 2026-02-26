#!/usr/bin/env python3
"""
# ============================================================
#  scripts/generate_report.py
#  生成评估报告 — 调用 eval-viewer 生成 HTML
# ============================================================
"""

import argparse
import sys
from pathlib import Path

# 复用 eval-viewer 的生成逻辑
sys.path.insert(0, str(Path(__file__).parent.parent / "eval-viewer"))
from generate_review import generate_html  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="生成 skill 评估 HTML 报告")
    parser.add_argument("skill_dir", help="skill 目录路径")
    parser.add_argument("-o", "--output", help="输出路径")
    args = parser.parse_args()

    skill_dir = Path(args.skill_dir).resolve()
    eval_dir = skill_dir / "eval"

    if not eval_dir.exists():
        print(f"Error: eval directory not found at {eval_dir}")
        sys.exit(1)

    generate_html(eval_dir, args.output)


if __name__ == "__main__":
    main()
