#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         XLSX 打包工具                                          ║
║                                                                              ║
║  将解压目录打包为 .xlsx 文件                                                    ║
║  用法: python pack.py <input_dir> <xlsx_file> [--force]                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import defusedxml.minidom


def pack_document(input_dir, output_file, validate=False):
    """
    打包目录为 xlsx 文件。

    参数:
        input_dir: 解压后的目录路径
        output_file: 输出 xlsx 文件路径
        validate: 是否验证文档

    返回:
        bool: 是否成功
    """
    input_dir = Path(input_dir)
    output_file = Path(output_file)

    if not input_dir.is_dir():
        raise ValueError(f"{input_dir} 不是目录")

    if output_file.suffix.lower() != ".xlsx":
        raise ValueError(f"{output_file} 必须是 .xlsx 文件")

    # ─────────────────────────────────────────────────────────────────────────
    #  在临时目录中处理
    # ─────────────────────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_content_dir = Path(temp_dir) / "content"
        shutil.copytree(input_dir, temp_content_dir)

        # ─────────────────────────────────────────────────────────────────────
        #  压缩 XML 文件（移除格式化空白）
        # ─────────────────────────────────────────────────────────────────────
        for pattern in ["*.xml", "*.rels"]:
            for xml_file in temp_content_dir.rglob(pattern):
                condense_xml(xml_file)

        # ─────────────────────────────────────────────────────────────────────
        #  创建 zip 文件
        # ─────────────────────────────────────────────────────────────────────
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in temp_content_dir.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(temp_content_dir))

        # ─────────────────────────────────────────────────────────────────────
        #  验证
        # ─────────────────────────────────────────────────────────────────────
        if validate:
            if not validate_document(output_file):
                output_file.unlink()
                return False

    return True


def validate_document(doc_path):
    """使用 LibreOffice 验证文档。"""
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
                    str(doc_path),
                ],
                capture_output=True,
                timeout=10,
                text=True,
            )
            if not (Path(temp_dir) / f"{doc_path.stem}.html").exists():
                error_msg = result.stderr.strip() or "文档验证失败"
                print(f"验证错误: {error_msg}", file=sys.stderr)
                return False
            return True
        except FileNotFoundError:
            print("警告: soffice 未找到，跳过验证", file=sys.stderr)
            return True
        except subprocess.TimeoutExpired:
            print("验证错误: 转换超时", file=sys.stderr)
            return False
        except Exception as e:
            print(f"验证错误: {e}", file=sys.stderr)
            return False


def condense_xml(xml_file):
    """压缩 XML 文件，移除格式化空白。"""
    try:
        with open(xml_file, "r", encoding="utf-8") as f:
            dom = defusedxml.minidom.parse(f)

        # ─────────────────────────────────────────────────────────────────────
        #  移除空白文本节点（保留 t 元素内的文本）
        # ─────────────────────────────────────────────────────────────────────
        for element in dom.getElementsByTagName("*"):
            # 跳过文本元素
            if element.tagName.endswith(":t") or element.tagName == "t":
                continue

            for child in list(element.childNodes):
                if (
                    child.nodeType == child.TEXT_NODE
                    and child.nodeValue
                    and child.nodeValue.strip() == ""
                ) or child.nodeType == child.COMMENT_NODE:
                    element.removeChild(child)

        with open(xml_file, "wb") as f:
            f.write(dom.toxml(encoding="UTF-8"))
    except Exception as e:
        print(f"警告: 无法压缩 {xml_file}: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="打包目录为 xlsx 文件")
    parser.add_argument("input_directory", help="解压后的目录")
    parser.add_argument("output_file", help="输出 xlsx 文件")
    parser.add_argument("--force", action="store_true", help="跳过验证")
    args = parser.parse_args()

    try:
        success = pack_document(
            args.input_directory, args.output_file, validate=not args.force
        )

        if args.force:
            print("警告: 跳过验证，文件可能损坏", file=sys.stderr)
        elif not success:
            print("内容会产生损坏的文件", file=sys.stderr)
            print("请在打包前验证 XML", file=sys.stderr)
            print("使用 --force 跳过验证强制打包", file=sys.stderr)
            sys.exit(1)

        print(f"[打包完成] {args.input_directory} -> {args.output_file}")

    except ValueError as e:
        sys.exit(f"错误: {e}")


if __name__ == "__main__":
    main()
