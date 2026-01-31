#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Excel 公式重算工具                                     ║
║                                                                              ║
║  功能：重新计算 xlsx 文件中的所有公式                                           ║
║  用法：python recalc.py <input.xlsx> <output.xlsx>                           ║
║  原理：通过 LibreOffice 打开并保存来触发公式重算                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import sys
import subprocess
import shutil
from pathlib import Path


def recalc(input_path: str, output_path: str) -> None:
    """使用 LibreOffice 重算 Excel 公式"""
    input_file = Path(input_path)
    output_file = Path(output_path)

    if not input_file.exists():
        raise FileNotFoundError(f"文件不存在: {input_file}")

    # 复制到临时位置
    temp_dir = Path('/tmp/xlsx_recalc')
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file = temp_dir / input_file.name

    shutil.copy(input_file, temp_file)

    # 使用 LibreOffice 重算
    cmd = [
        'soffice',
        '--headless',
        '--calc',
        '--convert-to', 'xlsx',
        '--outdir', str(temp_dir),
        str(temp_file)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"LibreOffice 执行失败: {result.stderr}")

    # 移动到目标位置
    shutil.move(temp_file, output_file)

    print(f"[重算完成] {input_file} -> {output_file}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("用法: python recalc.py <input.xlsx> <output.xlsx>")
        sys.exit(1)

    recalc(sys.argv[1], sys.argv[2])
