"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         架构图模板                                            ║
║                                                                              ║
║  提供系统架构图的快速创建模板                                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from ..diagram import Diagram


# ═══════════════════════════════════════════════════════════════════════════════
#  样式预设
# ═══════════════════════════════════════════════════════════════════════════════

ARCHITECTURE_STYLES = {
    "frontend": {"fillColor": "#d5e8d4", "strokeColor": "#82b366"},
    "backend": {"fillColor": "#dae8fc", "strokeColor": "#6c8ebf"},
    "database": {"fillColor": "#f5f5f5", "strokeColor": "#666666"},
    "cache": {"fillColor": "#fff2cc", "strokeColor": "#d6b656"},
    "external": {"fillColor": "#e1d5e7", "strokeColor": "#9673a6"},
    "cloud": {"fillColor": "#ffe6cc", "strokeColor": "#d79b00"},
    "gateway": {"fillColor": "#f8cecc", "strokeColor": "#b85450"},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  模板函数
# ═══════════════════════════════════════════════════════════════════════════════

def create_three_tier_architecture(title: str = "三层架构") -> Diagram:
    """
    创建三层架构模板

    包含: 表现层 → 业务层 → 数据层
    """
    diagram = Diagram(title=title)

    # 表现层
    diagram.add_node("web", "Web 前端", shape="rounded", **ARCHITECTURE_STYLES["frontend"])
    diagram.add_node("mobile", "移动端", shape="rounded", **ARCHITECTURE_STYLES["frontend"])

    # 业务层
    diagram.add_node("api", "API 网关", shape="rectangle", **ARCHITECTURE_STYLES["gateway"])
    diagram.add_node("service", "业务服务", shape="rectangle", **ARCHITECTURE_STYLES["backend"])

    # 数据层
    diagram.add_node("db", "数据库", shape="cylinder", **ARCHITECTURE_STYLES["database"])
    diagram.add_node("cache", "缓存", shape="cylinder", **ARCHITECTURE_STYLES["cache"])

    # 连线
    diagram.add_edge("web", "api")
    diagram.add_edge("mobile", "api")
    diagram.add_edge("api", "service")
    diagram.add_edge("service", "db")
    diagram.add_edge("service", "cache")

    # 分组
    diagram.add_group("g1", "表现层", ["web", "mobile"])
    diagram.add_group("g2", "业务层", ["api", "service"])
    diagram.add_group("g3", "数据层", ["db", "cache"])

    diagram.auto_layout(direction="TB")
    return diagram


def create_microservices_architecture(title: str = "微服务架构") -> Diagram:
    """
    创建微服务架构模板
    """
    diagram = Diagram(title=title)

    # 入口
    diagram.add_node("client", "客户端", shape="rounded", **ARCHITECTURE_STYLES["frontend"])
    diagram.add_node("gateway", "API 网关", shape="rectangle", **ARCHITECTURE_STYLES["gateway"])

    # 服务
    diagram.add_node("user", "用户服务", shape="rectangle", **ARCHITECTURE_STYLES["backend"])
    diagram.add_node("order", "订单服务", shape="rectangle", **ARCHITECTURE_STYLES["backend"])
    diagram.add_node("product", "商品服务", shape="rectangle", **ARCHITECTURE_STYLES["backend"])

    # 基础设施
    diagram.add_node("mq", "消息队列", shape="hexagon", **ARCHITECTURE_STYLES["cache"])
    diagram.add_node("registry", "服务注册", shape="hexagon", **ARCHITECTURE_STYLES["external"])

    # 数据库
    diagram.add_node("user_db", "用户DB", shape="cylinder", **ARCHITECTURE_STYLES["database"])
    diagram.add_node("order_db", "订单DB", shape="cylinder", **ARCHITECTURE_STYLES["database"])
    diagram.add_node("product_db", "商品DB", shape="cylinder", **ARCHITECTURE_STYLES["database"])

    # 连线
    diagram.add_edge("client", "gateway")
    diagram.add_edge("gateway", "user")
    diagram.add_edge("gateway", "order")
    diagram.add_edge("gateway", "product")
    diagram.add_edge("user", "user_db")
    diagram.add_edge("order", "order_db")
    diagram.add_edge("product", "product_db")
    diagram.add_edge("order", "mq")
    diagram.add_edge("mq", "product")

    diagram.auto_layout(direction="TB")
    return diagram


def create_cloud_architecture(title: str = "云架构") -> Diagram:
    """
    创建云架构模板
    """
    diagram = Diagram(title=title)

    # 用户
    diagram.add_node("users", "用户", shape="ellipse", **ARCHITECTURE_STYLES["external"])

    # CDN 和负载均衡
    diagram.add_node("cdn", "CDN", shape="cloud", **ARCHITECTURE_STYLES["cloud"])
    diagram.add_node("lb", "负载均衡", shape="hexagon", **ARCHITECTURE_STYLES["gateway"])

    # 应用层
    diagram.add_node("app1", "应用实例1", shape="rectangle", **ARCHITECTURE_STYLES["backend"])
    diagram.add_node("app2", "应用实例2", shape="rectangle", **ARCHITECTURE_STYLES["backend"])

    # 数据层
    diagram.add_node("rds", "云数据库", shape="cylinder", **ARCHITECTURE_STYLES["database"])
    diagram.add_node("redis", "云缓存", shape="cylinder", **ARCHITECTURE_STYLES["cache"])
    diagram.add_node("oss", "对象存储", shape="cylinder", **ARCHITECTURE_STYLES["cloud"])

    # 连线
    diagram.add_edge("users", "cdn")
    diagram.add_edge("cdn", "lb")
    diagram.add_edge("lb", "app1")
    diagram.add_edge("lb", "app2")
    diagram.add_edge("app1", "rds")
    diagram.add_edge("app2", "rds")
    diagram.add_edge("app1", "redis")
    diagram.add_edge("app2", "redis")
    diagram.add_edge("app1", "oss")

    diagram.auto_layout(direction="TB")
    return diagram
