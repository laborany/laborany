#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                           视频渲染脚本                                        ║
║  使用 Remotion 渲染视频为 MP4 文件                                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path
from datetime import datetime


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              配置                                            │
# └──────────────────────────────────────────────────────────────────────────────┘

DEFAULT_COMPOSITION = "Main"
DEFAULT_CODEC = "h264"
DEFAULT_QUALITY = 80


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              核心函数                                        │
# └──────────────────────────────────────────────────────────────────────────────┘

def find_project_root(start_dir: Path) -> Path | None:
    """向上查找包含 package.json 的目录"""
    current = start_dir.resolve()
    while current != current.parent:
        if (current / "package.json").exists():
            return current
        current = current.parent
    return None


def render_video(
    project_dir: Path,
    composition: str,
    output: str,
    codec: str,
    quality: int,
) -> int:
    """渲染视频"""
    # 确保输出目录存在
    output_path = Path(output)
    if not output_path.is_absolute():
        output_path = project_dir / output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Remotion 视频渲染")
    print("=" * 60)
    print()
    print(f"📁 项目目录: {project_dir}")
    print(f"🎬 Composition: {composition}")
    print(f"📄 输出文件: {output_path}")
    print(f"🎞️ 编码器: {codec}")
    print(f"📊 质量: {quality}")
    print()
    print("渲染中...")
    print()

    cmd = [
        "npx", "remotion", "render",
        composition,
        str(output_path),
        "--codec", codec,
        "--crf", str(100 - quality),  # CRF 与质量反向
    ]

    try:
        result = subprocess.run(
            cmd,
            cwd=project_dir,
        )

        if result.returncode == 0:
            print()
            print("=" * 60)
            print(f"✅ 渲染完成: {output_path}")
            print("=" * 60)
        else:
            print()
            print("❌ 渲染失败")

        return result.returncode

    except FileNotFoundError:
        print("❌ npx 未找到，请先安装 Node.js")
        return 1


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              主函数                                          │
# └──────────────────────────────────────────────────────────────────────────────┘

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="渲染 Remotion 视频")
    parser.add_argument(
        "-p", "--project",
        help="项目目录（默认：当前目录）"
    )
    parser.add_argument(
        "-c", "--composition",
        default=DEFAULT_COMPOSITION,
        help=f"Composition ID（默认：{DEFAULT_COMPOSITION}）"
    )
    parser.add_argument(
        "-o", "--output",
        help="输出文件路径（默认：out/video-{timestamp}.mp4）"
    )
    parser.add_argument(
        "--codec",
        default=DEFAULT_CODEC,
        choices=["h264", "h265", "vp8", "vp9", "prores"],
        help=f"视频编码器（默认：{DEFAULT_CODEC}）"
    )
    parser.add_argument(
        "-q", "--quality",
        type=int,
        default=DEFAULT_QUALITY,
        help=f"视频质量 1-100（默认：{DEFAULT_QUALITY}）"
    )

    args = parser.parse_args()

    # 确定项目目录
    if args.project:
        project_dir = Path(args.project).resolve()
    else:
        project_dir = find_project_root(Path.cwd())

    if not project_dir:
        print("❌ 未找到 Remotion 项目")
        print("   请在项目目录中运行，或使用 -p 指定项目路径")
        return 1

    if not (project_dir / "package.json").exists():
        print(f"❌ 目录不是有效的 Remotion 项目: {project_dir}")
        return 1

    # 确定输出文件
    if args.output:
        output = args.output
    else:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output = f"out/video-{timestamp}.mp4"

    return render_video(
        project_dir=project_dir,
        composition=args.composition,
        output=output,
        codec=args.codec,
        quality=args.quality,
    )


if __name__ == "__main__":
    sys.exit(main())
