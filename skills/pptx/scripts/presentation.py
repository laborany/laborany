#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Presentation 类                                       ║
║                                                                              ║
║  PowerPoint 演示文稿编辑库，提供幻灯片操作和 XML 编辑功能                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

Usage:
    from scripts.presentation import Presentation

    # 初始化
    pres = Presentation('unpacked')

    # 获取幻灯片编辑器
    slide = pres['ppt/slides/slide1.xml']

    # 查找并修改文本
    node = slide.get_node(tag='a:t', contains='原文本')
    slide.replace_node(node, '<a:t>新文本</a:t>')

    # 添加幻灯片
    pres.add_slide(title='新幻灯片', content='内容')

    # 保存
    pres.save()
"""

import shutil
import tempfile
from pathlib import Path

from .utilities import XMLEditor


# ═══════════════════════════════════════════════════════════════════════════════
# 常量定义
# ═══════════════════════════════════════════════════════════════════════════════

# 模板目录
TEMPLATE_DIR = Path(__file__).parent / "templates"

# 命名空间
NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types"

# 关系类型
REL_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
REL_LAYOUT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"

# 内容类型
CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"


# ═══════════════════════════════════════════════════════════════════════════════
# PptxXMLEditor 类
# ═══════════════════════════════════════════════════════════════════════════════

class PptxXMLEditor(XMLEditor):
    """
    PPTX 专用 XML 编辑器。

    继承自 XMLEditor，添加 PPTX 特定的便捷方法。
    """

    def replace_text(self, text_node, new_text):
        """
        替换文本节点内容。

        Args:
            text_node: <a:t> 元素
            new_text: 新的文本内容

        Returns:
            替换后的节点
        """
        escaped = self._escape_xml(new_text)
        return self.replace_node(text_node, f"<a:t>{escaped}</a:t>")

    def _escape_xml(self, text):
        """转义 XML 特殊字符。"""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Presentation 类
# ═══════════════════════════════════════════════════════════════════════════════

class Presentation:
    """
    PowerPoint 演示文稿管理类。

    提供幻灯片的增删改查和 XML 编辑功能。
    """

    def __init__(self, unpacked_dir):
        """
        初始化演示文稿。

        Args:
            unpacked_dir: 解包后的 PPTX 目录路径

        Raises:
            ValueError: 目录不存在或结构无效
        """
        self.original_path = Path(unpacked_dir)

        if not self.original_path.exists():
            raise ValueError(f"目录不存在: {unpacked_dir}")

        # 创建临时工作目录
        self.temp_dir = tempfile.mkdtemp(prefix="pptx_")
        self.unpacked_path = Path(self.temp_dir) / "unpacked"
        shutil.copytree(self.original_path, self.unpacked_path)

        self.ppt_path = self.unpacked_path / "ppt"

        # 编辑器缓存
        self._editors = {}

        # 加载演示文稿信息
        self._load_presentation_info()

    # ─────────────────────────────────────────────────────────────────────────
    # 编辑器访问
    # ─────────────────────────────────────────────────────────────────────────

    def __getitem__(self, xml_path: str) -> PptxXMLEditor:
        """
        获取指定 XML 文件的编辑器。

        Args:
            xml_path: 相对路径 (如 "ppt/slides/slide1.xml")

        Returns:
            PptxXMLEditor 实例

        Example:
            slide = pres['ppt/slides/slide1.xml']
            node = slide.get_node(tag='a:t', contains='标题')
        """
        if xml_path not in self._editors:
            file_path = self.unpacked_path / xml_path
            if not file_path.exists():
                raise ValueError(f"文件不存在: {xml_path}")
            self._editors[xml_path] = PptxXMLEditor(file_path)
        return self._editors[xml_path]

    # ─────────────────────────────────────────────────────────────────────────
    # 幻灯片信息
    # ─────────────────────────────────────────────────────────────────────────

    def _load_presentation_info(self):
        """加载演示文稿基本信息。"""
        pres_xml = self["ppt/presentation.xml"]

        # 获取幻灯片列表
        self.slides = []
        for sld_id in pres_xml.dom.getElementsByTagName("p:sldId"):
            self.slides.append({
                "id": sld_id.getAttribute("id"),
                "rid": sld_id.getAttribute("r:id")
            })

        # 获取下一个可用的幻灯片 ID
        self._next_slide_id = max(
            (int(s["id"]) for s in self.slides), default=255
        ) + 1

    @property
    def slide_count(self):
        """幻灯片数量。"""
        return len(self.slides)

    def get_slide_path(self, index: int) -> str:
        """
        获取幻灯片文件路径。

        Args:
            index: 幻灯片索引 (0-based)

        Returns:
            相对路径字符串
        """
        if index < 0 or index >= len(self.slides):
            raise ValueError(f"幻灯片索引越界: {index}")

        # 从关系文件获取实际路径
        pres_rels = self["ppt/_rels/presentation.xml.rels"]
        rid = self.slides[index]["rid"]

        for rel in pres_rels.dom.getElementsByTagName("Relationship"):
            if rel.getAttribute("Id") == rid:
                target = rel.getAttribute("Target")
                return f"ppt/{target}"

        raise ValueError(f"未找到幻灯片关系: {rid}")

    def get_slide(self, index: int) -> PptxXMLEditor:
        """
        获取幻灯片编辑器。

        Args:
            index: 幻灯片索引 (0-based)

        Returns:
            PptxXMLEditor 实例
        """
        path = self.get_slide_path(index)
        return self[path]

    # ─────────────────────────────────────────────────────────────────────────
    # 幻灯片操作
    # ─────────────────────────────────────────────────────────────────────────

    def add_slide(self, title: str = "", content: str = "", layout: str = "content"):
        """
        添加新幻灯片。

        Args:
            title: 幻灯片标题
            content: 幻灯片内容
            layout: 布局类型 (title, content, blank)

        Returns:
            新幻灯片的索引
        """
        # 确定新幻灯片编号
        slide_num = self.slide_count + 1
        slide_file = f"slide{slide_num}.xml"
        slide_path = self.ppt_path / "slides" / slide_file

        # 创建幻灯片 XML
        slide_xml = self._create_slide_xml(title, content, layout)
        slide_path.write_text(slide_xml, encoding="utf-8")

        # 创建关系文件
        self._create_slide_rels(slide_num)

        # 更新 presentation.xml
        self._add_slide_to_presentation(slide_num)

        # 更新 [Content_Types].xml
        self._add_slide_content_type(slide_num)

        # 刷新幻灯片列表
        self._load_presentation_info()

        return slide_num - 1

    def remove_slide(self, index: int):
        """
        删除幻灯片。

        Args:
            index: 幻灯片索引 (0-based)
        """
        if index < 0 or index >= len(self.slides):
            raise ValueError(f"幻灯片索引越界: {index}")

        slide_info = self.slides[index]
        slide_path = self.get_slide_path(index)

        # 删除幻灯片文件
        (self.unpacked_path / slide_path).unlink()

        # 删除关系文件
        slide_file = Path(slide_path).name
        rels_path = self.ppt_path / "slides" / "_rels" / f"{slide_file}.rels"
        if rels_path.exists():
            rels_path.unlink()

        # 从 presentation.xml 移除
        self._remove_slide_from_presentation(slide_info["id"])

        # 从 [Content_Types].xml 移除
        self._remove_slide_content_type(slide_path)

        # 刷新
        self._load_presentation_info()

    def move_slide(self, from_index: int, to_index: int):
        """
        移动幻灯片位置。

        Args:
            from_index: 原位置 (0-based)
            to_index: 目标位置 (0-based)
        """
        if from_index < 0 or from_index >= len(self.slides):
            raise ValueError(f"原位置越界: {from_index}")
        if to_index < 0 or to_index >= len(self.slides):
            raise ValueError(f"目标位置越界: {to_index}")

        pres_xml = self["ppt/presentation.xml"]
        sld_id_lst = pres_xml.dom.getElementsByTagName("p:sldIdLst")[0]
        sld_ids = list(sld_id_lst.getElementsByTagName("p:sldId"))

        # 移动节点
        moving = sld_ids[from_index]
        sld_id_lst.removeChild(moving)

        if to_index >= len(sld_ids) - 1:
            sld_id_lst.appendChild(moving)
        else:
            target = sld_ids[to_index] if to_index < from_index else sld_ids[to_index + 1]
            sld_id_lst.insertBefore(moving, target)

        self._load_presentation_info()

    # ─────────────────────────────────────────────────────────────────────────
    # 文本操作
    # ─────────────────────────────────────────────────────────────────────────

    def find_text(self, text: str):
        """
        在所有幻灯片中搜索文本。

        Args:
            text: 要搜索的文本

        Returns:
            List[dict]: 包含 slide_index, node 的匹配列表
        """
        results = []

        for i in range(self.slide_count):
            slide = self.get_slide(i)
            for elem in slide.dom.getElementsByTagName("a:t"):
                if text in slide._get_element_text(elem):
                    results.append({"slide_index": i, "node": elem})

        return results

    def replace_all_text(self, old_text: str, new_text: str):
        """
        在所有幻灯片中替换文本。

        Args:
            old_text: 原文本
            new_text: 新文本

        Returns:
            int: 替换次数
        """
        count = 0
        matches = self.find_text(old_text)

        for match in matches:
            slide = self.get_slide(match["slide_index"])
            node = match["node"]

            # 获取当前文本并替换
            current = slide._get_element_text(node)
            updated = current.replace(old_text, new_text)
            slide.replace_text(node, updated)
            count += 1

        return count

    # ─────────────────────────────────────────────────────────────────────────
    # 保存与清理
    # ─────────────────────────────────────────────────────────────────────────

    def save(self, destination=None):
        """
        保存所有修改。

        Args:
            destination: 目标目录，默认保存回原目录
        """
        # 保存所有编辑器
        for editor in self._editors.values():
            editor.save()

        # 复制到目标
        target = Path(destination) if destination else self.original_path
        shutil.copytree(self.unpacked_path, target, dirs_exist_ok=True)

    def __del__(self):
        """清理临时目录。"""
        if hasattr(self, "temp_dir") and Path(self.temp_dir).exists():
            shutil.rmtree(self.temp_dir)

    # ─────────────────────────────────────────────────────────────────────────
    # 内部方法：幻灯片创建
    # ─────────────────────────────────────────────────────────────────────────

    def _create_slide_xml(self, title: str, content: str, layout: str) -> str:
        """生成幻灯片 XML 内容。"""
        title_escaped = self._escape_xml(title)
        content_escaped = self._escape_xml(content)

        return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="zh-CN"/>
              <a:t>{title_escaped}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="zh-CN"/>
              <a:t>{content_escaped}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>'''

    def _create_slide_rels(self, slide_num: int):
        """创建幻灯片关系文件。"""
        rels_dir = self.ppt_path / "slides" / "_rels"
        rels_dir.mkdir(parents=True, exist_ok=True)

        rels_path = rels_dir / f"slide{slide_num}.xml.rels"
        rels_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>
</Relationships>'''

        rels_path.write_text(rels_xml, encoding="utf-8")

    def _add_slide_to_presentation(self, slide_num: int):
        """将幻灯片添加到 presentation.xml。"""
        pres_xml = self["ppt/presentation.xml"]
        pres_rels = self["ppt/_rels/presentation.xml.rels"]

        # 添加关系
        next_rid = pres_rels.get_next_rid()
        rel_xml = f'<Relationship Id="{next_rid}" Type="{REL_SLIDE}" Target="slides/slide{slide_num}.xml"/>'
        rels_root = pres_rels.dom.documentElement
        pres_rels.append_to(rels_root, rel_xml)

        # 添加幻灯片 ID
        sld_id_lst = pres_xml.dom.getElementsByTagName("p:sldIdLst")[0]
        sld_id_xml = f'<p:sldId id="{self._next_slide_id}" r:id="{next_rid}"/>'
        pres_xml.append_to(sld_id_lst, sld_id_xml)

        self._next_slide_id += 1

    def _add_slide_content_type(self, slide_num: int):
        """添加幻灯片内容类型声明。"""
        ct_xml = self["[Content_Types].xml"]
        root = ct_xml.dom.documentElement

        override_xml = f'<Override PartName="/ppt/slides/slide{slide_num}.xml" ContentType="{CT_SLIDE}"/>'
        ct_xml.append_to(root, override_xml)

    def _remove_slide_from_presentation(self, slide_id: str):
        """从 presentation.xml 移除幻灯片。"""
        pres_xml = self["ppt/presentation.xml"]

        for sld_id in pres_xml.dom.getElementsByTagName("p:sldId"):
            if sld_id.getAttribute("id") == slide_id:
                sld_id.parentNode.removeChild(sld_id)
                break

    def _remove_slide_content_type(self, slide_path: str):
        """移除幻灯片内容类型声明。"""
        ct_xml = self["[Content_Types].xml"]
        part_name = f"/{slide_path}"

        for override in ct_xml.dom.getElementsByTagName("Override"):
            if override.getAttribute("PartName") == part_name:
                override.parentNode.removeChild(override)
                break

    def _escape_xml(self, text: str) -> str:
        """转义 XML 特殊字符。"""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

    # ─────────────────────────────────────────────────────────────────────────
    # ID 管理
    # ─────────────────────────────────────────────────────────────────────────

    def get_next_slide_id(self) -> int:
        """获取下一个可用的幻灯片 ID。"""
        return self._next_slide_id

    def get_next_rid(self, rels_path: str) -> str:
        """获取指定关系文件的下一个可用 rId。"""
        return self[rels_path].get_next_rid()
