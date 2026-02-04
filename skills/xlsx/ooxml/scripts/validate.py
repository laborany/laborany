#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         XLSX 验证工具                                          ║
║                                                                              ║
║  验证 xlsx 文件或解压目录的有效性                                               ║
║  用法: python validate.py <xlsx_file_or_dir>                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import subprocess
import sys
import tempfile
from pathlib import Path

import defusedxml.minidom


def validate_xlsx(path: str) -> bool:
    """
    验证 xlsx 文件或解压目录。

    参数:
        path: xlsx 文件或解压目录路径

    返回:
        bool: 是否有效
    """
    path = Path(path)

    if path.is_file():
        return validate_xlsx_file(path)
    elif path.is_dir():
        return validate_xlsx_directory(path)
    else:
        print(f"错误: 路径不存在: {path}", file=sys.stderr)
        return False


def validate_xlsx_file(xlsx_path: Path) -> bool:
    """验证 xlsx 文件。"""
    print(f"验证文件: {xlsx_path}")

    # ─────────────────────────────────────────────────────────────────────────
    #  使用 LibreOffice 验证
    # ─────────────────────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            result = subprocess.run(
                [
                    "soffice",
                    "--headless",
                    "--convert-to",
                    "html:HTML (StarCalc)",
                    "--outdir",
                    temp_dir,
                    str(xlsx_path),
                ],
                capture_output=True,
                timeout=10,
                text=True,
            )

            html_file = Path(temp_dir) / f"{xlsx_path.stem}.html"
            if html_file.exists():
                print("  [OK] LibreOffice 验证通过")
                return True
            else:
                print(f"  [FAIL] LibreOffice 验证失败: {result.stderr.strip()}")
                return False

        except FileNotFoundError:
            print("  [SKIP] soffice 未找到，跳过 LibreOffice 验证")
            return True
        except subprocess.TimeoutExpired:
            print("  [FAIL] 验证超时")
            return False


def validate_xlsx_directory(dir_path: Path) -> bool:
    """验证解压目录。"""
    print(f"验证目录: {dir_path}")
    all_valid = True

    # ─────────────────────────────────────────────────────────────────────────
    #  检查必需文件
    # ─────────────────────────────────────────────────────────────────────────
    required_files = [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
    ]

    for rel_path in required_files:
        file_path = dir_path / rel_path
        if file_path.exists():
            print(f"  [OK] {rel_path}")
        else:
            print(f"  [FAIL] 缺少必需文件: {rel_path}")
            all_valid = False

    # ───────────────────────────────────────────────────────────────��─────────
    #  验证 XML 语法
    # ─────────────────────────────────────────────────────────────────────────
    xml_files = list(dir_path.rglob("*.xml")) + list(dir_path.rglob("*.rels"))
    print(f"\n验证 {len(xml_files)} 个 XML 文件...")

    for xml_file in xml_files:
        try:
            with open(xml_file, "r", encoding="utf-8") as f:
                defusedxml.minidom.parse(f)
        except Exception as e:
            rel_path = xml_file.relative_to(dir_path)
            print(f"  [FAIL] {rel_path}: {e}")
            all_valid = False

    if all_valid:
        print("\n  [OK] 所有 XML 文件语法正确")

    # ─────────────────────────────────────────────────────────────────────────
    #  检查工作表
    # ─────────────────────────────────────────────────────────────────────────
    worksheets_dir = dir_path / "xl" / "worksheets"
    if worksheets_dir.exists():
        sheets = list(worksheets_dir.glob("sheet*.xml"))
        print(f"\n工作表数量: {len(sheets)}")
        for sheet in sheets:
            print(f"  - {sheet.name}")

    return all_valid


def main():
    if len(sys.argv) != 2:
        print("用法: python validate.py <xlsx_file_or_dir>")
        sys.exit(1)

    success = validate_xlsx(sys.argv[1])
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
