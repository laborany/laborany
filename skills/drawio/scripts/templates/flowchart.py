"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         流程图模板                                            ║
║                                                                              ║
║  提供流程图的快速创建模板                                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from ..diagram import Diagram


# ═══════════════════════════════════════════════════════════════════════════════
#  样式预设
# ═══════════════════════════════════════════════════════════════════════════════

FLOWCHART_STYLES = {
    "start": {"fillColor": "#d5e8d4", "strokeColor": "#82b366"},
    "end": {"fillColor": "#f8cecc", "strokeColor": "#b85450"},
    "process": {"fillColor": "#dae8fc", "strokeColor": "#6c8ebf"},
    "decision": {"fillColor": "#fff2cc", "strokeColor": "#d6b656"},
    "io": {"fillColor": "#e1d5e7", "strokeColor": "#9673a6"},
    "document": {"fillColor": "#f5f5f5", "strokeColor": "#666666"},
    "preparation": {"fillColor": "#ffe6cc", "strokeColor": "#d79b00"},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  模板函数
# ═══════════════════════════════════════════════════════════════════════════════

def create_basic_flowchart(title: str = "流程图") -> Diagram:
    """
    创建基础流程图模板

    包含: 开始 → 处理 → 判断 → 结束
    """
    diagram = Diagram(title=title)

    # 添加节点
    diagram.add_node("start", "开始", shape="ellipse", **FLOWCHART_STYLES["start"])
    diagram.add_node("process", "处理", shape="rectangle", **FLOWCHART_STYLES["process"])
    diagram.add_node("decision", "判断", shape="rhombus", **FLOWCHART_STYLES["decision"])
    diagram.add_node("end", "结束", shape="ellipse", **FLOWCHART_STYLES["end"])

    # 添加连线
    diagram.add_edge("start", "process")
    diagram.add_edge("process", "decision")
    diagram.add_edge("decision", "end", label="是")

    # 自动布局
    diagram.auto_layout(direction="TB")

    return diagram


def create_approval_flowchart(title: str = "审批流程") -> Diagram:
    """
    创建审批流程模板

    包含: 提交 → 初审 → 复审 → 批准/驳回
    """
    diagram = Diagram(title=title)

    # 节点
    diagram.add_node("submit", "提交申请", shape="ellipse", **FLOWCHART_STYLES["start"])
    diagram.add_node("review1", "初审", shape="rectangle", **FLOWCHART_STYLES["process"])
    diagram.add_node("check1", "初审通过?", shape="rhombus", **FLOWCHART_STYLES["decision"])
    diagram.add_node("review2", "复审", shape="rectangle", **FLOWCHART_STYLES["process"])
    diagram.add_node("check2", "复审通过?", shape="rhombus", **FLOWCHART_STYLES["decision"])
    diagram.add_node("approve", "批准", shape="ellipse", **FLOWCHART_STYLES["end"])
    diagram.add_node("reject", "驳回", shape="ellipse", **FLOWCHART_STYLES["end"])

    # 连线
    diagram.add_edge("submit", "review1")
    diagram.add_edge("review1", "check1")
    diagram.add_edge("check1", "review2", label="是")
    diagram.add_edge("check1", "reject", label="否")
    diagram.add_edge("review2", "check2")
    diagram.add_edge("check2", "approve", label="是")
    diagram.add_edge("check2", "reject", label="否")

    diagram.auto_layout(direction="TB")
    return diagram


def create_data_processing_flowchart(title: str = "数据处理流程") -> Diagram:
    """
    创建数据处理流程模板

    包含: 输入 → 验证 → 处理 → 输出
    """
    diagram = Diagram(title=title)

    # 节点
    diagram.add_node("input", "数据输入", shape="parallelogram", **FLOWCHART_STYLES["io"])
    diagram.add_node("validate", "数据验证", shape="rectangle", **FLOWCHART_STYLES["process"])
    diagram.add_node("check", "验证通过?", shape="rhombus", **FLOWCHART_STYLES["decision"])
    diagram.add_node("process", "数据处理", shape="rectangle", **FLOWCHART_STYLES["process"])
    diagram.add_node("output", "结果输出", shape="parallelogram", **FLOWCHART_STYLES["io"])
    diagram.add_node("error", "错误处理", shape="rectangle", **FLOWCHART_STYLES["end"])

    # 连线
    diagram.add_edge("input", "validate")
    diagram.add_edge("validate", "check")
    diagram.add_edge("check", "process", label="是")
    diagram.add_edge("check", "error", label="否")
    diagram.add_edge("process", "output")

    diagram.auto_layout(direction="TB")
    return diagram
