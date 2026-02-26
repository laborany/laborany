#!/usr/bin/env python3
"""
# ============================================================
#  scripts/run_eval.py
#  运行 skill 评估 — 通过 claude -p CLI 执行测试用例
# ============================================================
"""

import argparse
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path


# ────────────────────────────────────────────────────────────
#  核心：执行单个测试用例
# ────────────────────────────────────────────────────────────

def run_test_case(skill_dir, test_case, run_id):
    """
    用 claude -p 执行一个测试用例，返回结果 dict。
    """
    prompt = test_case["prompt"]
    test_id = test_case["id"]

    # 构建 CLI 命令
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "json",
        "--max-turns", "1",
    ]

    # 清除可能干扰子进程的环境变量
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

    start = datetime.now()
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=180, env=env, cwd=str(skill_dir),
        )
        raw_output = result.stdout
        stderr = result.stderr
    except subprocess.TimeoutExpired:
        raw_output = ""
        stderr = "TIMEOUT: claude -p exceeded 180s"
    end = datetime.now()

    # 解析 JSON 输出
    output_text = ""
    try:
        parsed = json.loads(raw_output)
        output_text = parsed.get("result", raw_output)
    except (json.JSONDecodeError, TypeError):
        output_text = raw_output

    return {
        "test_case_id": test_id,
        "run_id": run_id,
        "prompt": prompt,
        "output": output_text,
        "stderr": stderr,
        "timing": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "duration_seconds": (end - start).total_seconds(),
        },
    }


# ────────────────────────────────────────────────────────────
#  批量执行
# ────────────────────────────────────────────────────────────

def run_eval(skill_dir, test_case_id=None, run_all=False):
    """执行评估，返回结果列表"""
    skill_dir = Path(skill_dir).resolve()
    eval_dir = skill_dir / "eval"
    metadata_path = eval_dir / "eval_metadata.json"

    if not metadata_path.exists():
        print(f"Error: {metadata_path} not found")
        sys.exit(1)

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    test_cases = metadata.get("test_cases", [])

    # 筛选测试用例
    if test_case_id and not run_all:
        test_cases = [tc for tc in test_cases if tc["id"] == test_case_id]
        if not test_cases:
            print(f"Error: test case '{test_case_id}' not found")
            sys.exit(1)

    run_id = str(uuid.uuid4())[:8]
    run_dir = eval_dir / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"Run ID: {run_id}")
    print(f"Test cases: {len(test_cases)}")

    results = []
    for i, tc in enumerate(test_cases, 1):
        print(f"  [{i}/{len(test_cases)}] {tc['id']}...", end=" ", flush=True)
        result = run_test_case(skill_dir, tc, run_id)
        results.append(result)

        # 保存单个结果
        out_path = run_dir / f"{tc['id']}.json"
        out_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        score_hint = "done" if result["output"] else "empty"
        print(score_hint)

    # 保存运行摘要
    summary = {
        "run_id": run_id,
        "skill_name": metadata.get("skill_name", ""),
        "timestamp": datetime.now().isoformat(),
        "num_test_cases": len(results),
        "results": [r["test_case_id"] for r in results],
    }
    (run_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nResults saved to: {run_dir}")
    return results


# ────────────────────────────────────────────────────────────
#  CLI 入口
# ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="运行 skill 评估测试用例")
    parser.add_argument("skill_dir", help="skill 目录路径")
    parser.add_argument("--test-case", help="只运行指定 test case ID")
    parser.add_argument("--all", action="store_true", help="运行所有测试用例")
    args = parser.parse_args()

    run_eval(args.skill_dir, test_case_id=args.test_case, run_all=args.all)


if __name__ == "__main__":
    main()
