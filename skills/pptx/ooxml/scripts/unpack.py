#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         PPTX 解包工具                                         ║
║                                                                              ║
║  功能：将 .pptx 文件解压到指定目录                                             ║
║  用法：python unpack.py <pptx_file> <output_dir>                             ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import sys
import zipfile
from pathlib import Path


def unpack(pptx_path: str, output_dir: str) -> None:
    """解包 PPTX 文件到指定目录"""
    pptx = Path(pptx_path)
    output = Path(output_dir)

    if not pptx.exists():
        raise FileNotFoundError(f"文件不存在: {pptx}")

    output.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(pptx, 'r') as zf:
        zf.extractall(output)

    print(f"[解包完成] {pptx} -> {output}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("用法: python unpack.py <pptx_file> <output_dir>")
        sys.exit(1)

    unpack(sys.argv[1], sys.argv[2])
