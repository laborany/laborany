"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Draw.io Scripts 模块                                  ║
║                                                                              ║
║  提供 draw.io 图表的创建、编辑和导出功能                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from .diagram import Diagram, Node, Edge, Group
from .exporter import export_png, export_svg, export_pdf, check_export_available
from .installer import ensure_drawio_cli, check_drawio_installed, get_platform_info

__all__ = [
    # 核心类
    "Diagram",
    "Node",
    "Edge",
    "Group",
    # 导出函数
    "export_png",
    "export_svg",
    "export_pdf",
    "check_export_available",
    # 安装函数
    "ensure_drawio_cli",
    "check_drawio_installed",
    "get_platform_info",
]
