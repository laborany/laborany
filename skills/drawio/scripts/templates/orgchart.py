"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         组织架构图模板                                         ║
║                                                                              ║
║  提供组织架构图的快速创建模板                                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from ..diagram import Diagram


# ═══════════════════════════════════════════════════════════════════════════════
#  样式预设
# ═══════════════════════════════════════════════════════════════════════════════

ORGCHART_STYLES = {
    "executive": {"fillColor": "#1a365d", "strokeColor": "#1a365d", "fontColor": "#ffffff"},
    "director": {"fillColor": "#2c5282", "strokeColor": "#2c5282", "fontColor": "#ffffff"},
    "manager": {"fillColor": "#3182ce", "strokeColor": "#3182ce", "fontColor": "#ffffff"},
    "staff": {"fillColor": "#dae8fc", "strokeColor": "#6c8ebf", "fontColor": "#2d3748"},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  模板函数
# ═══════════════════════════════════════════════════════════════════════════════

def create_basic_orgchart(title: str = "组织架构") -> Diagram:
    """
    创建基础组织架构图
    """
    diagram = Diagram(title=title)

    # CEO
    diagram.add_node("ceo", "CEO\n张三", shape="rectangle", **ORGCHART_STYLES["executive"])

    # 高管
    diagram.add_node("cto", "CTO\n李四", shape="rectangle", **ORGCHART_STYLES["director"])
    diagram.add_node("cfo", "CFO\n王五", shape="rectangle", **ORGCHART_STYLES["director"])
    diagram.add_node("coo", "COO\n赵六", shape="rectangle", **ORGCHART_STYLES["director"])

    # 连线
    diagram.add_edge("ceo", "cto")
    diagram.add_edge("ceo", "cfo")
    diagram.add_edge("ceo", "coo")

    diagram.auto_layout(direction="TB")
    return diagram


def create_department_orgchart(title: str = "部门架构") -> Diagram:
    """
    创建部门架构图
    """
    diagram = Diagram(title=title)

    # 部门负责人
    diagram.add_node("head", "部门总监\n张总", shape="rectangle", **ORGCHART_STYLES["director"])

    # 组长
    diagram.add_node("team1", "开发组长\n李组长", shape="rectangle", **ORGCHART_STYLES["manager"])
    diagram.add_node("team2", "测试组长\n王组长", shape="rectangle", **ORGCHART_STYLES["manager"])
    diagram.add_node("team3", "运维组长\n赵组长", shape="rectangle", **ORGCHART_STYLES["manager"])

    # 员工
    diagram.add_node("dev1", "开发工程师\n小明", shape="rectangle", **ORGCHART_STYLES["staff"])
    diagram.add_node("dev2", "开发工程师\n小红", shape="rectangle", **ORGCHART_STYLES["staff"])
    diagram.add_node("test1", "测试工程师\n小刚", shape="rectangle", **ORGCHART_STYLES["staff"])
    diagram.add_node("ops1", "运维工程师\n小强", shape="rectangle", **ORGCHART_STYLES["staff"])

    # 连线
    diagram.add_edge("head", "team1")
    diagram.add_edge("head", "team2")
    diagram.add_edge("head", "team3")
    diagram.add_edge("team1", "dev1")
    diagram.add_edge("team1", "dev2")
    diagram.add_edge("team2", "test1")
    diagram.add_edge("team3", "ops1")

    diagram.auto_layout(direction="TB")
    return diagram
