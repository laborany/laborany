#!/usr/bin/env python3
"""
# ============================================================
#  scripts/init_skill.py
#  初始化新 skill 目录 — 从模板生成
# ============================================================
"""

import sys
from pathlib import Path


# ────────────────────────────────────────────────────────────
#  模板定义
# ────────────────────────────────────────────────────────────

SKILL_TEMPLATE = """---
name: {skill_name}
description: |
  [TODO: Complete and informative explanation of what the skill does and when to use it.
  Include WHEN to use this skill — specific scenarios, file types, or tasks that trigger it.]
---

# {skill_title}

## Overview

[TODO: 1-2 sentences explaining what this skill enables]

## Workflow

[TODO: Define the core workflow. Common patterns:

1. **Sequential** — clear step-by-step procedures
2. **Task-based** — different operations/capabilities
3. **Reference** — standards or specifications
4. **Capabilities** — multiple interrelated features

Delete this guidance section when done.]

## Resources

This skill includes example resource directories:

- **scripts/**: Executable code for automation and processing
- **references/**: Documentation loaded into context as needed
- **assets/**: Files used in output (templates, images, fonts)

Delete any unneeded directories.
"""

EXAMPLE_SCRIPT = '''#!/usr/bin/env python3
"""
# ============================================================
#  {skill_name} 示例脚本
#  替换为实际实现或删除
# ============================================================
"""

def main():
    print("Example script for {skill_name}")

if __name__ == "__main__":
    main()
'''

EXAMPLE_REFERENCE = """# {skill_title} Reference

[TODO: Add reference documentation here. Useful for:]
- API documentation
- Database schemas
- Domain knowledge
- Detailed workflow guides

Delete this file if not needed.
"""


# ────────────────────────────────────────────────────────────
#  工具函数
# ────────────────────────────────────────────────────────────

def title_case_skill_name(skill_name):
    """将连字符名称转为 Title Case"""
    return " ".join(w.capitalize() for w in skill_name.split("-"))


# ────────────────────────────────────────────────────────────
#  初始化逻辑
# ────────────────────────────────────────────────────────────

def init_skill(skill_name, path):
    """创建新 skill 目录，返回路径或 None"""
    skill_dir = Path(path).resolve() / skill_name

    if skill_dir.exists():
        print(f"Error: directory already exists: {skill_dir}")
        return None

    skill_dir.mkdir(parents=True, exist_ok=False)
    skill_title = title_case_skill_name(skill_name)

    # SKILL.md
    (skill_dir / "SKILL.md").write_text(
        SKILL_TEMPLATE.format(skill_name=skill_name, skill_title=skill_title),
        encoding="utf-8",
    )

    # scripts/
    scripts_dir = skill_dir / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "example.py").write_text(
        EXAMPLE_SCRIPT.format(skill_name=skill_name),
        encoding="utf-8",
    )

    # references/
    refs_dir = skill_dir / "references"
    refs_dir.mkdir()
    (refs_dir / "api_reference.md").write_text(
        EXAMPLE_REFERENCE.format(skill_title=skill_title),
        encoding="utf-8",
    )

    # assets/
    (skill_dir / "assets").mkdir()

    # eval/ (新增：为 evaluate 体系预留)
    (skill_dir / "eval").mkdir()

    print(f"Skill '{skill_name}' initialized at {skill_dir}")
    return skill_dir


# ────────────────────────────────────────────────────────────
#  CLI 入口
# ────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 4 or sys.argv[2] != "--path":
        print("Usage: init_skill.py <skill-name> --path <path>")
        sys.exit(1)

    skill_name = sys.argv[1]
    path = sys.argv[3]

    result = init_skill(skill_name, path)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
