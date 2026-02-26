#!/usr/bin/env python3
"""
# ============================================================
#  scripts/aggregate_benchmark.py
#  聚合评估结果到 benchmark.json
# ============================================================
"""

import argparse
import hashlib
import json
import statistics
import sys
from datetime import datetime
from pathlib import Path

from .utils import parse_skill_md


# ────────────────────────────────────────────────────────────
#  聚合逻辑
# ────────────────────────────────────────────────────────────

def collect_scores(eval_dir):
    """从最新一次 run 的 grading 结果中收集分数"""
    runs_dir = eval_dir / "runs"
    if not runs_dir.exists():
        return [], None

    # 找最新的 run 目录
    run_dirs = sorted(runs_dir.iterdir(), key=lambda p: p.stat().st_mtime)
    if not run_dirs:
        return [], None

    latest = run_dirs[-1]
    grading_dir = latest / "grading"
    if not grading_dir.exists():
        return [], latest.name

    scores = []
    for f in sorted(grading_dir.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        scores.append({
            "test_case_id": data.get("test_case_id", f.stem),
            "score": data.get("overall_score", 0.0),
            "duration_seconds": data.get("timing", {}).get("duration_seconds", 0),
        })
    return scores, latest.name


def aggregate(skill_dir):
    """聚合分数并追加到 benchmark.json"""
    skill_dir = Path(skill_dir).resolve()
    eval_dir = skill_dir / "eval"
    benchmark_path = eval_dir / "benchmark.json"

    # 读取现有 benchmark
    if benchmark_path.exists():
        benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
    else:
        fm, _ = parse_skill_md(skill_dir)
        benchmark = {
            "skill_name": fm.get("name", skill_dir.name),
            "description_version": 0,
            "created_at": datetime.now().isoformat(),
            "entries": [],
        }

    # 收集分数
    per_case, run_id = collect_scores(eval_dir)
    if not per_case:
        print("No grading results found")
        return

    raw_scores = [s["score"] for s in per_case]
    total_dur = sum(s["duration_seconds"] for s in per_case)

    # 计算当前 description hash
    fm, body = parse_skill_md(skill_dir)
    desc = fm.get("description", "")
    desc_hash = hashlib.sha256(desc.encode()).hexdigest()[:16]

    # 版本号递增
    version = benchmark["description_version"] + 1
    benchmark["description_version"] = version

    entry = {
        "description_version": version,
        "description_hash": desc_hash,
        "run_id": run_id,
        "timestamp": datetime.now().isoformat(),
        "scores": {
            "mean": round(statistics.mean(raw_scores), 4),
            "median": round(statistics.median(raw_scores), 4),
            "std_dev": round(statistics.stdev(raw_scores), 4) if len(raw_scores) > 1 else 0.0,
            "min": round(min(raw_scores), 4),
            "max": round(max(raw_scores), 4),
        },
        "per_test_case": per_case,
        "total_duration_seconds": round(total_dur, 2),
        "num_test_cases": len(per_case),
    }
    benchmark["entries"].append(entry)

    # 写回
    benchmark_path.write_text(
        json.dumps(benchmark, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Benchmark updated: v{version}, mean={entry['scores']['mean']}")
    return entry


# ────────────────────────────────────────────────────────────
#  CLI 入口
# ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="聚合评估结果到 benchmark")
    parser.add_argument("skill_dir", help="skill 目录路径")
    args = parser.parse_args()
    aggregate(args.skill_dir)


if __name__ == "__main__":
    main()
