"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         序列图模板                                            ║
║                                                                              ║
║  提供序列图/时序图的快速创建模板                                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from ..diagram import Diagram


# ═══════════════════════════════════════════════════════════════════════════════
#  样式预设
# ═══════════════════════════════════════════════════════════════════════════════

SEQUENCE_STYLES = {
    "actor": {"fillColor": "#dae8fc", "strokeColor": "#6c8ebf"},
    "system": {"fillColor": "#d5e8d4", "strokeColor": "#82b366"},
    "database": {"fillColor": "#f5f5f5", "strokeColor": "#666666"},
    "external": {"fillColor": "#e1d5e7", "strokeColor": "#9673a6"},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  模板函数
# ═══════════════════════════════════════════════════════════════════════════════

def create_basic_sequence(title: str = "序列图") -> Diagram:
    """
    创建基础序列图模板

    包含: 客户端 → 服务器 → 数据库
    """
    diagram = Diagram(title=title)

    # 参与者（横向排列）
    diagram.add_node("client", "客户端", shape="rectangle", x=0, y=0, **SEQUENCE_STYLES["actor"])
    diagram.add_node("server", "服务器", shape="rectangle", x=200, y=0, **SEQUENCE_STYLES["system"])
    diagram.add_node("db", "数据库", shape="rectangle", x=400, y=0, **SEQUENCE_STYLES["database"])

    # 消息（使用标签表示）
    diagram.add_node("msg1", "1. 请求", shape="rectangle", x=80, y=80, width=140, height=30)
    diagram.add_node("msg2", "2. 查询", shape="rectangle", x=280, y=130, width=140, height=30)
    diagram.add_node("msg3", "3. 返回数据", shape="rectangle", x=280, y=180, width=140, height=30)
    diagram.add_node("msg4", "4. 响应", shape="rectangle", x=80, y=230, width=140, height=30)

    # 连线
    diagram.add_edge("client", "msg1")
    diagram.add_edge("msg1", "server")
    diagram.add_edge("server", "msg2")
    diagram.add_edge("msg2", "db")
    diagram.add_edge("db", "msg3")
    diagram.add_edge("msg3", "server")
    diagram.add_edge("server", "msg4")
    diagram.add_edge("msg4", "client")

    return diagram


def create_login_sequence(title: str = "登录流程") -> Diagram:
    """
    创建登录流程序列图
    """
    diagram = Diagram(title=title)

    # 参与者
    diagram.add_node("user", "用户", shape="rectangle", x=0, y=0, **SEQUENCE_STYLES["actor"])
    diagram.add_node("frontend", "前端", shape="rectangle", x=150, y=0, **SEQUENCE_STYLES["system"])
    diagram.add_node("backend", "后端", shape="rectangle", x=300, y=0, **SEQUENCE_STYLES["system"])
    diagram.add_node("db", "数据库", shape="rectangle", x=450, y=0, **SEQUENCE_STYLES["database"])

    # 消息节点
    messages = [
        ("m1", "1. 输入账号密码", 60, 80),
        ("m2", "2. 提交登录请求", 210, 120),
        ("m3", "3. 查询用户", 360, 160),
        ("m4", "4. 返回用户信息", 360, 200),
        ("m5", "5. 验证密码", 300, 240),
        ("m6", "6. 生成Token", 300, 280),
        ("m7", "7. 返回Token", 210, 320),
        ("m8", "8. 登录成功", 60, 360),
    ]

    for mid, label, x, y in messages:
        diagram.add_node(mid, label, shape="rounded", x=x, y=y, width=120, height=30)

    return diagram


def create_api_sequence(title: str = "API 调用流程") -> Diagram:
    """
    创建 API 调用序列图
    """
    diagram = Diagram(title=title)

    # 参与者
    diagram.add_node("client", "客户端", shape="rectangle", x=0, y=0, **SEQUENCE_STYLES["actor"])
    diagram.add_node("gateway", "API网关", shape="rectangle", x=150, y=0, **SEQUENCE_STYLES["system"])
    diagram.add_node("auth", "认证服务", shape="rectangle", x=300, y=0, **SEQUENCE_STYLES["system"])
    diagram.add_node("service", "业务服务", shape="rectangle", x=450, y=0, **SEQUENCE_STYLES["system"])

    # 消息
    messages = [
        ("m1", "1. API请求+Token", 60, 80),
        ("m2", "2. 验证Token", 210, 120),
        ("m3", "3. Token有效", 210, 160),
        ("m4", "4. 转发请求", 285, 200),
        ("m5", "5. 处理业务", 450, 240),
        ("m6", "6. 返回结果", 285, 280),
        ("m7", "7. 响应客户端", 60, 320),
    ]

    for mid, label, x, y in messages:
        diagram.add_node(mid, label, shape="rounded", x=x, y=y, width=130, height=30)

    return diagram
