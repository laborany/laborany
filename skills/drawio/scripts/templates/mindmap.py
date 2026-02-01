"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         思维导图模板                                          ║
║                                                                              ║
║  提供思维导图的快速创建模板                                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from ..diagram import Diagram


# ═══════════════════════════════════════════════════════════════════════════════
#  样式预设
# ═══════════════════════════════════════════════════════════════════════════════

MINDMAP_STYLES = {
    "center": {"fillColor": "#1a365d", "strokeColor": "#1a365d", "fontColor": "#ffffff"},
    "branch1": {"fillColor": "#dae8fc", "strokeColor": "#6c8ebf"},
    "branch2": {"fillColor": "#d5e8d4", "strokeColor": "#82b366"},
    "branch3": {"fillColor": "#fff2cc", "strokeColor": "#d6b656"},
    "branch4": {"fillColor": "#e1d5e7", "strokeColor": "#9673a6"},
    "leaf": {"fillColor": "#f5f5f5", "strokeColor": "#666666"},
}

BRANCH_COLORS = ["branch1", "branch2", "branch3", "branch4"]


# ═══════════════════════════════════════════════════════════════════════════════
#  模板函数
# ═══════════════════════════════════════════════════════════════════════════════

def create_basic_mindmap(title: str = "思维导图", center_text: str = "中心主题") -> Diagram:
    """
    创建基础思维导图模板

    包含: 中心主题 + 4个分支
    """
    diagram = Diagram(title=title)

    # 中心节点
    diagram.add_node("center", center_text, shape="rounded", x=300, y=200, width=120, height=60, **MINDMAP_STYLES["center"])

    # 分支
    branches = [
        ("b1", "分支一", 100, 100),
        ("b2", "分支二", 500, 100),
        ("b3", "分支三", 100, 300),
        ("b4", "分支四", 500, 300),
    ]

    for i, (bid, label, x, y) in enumerate(branches):
        style = MINDMAP_STYLES[BRANCH_COLORS[i % len(BRANCH_COLORS)]]
        diagram.add_node(bid, label, shape="rounded", x=x, y=y, width=100, height=40, **style)
        diagram.add_edge("center", bid)

    return diagram


def create_project_mindmap(title: str = "项目规划") -> Diagram:
    """
    创建项目规划思维导图
    """
    diagram = Diagram(title=title)

    # 中心
    diagram.add_node("center", "项目规划", shape="rounded", x=300, y=250, width=120, height=60, **MINDMAP_STYLES["center"])

    # 一级分支
    level1 = [
        ("goals", "目标", 100, 100),
        ("timeline", "时间线", 500, 100),
        ("resources", "资源", 100, 400),
        ("risks", "风险", 500, 400),
    ]

    for i, (nid, label, x, y) in enumerate(level1):
        style = MINDMAP_STYLES[BRANCH_COLORS[i]]
        diagram.add_node(nid, label, shape="rounded", x=x, y=y, width=80, height=40, **style)
        diagram.add_edge("center", nid)

    # 二级分支 - 目标
    diagram.add_node("g1", "短期目标", shape="rounded", x=0, y=50, width=80, height=30, **MINDMAP_STYLES["leaf"])
    diagram.add_node("g2", "长期目标", shape="rounded", x=0, y=150, width=80, height=30, **MINDMAP_STYLES["leaf"])
    diagram.add_edge("goals", "g1")
    diagram.add_edge("goals", "g2")

    # 二级分支 - 时间线
    diagram.add_node("t1", "第一阶段", shape="rounded", x=600, y=50, width=80, height=30, **MINDMAP_STYLES["leaf"])
    diagram.add_node("t2", "第二阶段", shape="rounded", x=600, y=100, width=80, height=30, **MINDMAP_STYLES["leaf"])
    diagram.add_node("t3", "第三阶段", shape="rounded", x=600, y=150, width=80, height=30, **MINDMAP_STYLES["leaf"])
    diagram.add_edge("timeline", "t1")
    diagram.add_edge("timeline", "t2")
    diagram.add_edge("timeline", "t3")

    return diagram


def create_learning_mindmap(title: str = "学习笔记", topic: str = "主题") -> Diagram:
    """
    创建学习笔记思维导图
    """
    diagram = Diagram(title=title)

    # 中心
    diagram.add_node("center", topic, shape="rounded", x=300, y=200, width=120, height=60, **MINDMAP_STYLES["center"])

    # 分支
    branches = [
        ("what", "是什么", 100, 50),
        ("why", "为什么", 500, 50),
        ("how", "怎么做", 100, 350),
        ("example", "示例", 500, 350),
    ]

    for i, (nid, label, x, y) in enumerate(branches):
        style = MINDMAP_STYLES[BRANCH_COLORS[i]]
        diagram.add_node(nid, label, shape="rounded", x=x, y=y, width=80, height=40, **style)
        diagram.add_edge("center", nid)

    return diagram
