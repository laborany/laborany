"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Draw.io 导出模块                                      ║
║                                                                              ║
║  提供 PNG/SVG 导出功能，调用 draw.io CLI                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import subprocess
import shutil
from pathlib import Path
from typing import Optional

from .installer import ensure_drawio_cli


# ═══════════════════════════════════════════════════════════════════════════════
#  导出函数
# ═══════════════════════════════════════════════════════════════════════════════

def export_png(
    input_path: str,
    output_path: str,
    scale: int = 2,
    page: int = 0
) -> bool:
    """
    导出 PNG 图片

    参数:
        input_path: 输入 .drawio 文件路径
        output_path: 输出 .png 文件路径
        scale: 缩放倍数（默认 2x）
        page: 页码（从 0 开始）

    返回:
        是否成功
    """
    cli_path = ensure_drawio_cli()
    if not cli_path:
        return False

    return _run_export(cli_path, input_path, output_path, "png", scale, page)


def export_svg(
    input_path: str,
    output_path: str,
    page: int = 0
) -> bool:
    """
    导出 SVG 图片

    参数:
        input_path: 输入 .drawio 文件路径
        output_path: 输出 .svg 文件路径
        page: 页码（从 0 开始）

    返回:
        是否成功
    """
    cli_path = ensure_drawio_cli()
    if not cli_path:
        return False

    return _run_export(cli_path, input_path, output_path, "svg", 1, page)


def export_pdf(
    input_path: str,
    output_path: str,
    page: int = None
) -> bool:
    """
    导出 PDF 文件

    参数:
        input_path: 输入 .drawio 文件路径
        output_path: 输出 .pdf 文件路径
        page: 页码（None 表示所有页）

    返回:
        是否成功
    """
    cli_path = ensure_drawio_cli()
    if not cli_path:
        return False

    return _run_export(cli_path, input_path, output_path, "pdf", 1, page)


# ═══════════════════════════════════════════════════════════════════════════════
#  内部函数
# ═══════════════════════════════════════════════════════════════════════════════

def _run_export(
    cli_path: str,
    input_path: str,
    output_path: str,
    format: str,
    scale: int,
    page: Optional[int]
) -> bool:
    """
    执行导出命令

    draw.io CLI 参数:
        -x, --export          导出模式
        -f, --format          输出格式 (png, svg, pdf, vsdx, xml)
        -s, --scale           缩放倍数
        -o, --output          输出文件
        -p, --page-index      页码（从 0 开始）
        --crop                裁剪空白区域
    """
    # 确保输出目录存在
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # 构建命令
    cmd = [
        cli_path,
        "-x",                    # 导出模式
        "-f", format,            # 输出格式
        "-s", str(scale),        # 缩放
        "--crop",                # 裁剪空白
        "-o", output_path,       # 输出文件
        input_path,              # 输入文件
    ]

    # 添加页码参数
    if page is not None:
        cmd.extend(["-p", str(page)])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        return False
    except FileNotFoundError:
        return False


def check_export_available() -> bool:
    """检查导出功能是否可用"""
    cli_path = ensure_drawio_cli()
    return cli_path is not None and Path(cli_path).exists()
