#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                           项目初始化脚本                                      ║
║  从模板创建新的 Remotion 视频项目                                             ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              配置                                            │
# └──────────────────────────────────────────────────────────────────────────────┘

SCRIPT_DIR = Path(__file__).parent
TEMPLATE_DIR = SCRIPT_DIR.parent / "templates" / "remotion-starter"


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              核心函数                                        │
# └──────────────────────────────────────────────────────────────────────────────┘

def copy_template(target_dir: Path) -> bool:
    """复制模板到目标目录"""
    if target_dir.exists():
        print(f"❌ 目标目录已存在: {target_dir}")
        return False

    if not TEMPLATE_DIR.exists():
        print(f"❌ 模板目录不存在: {TEMPLATE_DIR}")
        return False

    print(f"📁 复制模板到: {target_dir}")
    shutil.copytree(TEMPLATE_DIR, target_dir)
    return True


def install_dependencies(project_dir: Path) -> bool:
    """安装 npm 依赖"""
    print("📦 安装依赖...")
    try:
        result = subprocess.run(
            ["npm", "install"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=300  # 5 分钟超时
        )
        if result.returncode != 0:
            print(f"❌ 安装失败:\n{result.stderr}")
            return False
        print("✅ 依赖安装完成")
        return True
    except subprocess.TimeoutExpired:
        print("❌ 安装超时")
        return False
    except FileNotFoundError:
        print("❌ npm 未找到，请先安装 Node.js")
        return False


def create_public_dir(project_dir: Path):
    """创建 public 目录用于存放静态资源"""
    public_dir = project_dir / "public"
    public_dir.mkdir(exist_ok=True)
    # 创建 .gitkeep 文件
    (public_dir / ".gitkeep").touch()
    print(f"📁 创建资源目录: {public_dir}")


def create_out_dir(project_dir: Path):
    """创建 out 目录用于存放输出视频"""
    out_dir = project_dir / "out"
    out_dir.mkdir(exist_ok=True)
    (out_dir / ".gitkeep").touch()
    print(f"📁 创建输出目录: {out_dir}")


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              主函数                                          │
# └──────────────────────────────────────────────────────────────────────────────┘

def main():
    """主函数"""
    # 解析参数
    if len(sys.argv) < 2:
        print("用法: python init_project.py <项目目录>")
        print("示例: python init_project.py ./my-video")
        return 1

    target_dir = Path(sys.argv[1]).resolve()

    print("=" * 60)
    print("Remotion 项目初始化")
    print("=" * 60)
    print()

    # 复制模板
    if not copy_template(target_dir):
        return 1

    # 创建必要目录
    create_public_dir(target_dir)
    create_out_dir(target_dir)

    # 安装依赖
    if not install_dependencies(target_dir):
        return 1

    print()
    print("=" * 60)
    print("✅ 项目创建成功！")
    print("=" * 60)
    print()
    print("后续步骤:")
    print(f"  1. cd {target_dir}")
    print("  2. npm start          # 启动 Remotion Studio")
    print("  3. npm run build      # 渲染视频")
    print()
    print("项目结构:")
    print("  src/")
    print("    Root.tsx            # Composition 定义")
    print("    compositions/       # 视频组件")
    print("  public/               # 静态资源（图片、视频、字体）")
    print("  out/                  # 输出目录")
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
