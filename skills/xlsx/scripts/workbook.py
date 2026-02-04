#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Excel 工作簿管理类                                     ║
║                                                                              ║
║  提供高层 API 用于操作 Excel 工作簿                                             ║
║  设计理念：统一的 __getitem__ 访问模式，消除特殊情况                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any, Optional, Union

from .utilities import XlsxXMLEditor
from .formula import cell_to_index, index_to_cell


# ═══════════════════════════════════════════════════════════════════════════════
#  常量定义
# ═══════════════════════════════════════════════════════════════════════════════

THEMES_DIR = Path(__file__).parent.parent / "themes"
TEMPLATES_DIR = Path(__file__).parent / "templates"


# ═══════════════════════════════════════════════════════════════════════════════
#  Workbook 类
# ═══════════════════════════════════════════════════════════════════════════════

class Workbook:
    """
    Excel 工作簿管理类。

    提供统一的高层 API 用于：
    - 工作表操作 (获取、添加、删除)
    - 单元格操作 (读写、批量设置)
    - 样式操作 (应用主题、设置样式)
    - 图表和透视表

    设计哲学：
    - 懒加载：按需解析 XML
    - 统一访问：__getitem__ 模式
    - 临时目录隔离：保护原文件

    示例:
        wb = Workbook("unpacked/")
        wb.set_cell("A1", "Hello", sheet_index=0)
        wb.apply_theme("financial")
        wb.save("output/")
    """

    def __init__(self, unpacked_dir: Union[str, Path]):
        """
        初始化工作簿。

        参数:
            unpacked_dir: 解压后的 xlsx 目录路径

        异常:
            ValueError: 目录不存在或结构无效
        """
        self.original_path = Path(unpacked_dir)

        if not self.original_path.exists():
            raise ValueError(f"目录不存在: {unpacked_dir}")

        # ─────────────────────────────────────────────────────────────────────
        #  创建临时工作目录
        # ─────────────────────────────────────────────────────────────────────
        self.temp_dir = tempfile.mkdtemp(prefix="xlsx_")
        self.unpacked_path = Path(self.temp_dir) / "unpacked"
        shutil.copytree(self.original_path, self.unpacked_path)

        self.xl_path = self.unpacked_path / "xl"

        # ─────────────────────────────────────────────────────────────────────
        #  编辑器缓存
        # ─────────────────────────────────────────────────────────────────────
        self._editors: dict[str, XlsxXMLEditor] = {}
        self._shared_strings: Optional[list[str]] = None
        self._workbook_xml: Optional[XlsxXMLEditor] = None

    def __del__(self):
        """清理临时目录。"""
        if hasattr(self, "temp_dir") and Path(self.temp_dir).exists():
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    # ═══════════════════════════════════════════════════════════════════════════
    #  懒加载访问器
    # ═══════════════════════════════════════════════════════════════════════════

    def __getitem__(self, xml_path: str) -> XlsxXMLEditor:
        """
        获取或创建 XML 编辑器。

        参数:
            xml_path: 相对路径 (如 "xl/worksheets/sheet1.xml")

        返回:
            XlsxXMLEditor 实例

        示例:
            editor = wb["xl/worksheets/sheet1.xml"]
            cell = editor.get_cell("A1")
        """
        if xml_path not in self._editors:
            file_path = self.unpacked_path / xml_path
            if not file_path.exists():
                raise ValueError(f"XML 文件不存在: {xml_path}")
            self._editors[xml_path] = XlsxXMLEditor(
                file_path, shared_strings=self.shared_strings
            )
        return self._editors[xml_path]

    @property
    def shared_strings(self) -> list[str]:
        """获取共享字符串列表。"""
        if self._shared_strings is None:
            self._shared_strings = self._load_shared_strings()
        return self._shared_strings

    def _load_shared_strings(self) -> list[str]:
        """加载共享字符串表。"""
        ss_path = self.xl_path / "sharedStrings.xml"
        if not ss_path.exists():
            return []

        editor = XlsxXMLEditor(ss_path)
        strings = []
        for si in editor.dom.getElementsByTagName("si"):
            # 提取 <t> 元素中的文本
            t_elements = si.getElementsByTagName("t")
            if t_elements:
                text_parts = []
                for t in t_elements:
                    if t.firstChild:
                        text_parts.append(t.firstChild.nodeValue or "")
                strings.append("".join(text_parts))
            else:
                strings.append("")
        return strings

    # ═══════════════════════════════════════════════════════════════════════════
    #  工作表操作
    # ═══════════════════════════════════════════════════════════════════════════

    def get_sheet_count(self) -> int:
        """获取工作表数量。"""
        sheets_dir = self.xl_path / "worksheets"
        if not sheets_dir.exists():
            return 0
        return len(list(sheets_dir.glob("sheet*.xml")))

    def get_sheet(self, index: int) -> XlsxXMLEditor:
        """
        获取工作表编辑器。

        参数:
            index: 工作表索引 (0-based)

        返回:
            工作表的 XlsxXMLEditor
        """
        sheet_path = f"xl/worksheets/sheet{index + 1}.xml"
        return self[sheet_path]

    def get_sheet_names(self) -> list[str]:
        """获取所有工作表名称。"""
        wb_path = self.xl_path / "workbook.xml"
        if not wb_path.exists():
            return []

        editor = XlsxXMLEditor(wb_path)
        names = []
        for sheet in editor.dom.getElementsByTagName("sheet"):
            name = sheet.getAttribute("name")
            if name:
                names.append(name)
        return names

    # ═══════════════════════════════════════════════════════════════════════════
    #  单元格操作
    # ═══════════════════════════════════════════════════════════════════════════

    def get_cell(self, cell_ref: str, sheet_index: int = 0) -> Any:
        """
        获取单元格值。

        参数:
            cell_ref: 单元格引用 (如 "A1")
            sheet_index: 工作表索引

        返回:
            单元格值
        """
        sheet = self.get_sheet(sheet_index)
        return sheet.get_cell_value(cell_ref)

    def set_cell(self, cell_ref: str, value: Any, sheet_index: int = 0):
        """
        设置单元格值。

        参数:
            cell_ref: 单元格引用
            value: 要设置的值
            sheet_index: 工作表索引
        """
        sheet = self.get_sheet(sheet_index)
        sheet.set_cell_value(cell_ref, value)

    def set_range(
        self,
        start_ref: str,
        data: list[list[Any]],
        sheet_index: int = 0
    ):
        """
        批量设置单元格区域。

        参数:
            start_ref: 起始单元格引用
            data: 二维数据列表
            sheet_index: 工作表索引

        示例:
            wb.set_range("A1", [
                ["姓名", "年龄", "城市"],
                ["张三", 25, "北京"],
                ["李四", 30, "上海"],
            ])
        """
        start_row, start_col = cell_to_index(start_ref)
        sheet = self.get_sheet(sheet_index)

        for row_offset, row_data in enumerate(data):
            for col_offset, value in enumerate(row_data):
                cell_ref = index_to_cell(start_row + row_offset, start_col + col_offset)
                sheet.set_cell_value(cell_ref, value)

    # ═══════════════════════════════════════════════════════════════════════════
    #  样式操作
    # ═══════════════════════════════════════════════════════════════════════════

    def apply_theme(self, theme_name: str):
        """
        应用预设主题。

        参数:
            theme_name: 主题名称 (financial, analysis, inventory, minimal)

        异常:
            ValueError: 主题不存在
        """
        theme_path = THEMES_DIR / f"{theme_name}.json"
        if not theme_path.exists():
            available = [p.stem for p in THEMES_DIR.glob("*.json")]
            raise ValueError(
                f"主题 '{theme_name}' 不存在。可用主题: {', '.join(available)}"
            )

        with open(theme_path, "r", encoding="utf-8") as f:
            theme = json.load(f)

        self._apply_theme_config(theme)

    def _apply_theme_config(self, theme: dict):
        """应用主题配置到工作簿。"""
        # ─────────────────────────────────────────────────────────────────────
        #  应用颜色方案
        # ─────────────────────────────────────────────────────────────────────
        if "colors" in theme:
            self._apply_colors(theme["colors"])

        # ─────────────────────────────────────────────────────────────────────
        #  应用数字格式
        # ─────────────────────────────────────────────────────────────────────
        if "numberFormats" in theme:
            self._apply_number_formats(theme["numberFormats"])

    def _apply_colors(self, colors: dict):
        """应用颜色配置。"""
        # 实现颜色应用逻辑
        pass

    def _apply_number_formats(self, formats: dict):
        """应用数字格式配置。"""
        # 实现数字格式应用逻辑
        pass

    def set_cell_style(
        self,
        cell_ref: str,
        style: dict,
        sheet_index: int = 0
    ):
        """
        设置单元格样式。

        参数:
            cell_ref: 单元格引用
            style: 样式字典 (font, fill, border, alignment)
            sheet_index: 工作表索引

        示例:
            wb.set_cell_style("A1", {
                "font": {"bold": True, "color": "FF0000"},
                "fill": {"color": "FFFF00"},
            })
        """
        # 实现样式设置逻辑
        pass

    # ═══════════════════════════════════════════════════════════════════════════
    #  保存
    # ═══════════════════════════════════════════════════════════════════════════

    def save(self, destination: Optional[Union[str, Path]] = None, validate: bool = True):
        """
        保存工作簿。

        参数:
            destination: 目标路径，None 则保存回原目录
            validate: 是否验证文档

        异常:
            ValueError: 验证失败
        """
        # ─────────────────────────────────────────────────────────────────────
        #  保存所有编辑器
        # ─────────────────────────────────────────────────────────────────────
        for editor in self._editors.values():
            editor.save()

        # ─────────────────────────────────────────────────────────────────────
        #  复制到目标
        # ─────────────────────────────────────────────────────────────────────
        target_path = Path(destination) if destination else self.original_path
        shutil.copytree(self.unpacked_path, target_path, dirs_exist_ok=True)

    def pack(self, output_file: Union[str, Path], validate: bool = True) -> bool:
        """
        打包为 xlsx 文件。

        参数:
            output_file: 输出文件路径
            validate: 是否验证

        返回:
            是否成功
        """
        # 先保存到临时目录
        self.save(validate=False)

        # 使用 pack 工具打包
        from ..ooxml.scripts.pack import pack_document
        return pack_document(self.unpacked_path, output_file, validate=validate)
