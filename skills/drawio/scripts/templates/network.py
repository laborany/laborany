"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         网络拓扑图模板                                         ║
║                                                                              ║
║  提供网络拓扑图的快速创建模板                                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from ..diagram import Diagram


# ═══════════════════════════════════════════════════════════════════════════════
#  样式预设
# ═══════════════════════════════════════════════════════════════════════════════

NETWORK_STYLES = {
    "internet": {"fillColor": "#fff2cc", "strokeColor": "#d6b656"},
    "firewall": {"fillColor": "#f8cecc", "strokeColor": "#b85450"},
    "router": {"fillColor": "#dae8fc", "strokeColor": "#6c8ebf"},
    "switch": {"fillColor": "#d5e8d4", "strokeColor": "#82b366"},
    "server": {"fillColor": "#e1d5e7", "strokeColor": "#9673a6"},
    "database": {"fillColor": "#f5f5f5", "strokeColor": "#666666"},
    "client": {"fillColor": "#ffe6cc", "strokeColor": "#d79b00"},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  模板函数
# ═══════════════════════════════════════════════════════════════════════════════

def create_basic_network(title: str = "网络拓扑") -> Diagram:
    """
    创建基础网络拓扑图
    """
    diagram = Diagram(title=title)

    # 外部网络
    diagram.add_node("internet", "互联网", shape="cloud", **NETWORK_STYLES["internet"])

    # 边界设备
    diagram.add_node("firewall", "防火墙", shape="rectangle", **NETWORK_STYLES["firewall"])
    diagram.add_node("router", "路由器", shape="hexagon", **NETWORK_STYLES["router"])

    # 内部网络
    diagram.add_node("switch", "交换机", shape="hexagon", **NETWORK_STYLES["switch"])

    # 服务器
    diagram.add_node("web", "Web服务器", shape="rectangle", **NETWORK_STYLES["server"])
    diagram.add_node("app", "应用服务器", shape="rectangle", **NETWORK_STYLES["server"])
    diagram.add_node("db", "数据库服务器", shape="cylinder", **NETWORK_STYLES["database"])

    # 连线
    diagram.add_edge("internet", "firewall")
    diagram.add_edge("firewall", "router")
    diagram.add_edge("router", "switch")
    diagram.add_edge("switch", "web")
    diagram.add_edge("switch", "app")
    diagram.add_edge("switch", "db")

    diagram.auto_layout(direction="TB")
    return diagram


def create_dmz_network(title: str = "DMZ 网络架构") -> Diagram:
    """
    创建 DMZ 网络架构图
    """
    diagram = Diagram(title=title)

    # 外部
    diagram.add_node("internet", "互联网", shape="cloud", **NETWORK_STYLES["internet"])
    diagram.add_node("fw_ext", "外部防火墙", shape="rectangle", **NETWORK_STYLES["firewall"])

    # DMZ 区域
    diagram.add_node("web", "Web服务器", shape="rectangle", **NETWORK_STYLES["server"])
    diagram.add_node("mail", "邮件服务器", shape="rectangle", **NETWORK_STYLES["server"])
    diagram.add_node("dns", "DNS服务器", shape="rectangle", **NETWORK_STYLES["server"])

    # 内部防火墙
    diagram.add_node("fw_int", "内部防火墙", shape="rectangle", **NETWORK_STYLES["firewall"])

    # 内部网络
    diagram.add_node("app", "应用服务器", shape="rectangle", **NETWORK_STYLES["server"])
    diagram.add_node("db", "数据库", shape="cylinder", **NETWORK_STYLES["database"])
    diagram.add_node("clients", "内部用户", shape="ellipse", **NETWORK_STYLES["client"])

    # 连线
    diagram.add_edge("internet", "fw_ext")
    diagram.add_edge("fw_ext", "web")
    diagram.add_edge("fw_ext", "mail")
    diagram.add_edge("fw_ext", "dns")
    diagram.add_edge("web", "fw_int")
    diagram.add_edge("fw_int", "app")
    diagram.add_edge("fw_int", "db")
    diagram.add_edge("fw_int", "clients")

    # 分组
    diagram.add_group("dmz", "DMZ 区域", ["web", "mail", "dns"])
    diagram.add_group("internal", "内部网络", ["app", "db", "clients"])

    diagram.auto_layout(direction="TB")
    return diagram
