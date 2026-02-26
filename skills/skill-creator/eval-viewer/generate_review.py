#!/usr/bin/env python3
"""
# ============================================================
#  eval-viewer / generate_review.py
#  生成 HTML 评估报告 — 展示测试结果 + benchmark 对比
# ============================================================
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime


# ────────────────────────────────────────────────────────────
#  模板加载
# ────────────────────────────────────────────────────────────

def load_template():
    """加载同目录下的 viewer.html 模板"""
    template_path = Path(__file__).parent / "viewer.html"
    if not template_path.exists():
        print(f"Error: viewer.html not found at {template_path}")
        sys.exit(1)
    return template_path.read_text(encoding="utf-8")


# ────────────────────────────────────────────────────────────
#  数据收集
# ────────────────────────────────────────────────────────────

def collect_grading_data(eval_dir):
    """从 eval/runs/ 目录收集所有 grading 结果"""
    runs_dir = eval_dir / "runs"
    if not runs_dir.exists():
        return []

    results = []
    for run_dir in sorted(runs_dir.iterdir()):
        grading_dir = run_dir / "grading"
        if not grading_dir.exists():
            continue
        for grading_file in sorted(grading_dir.glob("*.json")):
            data = json.loads(grading_file.read_text(encoding="utf-8"))
            data["run_dir"] = run_dir.name
            results.append(data)
    return results


def load_benchmark(eval_dir):
    """加载 benchmark.json"""
    benchmark_path = eval_dir / "benchmark.json"
    if benchmark_path.exists():
        return json.loads(benchmark_path.read_text(encoding="utf-8"))
    return None


def load_eval_metadata(eval_dir):
    """加载 eval_metadata.json"""
    metadata_path = eval_dir / "eval_metadata.json"
    if metadata_path.exists():
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    return None


# ────────────────────────────────────────────────────────────
#  HTML 生成
# ────────────────────────────────────────────────────────────

def build_review_data(eval_dir):
    """构建注入 HTML 模板的 JSON 数据"""
    grading_results = collect_grading_data(eval_dir)
    benchmark = load_benchmark(eval_dir)
    metadata = load_eval_metadata(eval_dir)

    return {
        "generated_at": datetime.now().isoformat(),
        "skill_name": metadata.get("skill_name", "unknown") if metadata else "unknown",
        "num_test_cases": len(metadata.get("test_cases", [])) if metadata else 0,
        "num_runs": len(set(r.get("run_dir", "") for r in grading_results)),
        "grading_results": grading_results,
        "benchmark": benchmark,
        "metadata": metadata,
    }


def generate_html(eval_dir, output_path=None):
    """生成完整的 HTML 评估报告"""
    template = load_template()
    review_data = build_review_data(eval_dir)

    # 将数据注入模板
    data_json = json.dumps(review_data, ensure_ascii=False, indent=2)
    html = template.replace("/* __REVIEW_DATA__ */", f"const REVIEW_DATA = {data_json};")

    # 写入输出文件
    if output_path is None:
        output_path = eval_dir / "review.html"
    else:
        output_path = Path(output_path)

    output_path.write_text(html, encoding="utf-8")
    print(f"Review generated: {output_path}")
    return output_path


# ────────────────────────────────────────────────────────────
#  CLI 入口
# ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="生成 skill 评估 HTML 报告")
    parser.add_argument("skill_dir", help="skill 目录路径")
    parser.add_argument("-o", "--output", help="输出 HTML 文件路径（默认: <skill-dir>/eval/review.html）")
    args = parser.parse_args()

    skill_dir = Path(args.skill_dir).resolve()
    eval_dir = skill_dir / "eval"

    if not eval_dir.exists():
        print(f"Error: eval directory not found at {eval_dir}")
        sys.exit(1)

    generate_html(eval_dir, args.output)


if __name__ == "__main__":
    main()
