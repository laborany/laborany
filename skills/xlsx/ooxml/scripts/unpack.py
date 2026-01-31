#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         XLSX 解包工具                                          ║
║                                                                              ║
║  将 .xlsx 文件解压并格式化 XML 内容                                             ║
║  用法: python unpack.py <xlsx_file> <output_dir>                             ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import sys
import zipfile
from pathlib import Path

import defusedxml.minidom


def unpack_xlsx(input_file: str, output_dir: str) -> None:
    """
    解包 xlsx 文件。

    参数:
        input_file: xlsx 文件路径
        output_dir: 输出目录路径
    """
    input_path = Path(input_file)
    output_path = Path(output_dir)

    if not input_path.exists():
        raise FileNotFoundError(f"文件不存在: {input_file}")

    if not input_path.suffix.lower() == ".xlsx":
        raise ValueError(f"文件必须是 .xlsx 格式: {input_file}")

    # ─────────────────────────────────────────────────────────────────────────
    #  解压文件
    # ─────────────────────────────────────────────────────────────────────────
    output_path.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(input_path, "r") as zf:
        zf.extractall(output_path)

    # ─────────────────────────────────────────────────────────────────────────
    #  格式化 XML 文件
    # ─────────────────────────────────────────────────────────────────────────
    xml_files = list(output_path.rglob("*.xml")) + list(output_path.rglob("*.rels"))
    for xml_file in xml_files:
        try:
            content = xml_file.read_text(encoding="utf-8")
            dom = defusedxml.minidom.parseString(content)
            xml_file.write_bytes(dom.toprettyxml(indent="  ", encoding="utf-8"))
        except Exception as e:
            print(f"警告: 无法格式化 {xml_file}: {e}", file=sys.stderr)

    print(f"[解包完成] {input_file} -> {output_dir}")
    print(f"  工作表数量: {len(list((output_path / 'xl' / 'worksheets').glob('sheet*.xml')))}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python unpack.py <xlsx_file> <output_dir>")
        sys.exit(1)

    try:
        unpack_xlsx(sys.argv[1], sys.argv[2])
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)
