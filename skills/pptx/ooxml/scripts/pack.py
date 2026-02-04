#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         PPTX 打包工具                                         ║
║                                                                              ║
║  功能：将解包目录重新打包为 .pptx 文件                                          ║
║  用法：python pack.py <input_dir> <pptx_file>                                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import sys
import zipfile
from pathlib import Path


def pack(input_dir: str, pptx_path: str) -> None:
    """将目录打包为 PPTX 文件"""
    source = Path(input_dir)
    output = Path(pptx_path)

    if not source.exists():
        raise FileNotFoundError(f"目录不存在: {source}")

    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file in source.rglob('*'):
            if file.is_file():
                arcname = file.relative_to(source)
                zf.write(file, arcname)

    print(f"[打包完成] {source} -> {output}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("用法: python pack.py <input_dir> <pptx_file>")
        sys.exit(1)

    pack(sys.argv[1], sys.argv[2])
