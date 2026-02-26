#!/usr/bin/env python3
"""
# ============================================================
#  scripts/improve_description.py
#  通过 claude CLI 优化 skill description
#  适配说明：原版使用 anthropic SDK，此版本改用 claude -p CLI
# ============================================================
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from .utils import parse_skill_md, write_skill_md


# ────────────────────────────────────────────────────────────
#  常量
# ────────────────────────────────────────────────────────────

MAX_DESCRIPTION_LEN = 1024
DEFAULT_MODEL = "sonnet"


# ────────────────────────────────────────────────────────────
#  CLI 调用封装
# ────────────────────────────────────────────────────────────

def call_claude(prompt, model=DEFAULT_MODEL):
    """
    通过 claude -p CLI 调用 LLM，返回文本结果。
    替代原版的 anthropic.Anthropic().messages.create()。
    """
    cmd = [
        "claude", "-p", prompt,
        "--model", model,
        "--output-format", "json",
        "--max-turns", "1",
    ]

    # 清除可能干扰子进程的环境变量
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

    result = subprocess.run(
        cmd, capture_output=True, text=True,
        timeout=120, env=env,
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr}")

    # 解析 JSON 输出
    try:
        parsed = json.loads(result.stdout)
        return parsed.get("result", result.stdout)
    except (json.JSONDecodeError, TypeError):
        return result.stdout


# ────────────────────────────────────────────────────────────
#  description 提取
# ────────────────────────────────────────────────────────────

def extract_new_description(text):
    """从 LLM 输出中提取 <new_description> 标签内容"""
    match = re.search(
        r"<new_description>(.*?)</new_description>",
        text, re.DOTALL,
    )
    if match:
        return match.group(1).strip()
    return None


# ────────────────────────────────────────────────────────────
#  核心：优化 description
# ────────────────────────────────────────────────────────────

def improve_description(
    *,
    skill_name,
    skill_content,
    current_description,
    eval_results,
    history=None,
    model=DEFAULT_MODEL,
):
    """
    调用 LLM 分析评估结果，生成优化后的 description。
    返回新的 description 字符串，或 None（如果提取失败）。
    """
    history_section = ""
    if history:
        history_section = f"""
Previous improvement attempts:
{json.dumps(history, ensure_ascii=False, indent=2)}

Learn from what worked and what didn't.
"""

    prompt = f"""You are optimizing a skill's description to improve its evaluation scores.

Skill name: {skill_name}

Current description:
{current_description}

Skill content (SKILL.md body):
{skill_content[:3000]}

Evaluation results:
{json.dumps(eval_results, ensure_ascii=False, indent=2)[:4000]}
{history_section}
Analyze the evaluation results. Identify which test cases scored lowest and why.
Then write an improved description that would help Claude perform better on these test cases.

The description must:
- Be under {MAX_DESCRIPTION_LEN} characters
- Clearly state what the skill does and when to use it
- Include specific triggers and contexts

Output your improved description inside <new_description> tags:
<new_description>
Your improved description here
</new_description>"""

    text = call_claude(prompt, model=model)
    new_desc = extract_new_description(text)

    # 如果超长，二次缩短
    if new_desc and len(new_desc) > MAX_DESCRIPTION_LEN:
        shorten_prompt = f"""The following skill description is too long ({len(new_desc)} chars, max {MAX_DESCRIPTION_LEN}).
Shorten it while preserving the key information:

{new_desc}

Output the shortened version inside <new_description> tags."""

        text2 = call_claude(shorten_prompt, model=model)
        shortened = extract_new_description(text2)
        if shortened and len(shortened) <= MAX_DESCRIPTION_LEN:
            new_desc = shortened

    return new_desc


# ────────────────────────────────────────────────────────────
#  应用到 SKILL.md
# ────────────────────────────────────────────────────────────

def apply_improvement(skill_dir, model=DEFAULT_MODEL):
    """读取评估结果，优化 description，写回 SKILL.md"""
    skill_dir = Path(skill_dir).resolve()
    fm, body = parse_skill_md(skill_dir)

    # 加载最新 benchmark
    benchmark_path = skill_dir / "eval" / "benchmark.json"
    eval_results = {}
    if benchmark_path.exists():
        benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
        entries = benchmark.get("entries", [])
        if entries:
            eval_results = entries[-1]

    current_desc = fm.get("description", "")
    skill_name = fm.get("name", skill_dir.name)

    print(f"Current description ({len(current_desc)} chars):")
    print(f"  {current_desc[:100]}...")

    new_desc = improve_description(
        skill_name=skill_name,
        skill_content=body,
        current_description=current_desc,
        eval_results=eval_results,
        model=model,
    )

    if not new_desc:
        print("Failed to extract new description from LLM output")
        return None

    print(f"\nNew description ({len(new_desc)} chars):")
    print(f"  {new_desc[:100]}...")

    # 写回
    fm["description"] = new_desc
    write_skill_md(skill_dir, fm, body)
    print("\nSKILL.md updated")
    return new_desc


# ────────────────────────────────────────────────────────────
#  CLI 入口
# ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="优化 skill description")
    parser.add_argument("skill_dir", help="skill 目录路径")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="模型名称")
    args = parser.parse_args()
    apply_improvement(args.skill_dir, model=args.model)


if __name__ == "__main__":
    main()
