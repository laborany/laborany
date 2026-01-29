#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         PDF 论文解析器                                        ║
║  功能: 提取学术论文中的文字、表格、图片                                         ║
║  输出: JSON 格式的结构化数据                                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import argparse
import json
import base64
import sys
from pathlib import Path

# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              依赖检查                                         │
# └──────────────────────────────────────────────────────────────────────────────┘

def check_dependencies():
    """检查并提示缺失的依赖"""
    missing = []
    try:
        import pdfplumber
    except ImportError:
        missing.append("pdfplumber")
    try:
        import fitz  # PyMuPDF
    except ImportError:
        missing.append("PyMuPDF")

    if missing:
        print(f"缺少依赖: {', '.join(missing)}", file=sys.stderr)
        print(f"请运行: pip install {' '.join(missing)}", file=sys.stderr)
        sys.exit(1)

check_dependencies()

import pdfplumber
import fitz

# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              核心解析逻辑                                      │
# └──────────────────────────────────────────────────────────────────────────────┘

def extract_text_and_tables(pdf_path: str) -> dict:
    """
    使用 pdfplumber 提取文字和表格
    返回: {pages: [{page_num, text, tables}]}
    """
    pages_data = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            page_data = {
                "page_num": i + 1,
                "text": page.extract_text() or "",
                "tables": []
            }

            # 提取表格
            tables = page.extract_tables()
            for table in tables:
                if table:
                    page_data["tables"].append(table)

            pages_data.append(page_data)

    return {"pages": pages_data}


def extract_images(pdf_path: str, output_dir: str = None) -> list:
    """
    使用 PyMuPDF 提取图片
    返回: [{page_num, image_index, width, height, path|base64}]
    """
    images = []
    doc = fitz.open(pdf_path)

    for page_num in range(len(doc)):
        page = doc[page_num]
        image_list = page.get_images()

        for img_index, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)

            if not base_image:
                continue

            image_data = {
                "page_num": page_num + 1,
                "image_index": img_index + 1,
                "width": base_image.get("width", 0),
                "height": base_image.get("height", 0),
                "ext": base_image.get("ext", "png")
            }

            # 保存图片或转为 base64
            if output_dir:
                output_path = Path(output_dir)
                output_path.mkdir(parents=True, exist_ok=True)
                img_filename = f"page{page_num + 1}_img{img_index + 1}.{image_data['ext']}"
                img_path = output_path / img_filename
                with open(img_path, "wb") as f:
                    f.write(base_image["image"])
                image_data["path"] = str(img_path)
            else:
                image_data["base64"] = base64.b64encode(
                    base_image["image"]
                ).decode("utf-8")

            images.append(image_data)

    doc.close()
    return images


def parse_pdf(pdf_path: str, output_dir: str = None) -> dict:
    """
    主解析函数: 整合文字、表格、图片
    """
    result = extract_text_and_tables(pdf_path)
    result["images"] = extract_images(pdf_path, output_dir)
    result["source_file"] = str(Path(pdf_path).name)
    return result


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              命令行接口                                        │
# └──────────────────────────────────────────────────────────────────────────────┘

def main():
    parser = argparse.ArgumentParser(
        description="解析学术论文 PDF，提取文字、表格、图片"
    )
    parser.add_argument("pdf_path", help="PDF 文件路径")
    parser.add_argument(
        "-o", "--output",
        help="输出 JSON 文件路径 (默认输出到 stdout)"
    )
    parser.add_argument(
        "--image-dir",
        help="图片保存目录 (不指定则转为 base64)"
    )

    args = parser.parse_args()

    if not Path(args.pdf_path).exists():
        print(f"错误: 文件不存在 - {args.pdf_path}", file=sys.stderr)
        sys.exit(1)

    result = parse_pdf(args.pdf_path, args.image_dir)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"已保存到: {args.output}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
