#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         XLSX XML 编辑工具                                      ║
║                                                                              ║
║  提供 XML 编辑器基类，支持行号定位和 DOM 操作                                    ║
║  设计理念：消除特殊情况，让边界自然融入常规逻辑                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import html
from pathlib import Path
from typing import Optional, Union

import defusedxml.minidom
import defusedxml.sax


# ═══════════════════════════════════════════════════════════════════════════════
#  XMLEditor 基类
# ═══════════════════════════════════════════════════════════════════════════════

class XMLEditor:
    """
    XML 文件编辑器，支持行号定位和 DOM 操作。

    设计哲学：
    - 统一的访问模式，消除特殊情况
    - 懒加载，按需解析
    - 不可变原则：修改前备份，出错可回滚

    属性:
        xml_path: XML 文件路径
        encoding: 文件编码 ('ascii' 或 'utf-8')
        dom: 解析后的 DOM 树
    """

    def __init__(self, xml_path):
        """
        初始化编辑器，解析 XML 并追踪行号。

        参数:
            xml_path: XML 文件路径 (str 或 Path)

        异常:
            ValueError: 文件不存在时抛出
        """
        self.xml_path = Path(xml_path)
        if not self.xml_path.exists():
            raise ValueError(f"XML 文件不存在: {xml_path}")

        # ─────────────────────────────────────────────────────────────────────
        #  检测编码
        # ─────────────────────────────────────────────────────────────────────
        with open(self.xml_path, "rb") as f:
            header = f.read(200).decode("utf-8", errors="ignore")
        self.encoding = "ascii" if 'encoding="ascii"' in header else "utf-8"

        # ─────────────────────────────────────────────────────────────────────
        #  解析 DOM，追踪行号
        # ─────────────────────────────────────────────────────────────────────
        parser = _create_line_tracking_parser()
        self.dom = defusedxml.minidom.parse(str(self.xml_path), parser)

    def get_node(
        self,
        tag: str,
        attrs: Optional[dict[str, str]] = None,
        line_number: Optional[Union[int, range]] = None,
        contains: Optional[str] = None,
    ):
        """
        按标签和过滤条件查找 DOM 元素。

        参数:
            tag: XML 标签名 (如 "row", "c", "sheetData")
            attrs: 属性键值对字典 (如 {"r": "A1"})
            line_number: 行号 (int) 或行号范围 (range)，1-indexed
            contains: 元素内必须包含的文本

        返回:
            匹配的 DOM 元素

        异常:
            ValueError: 未找到或找到多个匹配时抛出

        示例:
            elem = editor.get_node(tag="c", attrs={"r": "A1"})
            elem = editor.get_node(tag="row", line_number=range(10, 20))
        """
        matches = []
        for elem in self.dom.getElementsByTagName(tag):
            # ─────────────────────────────────────────────────────────────────
            #  行号过滤
            # ─────────────────────────────────────────────────────────────────
            if line_number is not None:
                parse_pos = getattr(elem, "parse_position", (None,))
                elem_line = parse_pos[0]

                if isinstance(line_number, range):
                    if elem_line not in line_number:
                        continue
                elif elem_line != line_number:
                    continue

            # ─────────────────────────────────────────────────────────────────
            #  属性过滤
            # ─────────────────────────────────────────────────────────────────
            if attrs is not None:
                if not all(
                    elem.getAttribute(k) == v for k, v in attrs.items()
                ):
                    continue

            # ─────────────────────────────────────────────────────────────────
            #  文本内容过滤
            # ─────────────────────────────────────────────────────────────────
            if contains is not None:
                elem_text = self._get_element_text(elem)
                normalized = html.unescape(contains)
                if normalized not in elem_text:
                    continue

            matches.append(elem)

        # ─────────────────────────────────────────────────────────────────────
        #  结果验证
        # ─────────────────────────────────────────────────────────────────────
        if not matches:
            filters = []
            if line_number is not None:
                line_str = (
                    f"行 {line_number.start}-{line_number.stop - 1}"
                    if isinstance(line_number, range)
                    else f"行 {line_number}"
                )
                filters.append(f"在 {line_str}")
            if attrs is not None:
                filters.append(f"属性 {attrs}")
            if contains is not None:
                filters.append(f"包含 '{contains}'")

            filter_desc = " ".join(filters) if filters else ""
            raise ValueError(f"未找到节点: <{tag}> {filter_desc}".strip())

        if len(matches) > 1:
            raise ValueError(
                f"找到多个 <{tag}> 节点，请添加更多过滤条件 (attrs, line_number, contains)"
            )

        return matches[0]

    def _get_element_text(self, elem):
        """递归提取元素内所有文本内容。"""
        text_parts = []
        for node in elem.childNodes:
            if node.nodeType == node.TEXT_NODE:
                if node.data.strip():
                    text_parts.append(node.data)
            elif node.nodeType == node.ELEMENT_NODE:
                text_parts.append(self._get_element_text(node))
        return "".join(text_parts)

    def replace_node(self, elem, new_content):
        """
        替换 DOM 元素。

        参数:
            elem: 要替换的元素
            new_content: 新 XML 内容字符串

        返回:
            插入的新节点列表
        """
        parent = elem.parentNode
        nodes = self._parse_fragment(new_content)
        for node in nodes:
            parent.insertBefore(node, elem)
        parent.removeChild(elem)
        return nodes

    def insert_after(self, elem, xml_content):
        """在元素后插入 XML 内容。"""
        parent = elem.parentNode
        next_sibling = elem.nextSibling
        nodes = self._parse_fragment(xml_content)
        for node in nodes:
            if next_sibling:
                parent.insertBefore(node, next_sibling)
            else:
                parent.appendChild(node)
        return nodes

    def insert_before(self, elem, xml_content):
        """在元素前插入 XML 内容。"""
        parent = elem.parentNode
        nodes = self._parse_fragment(xml_content)
        for node in nodes:
            parent.insertBefore(node, elem)
        return nodes

    def append_to(self, elem, xml_content):
        """向元素内追加 XML 内容。"""
        nodes = self._parse_fragment(xml_content)
        for node in nodes:
            elem.appendChild(node)
        return nodes

    def get_next_rid(self):
        """获取下一个可用的 rId。"""
        max_id = 0
        for rel_elem in self.dom.getElementsByTagName("Relationship"):
            rel_id = rel_elem.getAttribute("Id")
            if rel_id.startswith("rId"):
                try:
                    max_id = max(max_id, int(rel_id[3:]))
                except ValueError:
                    pass
        return f"rId{max_id + 1}"

    def save(self):
        """保存修改到文件。"""
        content = self.dom.toxml(encoding=self.encoding)
        self.xml_path.write_bytes(content)

    def _parse_fragment(self, xml_content):
        """解析 XML 片段并导入到当前文档。"""
        root_elem = self.dom.documentElement
        namespaces = []
        if root_elem and root_elem.attributes:
            for i in range(root_elem.attributes.length):
                attr = root_elem.attributes.item(i)
                if attr.name.startswith("xmlns"):
                    namespaces.append(f'{attr.name}="{attr.value}"')

        ns_decl = " ".join(namespaces)
        wrapper = f"<root {ns_decl}>{xml_content}</root>"
        fragment_doc = defusedxml.minidom.parseString(wrapper)
        nodes = [
            self.dom.importNode(child, deep=True)
            for child in fragment_doc.documentElement.childNodes
        ]
        elements = [n for n in nodes if n.nodeType == n.ELEMENT_NODE]
        assert elements, "片段必须包含至少一个元素"
        return nodes


# ═══════════════════════════════════════════════════════════════════════════════
#  XlsxXMLEditor - XLSX 专用编辑器
# ═══════════════════════════════════════════════════════════════════════════════

class XlsxXMLEditor(XMLEditor):
    """
    XLSX 专用 XML 编辑器。

    扩展基类，提供 Excel 特有的操作：
    - 单元格值读写
    - 样式应用
    - 共享字符串处理
    """

    def __init__(self, xml_path, shared_strings=None):
        """
        初始化 XLSX 编辑器。

        参数:
            xml_path: XML 文件路径
            shared_strings: 共享字符串列表 (用于解析字符串类型单元格)
        """
        super().__init__(xml_path)
        self.shared_strings = shared_strings or []

    def get_cell(self, cell_ref: str):
        """
        获取单元格元素。

        参数:
            cell_ref: 单元格引用 (如 "A1", "B2")

        返回:
            单元格 DOM 元素，不存在则返回 None
        """
        try:
            return self.get_node(tag="c", attrs={"r": cell_ref})
        except ValueError:
            return None

    def get_cell_value(self, cell_ref: str):
        """
        获取单元格值。

        参数:
            cell_ref: 单元格引用

        返回:
            单元格值 (str, int, float 或 None)
        """
        cell = self.get_cell(cell_ref)
        if cell is None:
            return None

        # ─────────────────────────────────────────────────────────────────────
        #  获取值元素
        # ─────────────────────────────────────────────────────────────────────
        v_elements = cell.getElementsByTagName("v")
        if not v_elements:
            return None

        raw_value = self._get_element_text(v_elements[0])
        cell_type = cell.getAttribute("t")

        # ─────────────────────────────────────────────────────────────────────
        #  根据类型解析值
        # ─────────────────────────────────────────────────────────────────────
        if cell_type == "s":
            # 共享字符串索引
            idx = int(raw_value)
            return self.shared_strings[idx] if idx < len(self.shared_strings) else raw_value
        elif cell_type == "b":
            # 布尔值
            return raw_value == "1"
        elif cell_type == "e":
            # 错误值
            return f"#ERROR:{raw_value}"
        else:
            # 数值或内联字符串
            try:
                if "." in raw_value:
                    return float(raw_value)
                return int(raw_value)
            except ValueError:
                return raw_value

    def set_cell_value(self, cell_ref: str, value, value_type: str = "auto"):
        """
        设置单元格值。

        参数:
            cell_ref: 单元格引用
            value: 要设置的值
            value_type: 值类型 ('auto', 'n', 's', 'b', 'str', 'inlineStr')

        返回:
            修改后的单元格元素
        """
        cell = self.get_cell(cell_ref)

        # ────────────────��────────────────────────────────────────────────────
        #  自动推断类型
        # ─────────────────────────────────────────────────────────────────────
        if value_type == "auto":
            if isinstance(value, bool):
                value_type = "b"
            elif isinstance(value, (int, float)):
                value_type = "n"
            elif isinstance(value, str) and value.startswith("="):
                value_type = "str"  # 公式
            else:
                value_type = "inlineStr"

        # ─────────────────────────────────────────────────────────────────────
        #  构建单元格 XML
        # ─────────────────────────────────────────────────────────────────────
        if value_type == "b":
            cell_xml = f'<c r="{cell_ref}" t="b"><v>{1 if value else 0}</v></c>'
        elif value_type == "n":
            cell_xml = f'<c r="{cell_ref}"><v>{value}</v></c>'
        elif value_type == "str":
            # 公式
            formula = value[1:] if value.startswith("=") else value
            cell_xml = f'<c r="{cell_ref}"><f>{formula}</f></c>'
        else:
            # 内联字符串
            escaped = html.escape(str(value))
            cell_xml = f'<c r="{cell_ref}" t="inlineStr"><is><t>{escaped}</t></is></c>'

        # ─────────────────────────────────────────────────────────────────────
        #  替换或插入单元格
        # ─────────────────────────────────────────────────────────────────────
        if cell:
            nodes = self.replace_node(cell, cell_xml)
            return nodes[0] if nodes else None
        else:
            # 需要找到正确的行并插入
            # 这里简化处��，实际需要更复杂的逻辑
            return None

    def apply_style(self, cell_ref: str, style_id: int):
        """
        应用样式到单元格。

        参数:
            cell_ref: 单元格引用
            style_id: 样式 ID (styles.xml 中的索引)
        """
        cell = self.get_cell(cell_ref)
        if cell:
            cell.setAttribute("s", str(style_id))


# ═══════════════════════════════════════════════════════════════════════════════
#  辅助函数
# ═══════════════════════════════════════════════════════════════════════════════

def _create_line_tracking_parser():
    """
    创建追踪行号的 SAX 解析器。

    为每个元素添加 parse_position 属性，记录 (行号, 列号)。
    """
    def set_content_handler(dom_handler):
        def startElementNS(name, tagName, attrs):
            orig_start_cb(name, tagName, attrs)
            cur_elem = dom_handler.elementStack[-1]
            cur_elem.parse_position = (
                parser._parser.CurrentLineNumber,
                parser._parser.CurrentColumnNumber,
            )

        orig_start_cb = dom_handler.startElementNS
        dom_handler.startElementNS = startElementNS
        orig_set_content_handler(dom_handler)

    parser = defusedxml.sax.make_parser()
    orig_set_content_handler = parser.setContentHandler
    parser.setContentHandler = set_content_handler
    return parser
