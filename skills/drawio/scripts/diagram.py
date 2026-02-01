"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Draw.io Diagram 模块                                  ║
║                                                                              ║
║  提供 draw.io 图表的创建、编辑和导出功能                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import json
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime


# ═══════════════════════════════════════════════════════════════════════════════
#  数据结构定义
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Node:
    """图表节点"""
    id: str
    label: str
    shape: str = "rectangle"
    x: float = 0
    y: float = 0
    width: float = 120
    height: float = 60
    style: Dict[str, Any] = field(default_factory=dict)
    parent: Optional[str] = None


@dataclass
class Edge:
    """图表连线"""
    id: str
    source: str
    target: str
    label: str = ""
    style: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Group:
    """图表分组"""
    id: str
    label: str
    children: List[str] = field(default_factory=list)
    x: float = 0
    y: float = 0
    width: float = 300
    height: float = 200
    style: Dict[str, Any] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
#  形状和样式预设
# ═══════════════════════════════════════════════════════════════════════════════

SHAPE_STYLES = {
    "rectangle": "rounded=0;",
    "rounded": "rounded=1;",
    "ellipse": "shape=ellipse;",
    "rhombus": "shape=rhombus;",
    "parallelogram": "shape=parallelogram;",
    "hexagon": "shape=hexagon;",
    "cylinder": "shape=cylinder;",
    "cloud": "shape=cloud;",
    "document": "shape=document;",
    "triangle": "shape=triangle;",
}

DEFAULT_COLORS = {
    "start": {"fill": "#d5e8d4", "stroke": "#82b366"},
    "end": {"fill": "#f8cecc", "stroke": "#b85450"},
    "process": {"fill": "#dae8fc", "stroke": "#6c8ebf"},
    "decision": {"fill": "#fff2cc", "stroke": "#d6b656"},
    "io": {"fill": "#e1d5e7", "stroke": "#9673a6"},
    "default": {"fill": "#ffffff", "stroke": "#000000"},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  Diagram 类
# ═══════════════════════════════════════════════════════════════════════════════

class Diagram:
    """
    Draw.io 图表类

    提供图表的创建、编辑、布局和导出功能。
    """

    def __init__(self, title: str = "Diagram", theme: str = "default"):
        """
        初始化图表

        参数:
            title: 图表标题
            theme: 主题名称
        """
        self.title = title
        self.theme = self._load_theme(theme)
        self.nodes: Dict[str, Node] = {}
        self.edges: Dict[str, Edge] = {}
        self.groups: Dict[str, Group] = {}
        self._edge_counter = 0

    # ─────────────────────────────────────────────────────────────────────────
    #  主题加载
    # ─────────────────────────────────────────────────────────────────────────

    def _load_theme(self, theme_name: str) -> Dict:
        """加载主题配置"""
        theme_path = Path(__file__).parent.parent / "themes" / f"{theme_name}.json"
        if theme_path.exists():
            with open(theme_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return self._default_theme()

    def _default_theme(self) -> Dict:
        """默认主题"""
        return {
            "colors": {
                "primary": "1a365d",
                "secondary": "2c5282",
                "background": "ffffff",
                "text": "2d3748",
            },
            "fonts": {
                "family": "Microsoft YaHei",
                "size": 12,
            },
        }

    # ─────────────────────────────────────────────────────────────────────────
    #  节点操作
    # ─────────────────────────────────────────────────────────────────────────

    def add_node(
        self,
        id: str,
        label: str,
        shape: str = "rectangle",
        x: float = 0,
        y: float = 0,
        width: float = None,
        height: float = None,
        style: str = None,
        **extra
    ) -> Node:
        """
        添加节点

        参数:
            id: 节点唯一标识
            label: 节点标签
            shape: 形状类型
            x, y: 位置坐标
            width, height: 尺寸（None 则自动计算）
            style: 预设样式名称
            **extra: 额外样式属性
        """
        # 自动计算尺寸
        if width is None or height is None:
            auto_w, auto_h = self._calc_node_size(label)
            width = width or auto_w
            height = height or auto_h

        # 获取样式
        style_dict = self._get_node_style(shape, style, extra)

        node = Node(
            id=id,
            label=label,
            shape=shape,
            x=x,
            y=y,
            width=width,
            height=height,
            style=style_dict,
        )
        self.nodes[id] = node
        return node

    def update_node(self, id: str, **updates) -> Optional[Node]:
        """
        更新节点属性

        参数:
            id: 节点 ID
            **updates: 要更新的属性
        """
        if id not in self.nodes:
            return None

        node = self.nodes[id]
        for key, value in updates.items():
            if hasattr(node, key):
                setattr(node, key, value)

        # 如果更新了标签，重新计算尺寸
        if "label" in updates:
            node.width, node.height = self._calc_node_size(node.label)

        return node

    def remove_node(self, id: str) -> bool:
        """删除节点及其相关连线"""
        if id not in self.nodes:
            return False

        del self.nodes[id]

        # 删除相关连线
        edges_to_remove = [
            eid for eid, e in self.edges.items()
            if e.source == id or e.target == id
        ]
        for eid in edges_to_remove:
            del self.edges[eid]

        return True

    def find_nodes(self, label_contains: str) -> List[Node]:
        """按标签搜索节点"""
        return [n for n in self.nodes.values() if label_contains in n.label]

    # ─────────────────────────────────────────────────────────────────────────
    #  连线操作
    # ─────────────────────────────────────────────────────────────────────────

    def add_edge(
        self,
        source: str,
        target: str,
        label: str = "",
        id: str = None,
        **style
    ) -> Optional[Edge]:
        """
        添加连线

        参数:
            source: 起点节点 ID
            target: 终点节点 ID
            label: 连线标签
            id: 连线 ID（None 则自动生成）
            **style: 样式属性
        """
        if source not in self.nodes or target not in self.nodes:
            return None

        if id is None:
            self._edge_counter += 1
            id = f"e{self._edge_counter}"

        edge = Edge(id=id, source=source, target=target, label=label, style=style)
        self.edges[id] = edge
        return edge

    def remove_edge(self, id: str) -> bool:
        """删除连线"""
        if id not in self.edges:
            return False
        del self.edges[id]
        return True

    # ─────────────────────────────────────────────────────────────────────────
    #  分组操作
    # ─────────────────────────────────────────────────────────────────────────

    def add_group(
        self,
        id: str,
        label: str,
        children: List[str],
        **style
    ) -> Group:
        """
        添加分组

        参数:
            id: 分组 ID
            label: 分组标题
            children: 子节点 ID 列表
            **style: 样式属性
        """
        group = Group(id=id, label=label, children=children, style=style)

        # 更新子节点的 parent
        for child_id in children:
            if child_id in self.nodes:
                self.nodes[child_id].parent = id

        self.groups[id] = group
        return group

    # ─────────────────────────────────────────────────────────────────────────
    #  布局算法
    # ─────────────────────────────────────────────────────────────────────────

    def auto_layout(
        self,
        direction: str = "TB",
        spacing: Tuple[float, float] = (80, 60)
    ):
        """
        自动布局

        参数:
            direction: TB/BT/LR/RL
            spacing: (水平间距, 垂直间距)
        """
        if not self.nodes:
            return

        # 构建邻接表
        adj = {nid: [] for nid in self.nodes}
        in_degree = {nid: 0 for nid in self.nodes}

        for edge in self.edges.values():
            adj[edge.source].append(edge.target)
            in_degree[edge.target] += 1

        # 拓扑排序分层
        levels = []
        queue = [nid for nid, deg in in_degree.items() if deg == 0]

        while queue:
            levels.append(queue[:])
            next_queue = []
            for nid in queue:
                for child in adj[nid]:
                    in_degree[child] -= 1
                    if in_degree[child] == 0:
                        next_queue.append(child)
            queue = next_queue

        # 处理未分配的节点（可能存在环）
        remaining = [nid for nid in self.nodes if not any(nid in lvl for lvl in levels)]
        if remaining:
            levels.append(remaining)

        # 计算坐标
        h_spacing, v_spacing = spacing
        for level_idx, level in enumerate(levels):
            for node_idx, nid in enumerate(level):
                node = self.nodes[nid]
                if direction == "TB":
                    node.x = node_idx * (node.width + h_spacing)
                    node.y = level_idx * (node.height + v_spacing)
                elif direction == "LR":
                    node.x = level_idx * (node.width + h_spacing)
                    node.y = node_idx * (node.height + v_spacing)
                elif direction == "BT":
                    node.x = node_idx * (node.width + h_spacing)
                    node.y = (len(levels) - 1 - level_idx) * (node.height + v_spacing)
                elif direction == "RL":
                    node.x = (len(levels) - 1 - level_idx) * (node.width + h_spacing)
                    node.y = node_idx * (node.height + v_spacing)

        # 居中对齐
        self._center_levels(levels, direction, h_spacing)

        # 更新分组边界
        self._update_group_bounds()

    def _center_levels(self, levels: List[List[str]], direction: str, spacing: float):
        """居中对齐各层"""
        if not levels:
            return

        max_width = max(
            sum(self.nodes[nid].width for nid in lvl) + spacing * (len(lvl) - 1)
            for lvl in levels
        )

        for level in levels:
            level_width = sum(self.nodes[nid].width for nid in level) + spacing * (len(level) - 1)
            offset = (max_width - level_width) / 2

            if direction in ("TB", "BT"):
                for nid in level:
                    self.nodes[nid].x += offset

    def _update_group_bounds(self):
        """更新分组边界"""
        padding = 20
        title_height = 30

        for group in self.groups.values():
            if not group.children:
                continue

            child_nodes = [self.nodes[cid] for cid in group.children if cid in self.nodes]
            if not child_nodes:
                continue

            min_x = min(n.x for n in child_nodes) - padding
            min_y = min(n.y for n in child_nodes) - padding - title_height
            max_x = max(n.x + n.width for n in child_nodes) + padding
            max_y = max(n.y + n.height for n in child_nodes) + padding

            group.x = min_x
            group.y = min_y
            group.width = max_x - min_x
            group.height = max_y - min_y

    # ─────────────────────────────────────────────────────────────────────────
    #  辅助方法
    # ─────────────────────────────────────────────────────────────────────────

    def _calc_node_size(self, label: str, font_size: int = 12, padding: int = 20) -> Tuple[float, float]:
        """根据标签计算节点尺寸"""
        lines = label.split('\n')
        max_width = 0

        for line in lines:
            width = 0
            for char in line:
                if ord(char) > 127:  # 中文字符
                    width += font_size * 1.2
                else:  # ASCII 字符
                    width += font_size * 0.6
            max_width = max(max_width, width)

        width = max(80, max_width + padding * 2)
        height = max(40, len(lines) * (font_size + 4) + padding * 2)

        return width, height

    def _get_node_style(self, shape: str, style_name: str, extra: Dict) -> Dict:
        """获取节点样式"""
        style = {}

        # 基础形状样式
        if shape in SHAPE_STYLES:
            style["shape"] = shape

        # 预设颜色
        colors = DEFAULT_COLORS.get(style_name, DEFAULT_COLORS["default"])
        style["fillColor"] = colors["fill"]
        style["strokeColor"] = colors["stroke"]

        # 字体
        style["fontFamily"] = self.theme.get("fonts", {}).get("family", "Microsoft YaHei")
        style["fontSize"] = self.theme.get("fonts", {}).get("size", 12)

        # 额外样式
        style.update(extra)

        return style

    # ─────────────────────────────────────────────────────────────────────────
    #  XML 生成
    # ─────────────────────────────────────────────────────────────────────────

    def to_xml(self) -> str:
        """生成 draw.io XML"""
        # 根元素
        mxfile = ET.Element("mxfile")
        mxfile.set("host", "app.diagrams.net")
        mxfile.set("modified", datetime.now().isoformat())
        mxfile.set("agent", "laborany-drawio")
        mxfile.set("version", "1.0.0")

        # 图表元素
        diagram = ET.SubElement(mxfile, "diagram")
        diagram.set("id", str(uuid.uuid4()))
        diagram.set("name", self.title)

        # 图形模型
        model = ET.SubElement(diagram, "mxGraphModel")
        model.set("dx", "1000")
        model.set("dy", "600")
        model.set("grid", "1")
        model.set("gridSize", "10")
        model.set("guides", "1")
        model.set("tooltips", "1")
        model.set("connect", "1")
        model.set("arrows", "1")
        model.set("fold", "1")
        model.set("page", "1")
        model.set("pageScale", "1")
        model.set("pageWidth", "827")
        model.set("pageHeight", "1169")

        # 根节点
        root = ET.SubElement(model, "root")
        ET.SubElement(root, "mxCell", id="0")
        ET.SubElement(root, "mxCell", id="1", parent="0")

        # 添加分组
        for group in self.groups.values():
            self._add_group_xml(root, group)

        # 添加节点
        for node in self.nodes.values():
            self._add_node_xml(root, node)

        # 添加连线
        for edge in self.edges.values():
            self._add_edge_xml(root, edge)

        return ET.tostring(mxfile, encoding="unicode", xml_declaration=True)

    def _add_node_xml(self, root: ET.Element, node: Node):
        """添加节点 XML"""
        cell = ET.SubElement(root, "mxCell")
        cell.set("id", node.id)
        cell.set("value", node.label)
        cell.set("style", self._build_style_string(node.shape, node.style))
        cell.set("vertex", "1")
        cell.set("parent", node.parent or "1")

        geom = ET.SubElement(cell, "mxGeometry")
        geom.set("x", str(node.x))
        geom.set("y", str(node.y))
        geom.set("width", str(node.width))
        geom.set("height", str(node.height))
        geom.set("as", "geometry")

    def _add_edge_xml(self, root: ET.Element, edge: Edge):
        """添加连线 XML"""
        cell = ET.SubElement(root, "mxCell")
        cell.set("id", edge.id)
        cell.set("value", edge.label)
        cell.set("style", self._build_edge_style(edge.style))
        cell.set("edge", "1")
        cell.set("parent", "1")
        cell.set("source", edge.source)
        cell.set("target", edge.target)

        geom = ET.SubElement(cell, "mxGeometry")
        geom.set("relative", "1")
        geom.set("as", "geometry")

    def _add_group_xml(self, root: ET.Element, group: Group):
        """添加分组 XML"""
        cell = ET.SubElement(root, "mxCell")
        cell.set("id", group.id)
        cell.set("value", group.label)
        cell.set("style", self._build_group_style(group.style))
        cell.set("vertex", "1")
        cell.set("parent", "1")
        cell.set("connectable", "0")

        geom = ET.SubElement(cell, "mxGeometry")
        geom.set("x", str(group.x))
        geom.set("y", str(group.y))
        geom.set("width", str(group.width))
        geom.set("height", str(group.height))
        geom.set("as", "geometry")

    def _build_style_string(self, shape: str, style: Dict) -> str:
        """构建样式字符串"""
        parts = [SHAPE_STYLES.get(shape, "")]

        for key, value in style.items():
            if key != "shape":
                parts.append(f"{key}={value};")

        # 确保有字体设置
        if "fontFamily" not in style:
            parts.append("fontFamily=Microsoft YaHei;")

        return "".join(parts)

    def _build_edge_style(self, style: Dict) -> str:
        """构建连线样式"""
        base = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=classic;endFill=1;"

        for key, value in style.items():
            base += f"{key}={value};"

        return base

    def _build_group_style(self, style: Dict) -> str:
        """构建分组样式"""
        base = "group;rounded=1;fillColor=#f5f5f5;strokeColor=#666666;verticalAlign=top;fontStyle=1;spacingTop=10;fontFamily=Microsoft YaHei;"

        for key, value in style.items():
            base += f"{key}={value};"

        return base

    # ─────────────────────────────────────────────────────────────────────────
    #  文件操作
    # ─────────────────────────────────────────────────────────────────────────

    def save(self, path: str):
        """保存为 .drawio 文件"""
        xml_content = self.to_xml()
        with open(path, "w", encoding="utf-8") as f:
            f.write(xml_content)

    @classmethod
    def load(cls, path: str) -> "Diagram":
        """从 .drawio 文件加载"""
        diagram = cls()

        tree = ET.parse(path)
        root = tree.getroot()

        # 解析图表名称
        diagram_elem = root.find(".//diagram")
        if diagram_elem is not None:
            diagram.title = diagram_elem.get("name", "Diagram")

        # 解析节点和连线
        for cell in root.findall(".//mxCell"):
            cell_id = cell.get("id")
            if cell_id in ("0", "1"):
                continue

            if cell.get("vertex") == "1":
                diagram._parse_node(cell)
            elif cell.get("edge") == "1":
                diagram._parse_edge(cell)

        return diagram

    def _parse_node(self, cell: ET.Element):
        """解析节点"""
        geom = cell.find("mxGeometry")
        if geom is None:
            return

        # 检查是否为分组
        style = cell.get("style", "")
        if "group" in style:
            self._parse_group(cell, geom)
            return

        node = Node(
            id=cell.get("id"),
            label=cell.get("value", ""),
            x=float(geom.get("x", 0)),
            y=float(geom.get("y", 0)),
            width=float(geom.get("width", 120)),
            height=float(geom.get("height", 60)),
            parent=cell.get("parent") if cell.get("parent") != "1" else None,
        )
        self.nodes[node.id] = node

    def _parse_group(self, cell: ET.Element, geom: ET.Element):
        """解析分组"""
        group = Group(
            id=cell.get("id"),
            label=cell.get("value", ""),
            x=float(geom.get("x", 0)),
            y=float(geom.get("y", 0)),
            width=float(geom.get("width", 300)),
            height=float(geom.get("height", 200)),
        )
        self.groups[group.id] = group

    def _parse_edge(self, cell: ET.Element):
        """解析连线"""
        edge = Edge(
            id=cell.get("id"),
            source=cell.get("source", ""),
            target=cell.get("target", ""),
            label=cell.get("value", ""),
        )
        self.edges[edge.id] = edge

    # ─────────────────────────────────────────────────────────────────────────
    #  验证
    # ─────────────────────────────────────────────────────────────────────────

    def validate(self) -> List[str]:
        """验证图表结构，返回错误列表"""
        errors = []

        # 检查连线引用
        for edge in self.edges.values():
            if edge.source not in self.nodes:
                errors.append(f"连线 {edge.id} 的源节点 {edge.source} 不存在")
            if edge.target not in self.nodes:
                errors.append(f"连线 {edge.id} 的目标节点 {edge.target} 不存在")

        # 检查分组引用
        for group in self.groups.values():
            for child in group.children:
                if child not in self.nodes:
                    errors.append(f"分组 {group.id} 的子节点 {child} 不存在")

        return errors

    def stats(self) -> Dict:
        """返回图表统计信息"""
        return {
            "nodes": len(self.nodes),
            "edges": len(self.edges),
            "groups": len(self.groups),
        }
