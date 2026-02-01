# 图表类型模板指南

> 本文档提供各类图表的结构模板和最佳实践。

---

## 流程图 (Flowchart)

### 适用场景
- 业务流程
- 算法流程
- 操作步骤
- 审批流程

### 标准符号

| 符号 | 形状 | 含义 |
|------|------|------|
| ○ | ellipse | 开始/结束 |
| □ | rectangle | 处理步骤 |
| ◇ | rhombus | 判断/决策 |
| ▱ | parallelogram | 输入/输出 |
| ⬡ | hexagon | 准备步骤 |

### 模板结构

```python
# 基本流程图
diagram.add_node("start", "开始", shape="ellipse", style="start")
diagram.add_node("input", "输入数据", shape="parallelogram", style="io")
diagram.add_node("process", "处理", shape="rectangle", style="process")
diagram.add_node("decision", "判断", shape="rhombus", style="decision")
diagram.add_node("output", "输出结果", shape="parallelogram", style="io")
diagram.add_node("end", "结束", shape="ellipse", style="end")

diagram.add_edge("start", "input")
diagram.add_edge("input", "process")
diagram.add_edge("process", "decision")
diagram.add_edge("decision", "output", label="是")
diagram.add_edge("decision", "process", label="否")
diagram.add_edge("output", "end")
```

### 布局建议
- 方向：TB（从上到下）
- 节点间距：垂直 60px，水平 80px
- 判断节点的"是"分支向下，"否"分支向右

---

## 架构图 (Architecture)

### 适用场景
- 系统架构
- 技术栈
- 微服务架构
- 部署架构

### 常用元素

| 元素 | 形状 | 含义 |
|------|------|------|
| □ | rectangle | 服务/模块 |
| ⬭ | rounded | 组件 |
| ⌸ | cylinder | 数据库 |
| ☁ | cloud | 云服务 |
| ⬡ | hexagon | 外部系统 |

### 模板结构

```python
# 三层架构
# 表现层
diagram.add_group("g1", "表现层", ["web", "mobile"])
diagram.add_node("web", "Web 前端", shape="rounded")
diagram.add_node("mobile", "移动端", shape="rounded")

# 业务层
diagram.add_group("g2", "业务层", ["api", "service"])
diagram.add_node("api", "API 网关", shape="rectangle")
diagram.add_node("service", "业务服务", shape="rectangle")

# 数据层
diagram.add_group("g3", "数据层", ["db", "cache"])
diagram.add_node("db", "数据库", shape="cylinder")
diagram.add_node("cache", "缓存", shape="cylinder")

# 连接
diagram.add_edge("web", "api")
diagram.add_edge("mobile", "api")
diagram.add_edge("api", "service")
diagram.add_edge("service", "db")
diagram.add_edge("service", "cache")
```

### 布局建议
- 方向：TB 或 LR
- 使用分组区分层级
- 同层节点水平对齐

---

## 序列图 (Sequence)

### 适用场景
- 接口调用
- 消息传递
- 时序交互
- 协议流程

### 常用元素

| 元素 | 形状 | 含义 |
|------|------|------|
| □ | rectangle | 参与者 |
| │ | line | 生命线 |
| → | arrow | 同步消息 |
| ⇢ | dashed arrow | 异步消息 |
| ← | return arrow | 返回消息 |

### 模板结构

```python
# 参与者
diagram.add_node("client", "客户端", shape="rectangle", y=0)
diagram.add_node("server", "服务器", shape="rectangle", y=0)
diagram.add_node("db", "数据库", shape="rectangle", y=0)

# 生命线（使用虚线）
diagram.add_lifeline("client", height=300)
diagram.add_lifeline("server", height=300)
diagram.add_lifeline("db", height=300)

# 消息
diagram.add_message("client", "server", "1. 请求", y=50)
diagram.add_message("server", "db", "2. 查询", y=100)
diagram.add_message("db", "server", "3. 返回数据", y=150, style="return")
diagram.add_message("server", "client", "4. 响应", y=200, style="return")
```

### 布局建议
- 方向：TB
- 参与者水平排列
- 消息按时间顺序从上到下

---

## 思维导图 (Mind Map)

### 适用场景
- 概念发散
- 知识整理
- 头脑风暴
- 项目规划

### 常用元素

| 元素 | 形状 | 含义 |
|------|------|------|
| ⬭ | rounded | 中心主题 |
| ⬭ | rounded | 分支主题 |
| ○ | ellipse | 叶子节点 |

### 模板结构

```python
# 中心主题
diagram.add_node("center", "中心主题", shape="rounded", style="center")

# 一级分支
diagram.add_node("b1", "分支1", shape="rounded", style="branch1")
diagram.add_node("b2", "分支2", shape="rounded", style="branch1")
diagram.add_node("b3", "分支3", shape="rounded", style="branch1")

# 二级分支
diagram.add_node("b1-1", "子主题1", shape="rounded", style="branch2")
diagram.add_node("b1-2", "子主题2", shape="rounded", style="branch2")

# 连接
diagram.add_edge("center", "b1", style="mindmap")
diagram.add_edge("center", "b2", style="mindmap")
diagram.add_edge("center", "b3", style="mindmap")
diagram.add_edge("b1", "b1-1", style="mindmap")
diagram.add_edge("b1", "b1-2", style="mindmap")
```

### 布局建议
- 方向：LR（从左到右）或放射状
- 中心主题居中
- 分支均匀分布

---

## 组织架构图 (Org Chart)

### 适用场景
- 公司组织
- 部门结构
- 人员层级
- 汇报关系

### 模板结构

```python
# 高层
diagram.add_node("ceo", "CEO\n张三", shape="rectangle", style="executive")

# 中层
diagram.add_node("cto", "CTO\n李四", shape="rectangle", style="manager")
diagram.add_node("cfo", "CFO\n王五", shape="rectangle", style="manager")
diagram.add_node("coo", "COO\n赵六", shape="rectangle", style="manager")

# 基层
diagram.add_node("dev1", "开发组长\n小明", shape="rectangle", style="staff")
diagram.add_node("dev2", "测试组长\n小红", shape="rectangle", style="staff")

# 连接
diagram.add_edge("ceo", "cto")
diagram.add_edge("ceo", "cfo")
diagram.add_edge("ceo", "coo")
diagram.add_edge("cto", "dev1")
diagram.add_edge("cto", "dev2")
```

### 布局建议
- 方向：TB
- 同级节点水平对齐
- 使用不同颜色区分层级

---

## 网络拓扑图 (Network)

### 适用场景
- 网络架构
- 设备连接
- 数据流向
- 安全边界

### 常用元素

| 元素 | 形状 | 含义 |
|------|------|------|
| ⬭ | rounded | 服务器 |
| ○ | ellipse | 终端设备 |
| ⬡ | hexagon | 网络设备 |
| ☁ | cloud | 互联网/云 |
| □ | rectangle | 防火墙 |

### 模板结构

```python
# 外部网络
diagram.add_node("internet", "互联网", shape="cloud")

# 边界设备
diagram.add_node("firewall", "防火墙", shape="rectangle", style="security")
diagram.add_node("router", "路由器", shape="hexagon")

# 内部网络
diagram.add_node("switch", "交换机", shape="hexagon")
diagram.add_node("server1", "Web 服务器", shape="rounded")
diagram.add_node("server2", "数据库服务器", shape="cylinder")

# 连接
diagram.add_edge("internet", "firewall")
diagram.add_edge("firewall", "router")
diagram.add_edge("router", "switch")
diagram.add_edge("switch", "server1")
diagram.add_edge("switch", "server2")
```

### 布局建议
- 方向：TB 或自由布局
- 使用分组区分网络区域
- 安全边界用虚线框表示

---

## 样式预设

### 流程图样式

```python
FLOWCHART_STYLES = {
    "start": "shape=ellipse;fillColor=#d5e8d4;strokeColor=#82b366;",
    "end": "shape=ellipse;fillColor=#f8cecc;strokeColor=#b85450;",
    "process": "rounded=0;fillColor=#dae8fc;strokeColor=#6c8ebf;",
    "decision": "shape=rhombus;fillColor=#fff2cc;strokeColor=#d6b656;",
    "io": "shape=parallelogram;fillColor=#e1d5e7;strokeColor=#9673a6;",
}
```

### 架构图样式

```python
ARCHITECTURE_STYLES = {
    "service": "rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;",
    "database": "shape=cylinder;fillColor=#f5f5f5;strokeColor=#666666;",
    "cloud": "shape=cloud;fillColor=#fff2cc;strokeColor=#d6b656;",
    "external": "shape=hexagon;fillColor=#e1d5e7;strokeColor=#9673a6;",
}
```

### 组织架构样式

```python
ORGCHART_STYLES = {
    "executive": "rounded=0;fillColor=#1a365d;strokeColor=#1a365d;fontColor=#ffffff;",
    "manager": "rounded=0;fillColor=#2c5282;strokeColor=#2c5282;fontColor=#ffffff;",
    "staff": "rounded=0;fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#2d3748;",
}
```
