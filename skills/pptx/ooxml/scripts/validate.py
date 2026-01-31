#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         PPTX 验证入口                                         ║
║                                                                              ║
║  用法：python validate.py <pptx_file>                                         ║
║  或：  python validate.py <unpacked_dir> <original_pptx>                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import sys
import tempfile
from pathlib import Path

# 添加父目录到路径以导入验证器
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "docx" / "ooxml" / "scripts"))

from validation.pptx import PPTXSchemaValidator


def validate_pptx(pptx_path: str) -> bool:
    """
    验证 PPTX 文件。

    Args:
        pptx_path: PPTX 文件路径

    Returns:
        bool: 验证是否通过
    """
    pptx_file = Path(pptx_path)

    if not pptx_file.exists():
        print(f"错误: 文件不存在 - {pptx_path}")
        return False

    # 解包到临时目录
    import zipfile
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        with zipfile.ZipFile(pptx_file, 'r') as zf:
            zf.extractall(temp_path)

        # 运行验证
        validator = PPTXSchemaValidator(temp_path, pptx_file, verbose=True)
        return validator.validate()


def validate_unpacked(unpacked_dir: str, original_pptx: str) -> bool:
    """
    验证解包后的 PPTX 目录。

    Args:
        unpacked_dir: 解包目录路径
        original_pptx: 原始 PPTX 文件路径

    Returns:
        bool: 验证是否通过
    """
    unpacked = Path(unpacked_dir)
    original = Path(original_pptx)

    if not unpacked.exists():
        print(f"错误: 目录不存在 - {unpacked_dir}")
        return False

    if not original.exists():
        print(f"错误: 原始文件不存在 - {original_pptx}")
        return False

    validator = PPTXSchemaValidator(unpacked, original, verbose=True)
    return validator.validate()


def main():
    """主入口。"""
    if len(sys.argv) == 2:
        # 验证 PPTX 文件
        success = validate_pptx(sys.argv[1])
    elif len(sys.argv) == 3:
        # 验证解包目录
        success = validate_unpacked(sys.argv[1], sys.argv[2])
    else:
        print("用法:")
        print("  python validate.py <pptx_file>")
        print("  python validate.py <unpacked_dir> <original_pptx>")
        sys.exit(1)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
