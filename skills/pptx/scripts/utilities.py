#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         XML 编辑工具                                          ║
║                                                                              ║
║  提供 OOXML 文件的 DOM 操作和行号追踪功能                                        ║
║  复用自 docx 技能模块，适配 PPTX 使用                                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

Usage:
    editor = XMLEditor("slide1.xml")

    # 按行号查找节点
    elem = editor.get_node(tag="a:t", line_number=42)

    # 按属性查找节点
    elem = editor.get_node(tag="p:sp", attrs={"name": "Title 1"})

    # 按文本内容查找
    elem = editor.get_node(tag="a:t", contains="标题文本")

    # 替换、插入、追加
    editor.replace_node(elem, "<a:t>新文本</a:t>")
    editor.insert_after(elem, "<a:r><a:t>追加</a:t></a:r>")

    # 保存
    editor.save()
"""

import html
from pathlib import Path
from typing import Optional, Union

import defusedxml.minidom
import defusedxml.sax


# ═══════════════════════════════════════════════════════════════════════════════
# XMLEditor 类
# ═══════════════════════════════════════════════════════════════════════════════

class XMLEditor:
    """
    XML 文件编辑器，支持行号追踪和 DOM 操作。

    解析 XML 文件时自动记录每个元素的原始行号和列号，
    便于根据 Read 工具输出的行号定位节点。

    Attributes:
        xml_path: XML 文件路径
        encoding: 文件编码 ('ascii' 或 'utf-8')
        dom: 带有 parse_position 属性的 DOM 树
    """

    def __init__(self, xml_path):
        """
        初始化编辑器，解析 XML 文件并追踪行号。

        Args:
            xml_path: XML 文件路径 (str 或 Path)

        Raises:
            ValueError: 文件不存在时抛出
        """
        self.xml_path = Path(xml_path)
        if not self.xml_path.exists():
            raise ValueError(f"XML 文件不存在: {xml_path}")

        # 检测编码
        with open(self.xml_path, "rb") as f:
            header = f.read(200).decode("utf-8", errors="ignore")
        self.encoding = "ascii" if 'encoding="ascii"' in header else "utf-8"

        # 使用行号追踪解析器
        parser = _create_line_tracking_parser()
        self.dom = defusedxml.minidom.parse(str(self.xml_path), parser)

    # ─────────────────────────────────────────────────────────────────────────
    # 节点查找
    # ─────────────────────────────────────────────────────────────────────────

    def get_node(
        self,
        tag: str,
        attrs: Optional[dict[str, str]] = None,
        line_number: Optional[Union[int, range]] = None,
        contains: Optional[str] = None,
    ):
        """
        按标签和条件查找 DOM 元素。

        必须精确匹配一个节点，否则抛出异常。

        Args:
            tag: XML 标签名 (如 "a:t", "p:sp", "a:r")
            attrs: 属性字典，所有属性必须匹配
            line_number: 行号 (int) 或行号范围 (range)，1-indexed
            contains: 元素内必须包含的文本

        Returns:
            defusedxml.minidom.Element: 匹配的 DOM 元素

        Raises:
            ValueError: 未找到或找到多个匹配

        Example:
            elem = editor.get_node(tag="a:t", line_number=42)
            elem = editor.get_node(tag="p:sp", attrs={"name": "Title 1"})
            elem = editor.get_node(tag="a:t", contains="标题")
        """
        matches = []

        for elem in self.dom.getElementsByTagName(tag):
            # 行号过滤
            if line_number is not None:
                parse_pos = getattr(elem, "parse_position", (None,))
                elem_line = parse_pos[0]

                if isinstance(line_number, range):
                    if elem_line not in line_number:
                        continue
                elif elem_line != line_number:
                    continue

            # 属性过滤
            if attrs is not None:
                if not all(
                    elem.getAttribute(k) == v for k, v in attrs.items()
                ):
                    continue

            # 文本内容过滤
            if contains is not None:
                elem_text = self._get_element_text(elem)
                normalized = html.unescape(contains)
                if normalized not in elem_text:
                    continue

            matches.append(elem)

        # 结果验证
        if not matches:
            filters = self._build_filter_desc(tag, attrs, line_number, contains)
            raise ValueError(f"未找到节点: {filters}")

        if len(matches) > 1:
            raise ValueError(
                f"找到 {len(matches)} 个 <{tag}> 节点，请添加更多过滤条件"
            )

        return matches[0]

    def _get_element_text(self, elem):
        """递归提取元素内所有文本内容。"""
        parts = []
        for node in elem.childNodes:
            if node.nodeType == node.TEXT_NODE:
                if node.data.strip():
                    parts.append(node.data)
            elif node.nodeType == node.ELEMENT_NODE:
                parts.append(self._get_element_text(node))
        return "".join(parts)

    def _build_filter_desc(self, tag, attrs, line_number, contains):
        """构建过滤条件描述字符串。"""
        parts = [f"<{tag}>"]
        if line_number:
            if isinstance(line_number, range):
                parts.append(f"行 {line_number.start}-{line_number.stop - 1}")
            else:
                parts.append(f"行 {line_number}")
        if attrs:
            parts.append(f"属性 {attrs}")
        if contains:
            parts.append(f"包含 '{contains}'")
        return " ".join(parts)

    # ─────────────────────────────────────────────────────────────────────────
    # DOM 操作
    # ─────────────────────────────────────────────────────────────────────────

    def replace_node(self, elem, new_content):
        """
        替换节点为新的 XML 内容。

        Args:
            elem: 要替换的 DOM 元素
            new_content: 新的 XML 字符串

        Returns:
            List[Node]: 插入的新节点列表
        """
        parent = elem.parentNode
        nodes = self._parse_fragment(new_content)
        for node in nodes:
            parent.insertBefore(node, elem)
        parent.removeChild(elem)
        return nodes

    def insert_after(self, elem, xml_content):
        """
        在元素后插入 XML 内容。

        Args:
            elem: 参考元素
            xml_content: 要插入的 XML 字符串

        Returns:
            List[Node]: 插入的新节点列表
        """
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
        """
        在元素前插入 XML 内容。

        Args:
            elem: 参考元素
            xml_content: 要插入的 XML 字符串

        Returns:
            List[Node]: 插入的新节点列表
        """
        parent = elem.parentNode
        nodes = self._parse_fragment(xml_content)
        for node in nodes:
            parent.insertBefore(node, elem)
        return nodes

    def append_to(self, elem, xml_content):
        """
        向元素内追加 XML 内容。

        Args:
            elem: 父元素
            xml_content: 要追加的 XML 字符串

        Returns:
            List[Node]: 插入的新节点列表
        """
        nodes = self._parse_fragment(xml_content)
        for node in nodes:
            elem.appendChild(node)
        return nodes

    def remove_node(self, elem):
        """
        删除节点。

        Args:
            elem: 要删除的 DOM 元素
        """
        elem.parentNode.removeChild(elem)

    # ─────────────────────────────────────────────────────────────────────────
    # 关系 ID 管理
    # ─────────────────────────────────────────────────────────────────────────

    def get_next_rid(self):
        """获取下一个可用的关系 ID (rIdN)。"""
        max_id = 0
        for rel in self.dom.getElementsByTagName("Relationship"):
            rid = rel.getAttribute("Id")
            if rid.startswith("rId"):
                try:
                    max_id = max(max_id, int(rid[3:]))
                except ValueError:
                    pass
        return f"rId{max_id + 1}"

    # ─────────────────────────────────────────────────────────────────────────
    # 保存
    # ─────────────────────────────────────────────────────────────────────────

    def save(self):
        """保存修改后的 XML 到文件。"""
        content = self.dom.toxml(encoding=self.encoding)
        self.xml_path.write_bytes(content)

    # ─────────────────────────────────────────────────────────────────────────
    # 内部方法
    # ─────────────────────────────────────────────────────────────────────────

    def _parse_fragment(self, xml_content):
        """
        解析 XML 片段并导入到当前文档。

        Args:
            xml_content: XML 字符串片段

        Returns:
            List[Node]: 导入的节点列表
        """
        # 提取根元素的命名空间声明
        root = self.dom.documentElement
        namespaces = []
        if root and root.attributes:
            for i in range(root.attributes.length):
                attr = root.attributes.item(i)
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
        assert elements, "XML 片段必须包含至少一个元素"

        return nodes


# ═══════════════════════════════════════════════════════════════════════════════
# 行号追踪解析器
# ═══════════════════════════════════════════════════════════════════════════════

def _create_line_tracking_parser():
    """
    创建带行号追踪的 SAX 解析器。

    解析时自动在每个元素上设置 parse_position 属性，
    值为 (行号, 列号) 元组。

    Returns:
        XMLReader: 配置好的 SAX 解析器
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
