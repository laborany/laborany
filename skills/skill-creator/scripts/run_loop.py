#!/usr/bin/env python3
"""
# ============================================================
#  scripts/run_loop.py
#  eval + improve 循环 — 自动化评估迭代
#  适配说明：原版使用 anthropic SDK，此版本通过
#  improve_description 间接调用 claude CLI，无 SDK 依赖
# ============================================================
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

from .run_eval import run_eval
from .aggregate_benchmark import aggregate
from .improve_description import apply_improvement
from .utils import parse_skill_md


# ────────────────────────────────────────────────────────────
#  评估集拆分（训练集 / 验证集）
# ────────────────────────────────────────────────────────────

def split_eval_set(metadata, train_ratio=0.7):
    """
    将测试用例拆分为训练集和验证集。
    训练集用于优化 description，验证集用于验证改进效果。
    """
    test_cases = metadata.get("test_cases", [])
    n = len(test_cases)
    split_idx = max(1, int(n * train_ratio))
    return test_cases[:split_idx], test_cases[split_idx:]


# ────────────────────────────────────────────────────────────
#  单次迭代
# ────────────────────────────────────────────────────────────

def run_iteration(skill_dir, iteration, model, history):
    """执行一次完整的 eval → aggregate → improve 迭代"""
    print(f"\n{'='*50}")
    print(f"  Iteration {iteration}")
    print(f"{'='*50}")

    # 1. 运行评估
    print("\n[1/3] Running evaluation...")
    run_eval(skill_dir, run_all=True)

    # 2. 聚合 benchmark
    print("\n[2/3] Aggregating benchmark...")
    entry = aggregate(skill_dir)

    # 3. 优化 description
    print("\n[3/3] Improving description...")
    new_desc = apply_improvement(skill_dir, model=model)

    # 记录历史
    record = {
        "iteration": iteration,
        "timestamp": datetime.now().isoformat(),
        "scores": entry.get("scores", {}) if entry else {},
        "description_preview": (new_desc or "")[:200],
    }
    history.append(record)

    return entry


# ────────────────────────────────────────────────────────────
#  主循环
# ────────────────────────────────────────────────────────────

def run_loop(skill_dir, iterations=3, model="sonnet"):
    """运行完整的 eval-improve 循环"""
    skill_dir = Path(skill_dir).resolve()

    # 验证 eval 目录存在
    eval_dir = skill_dir / "eval"
    metadata_path = eval_dir / "eval_metadata.json"
    if not metadata_path.exists():
        print(f"Error: {metadata_path} not found")
        print("Create eval_metadata.json first (see references/schemas.md)")
        sys.exit(1)

    fm, _ = parse_skill_md(skill_dir)
    print(f"Skill: {fm.get('name', skill_dir.name)}")
    print(f"Iterations: {iterations}")
    print(f"Model: {model}")

    history = []
    for i in range(1, iterations + 1):
        run_iteration(skill_dir, i, model, history)

    # 最终报告
    print(f"\n{'='*50}")
    print("  Loop Complete")
    print(f"{'='*50}")

    if history:
        first = history[0].get("scores", {})
        last = history[-1].get("scores", {})
        first_mean = first.get("mean", 0)
        last_mean = last.get("mean", 0)
        delta = last_mean - first_mean
        direction = "+" if delta >= 0 else ""
        print(f"Score: {first_mean:.4f} → {last_mean:.4f} ({direction}{delta:.4f})")

    # 保存历史
    history_path = eval_dir / "loop_history.json"
    history_path.write_text(
        json.dumps(history, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"History saved: {history_path}")


# ────────────────────────────────────────────────────────────
#  CLI 入口
# ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="运行 eval-improve 循环")
    parser.add_argument("skill_dir", help="skill 目录路径")
    parser.add_argument("--iterations", type=int, default=3, help="迭代次数")
    parser.add_argument("--model", default="sonnet", help="模型名称")
    args = parser.parse_args()

    run_loop(args.skill_dir, iterations=args.iterations, model=args.model)


if __name__ == "__main__":
    main()
