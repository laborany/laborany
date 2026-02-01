# 样式与布局规范

> 本文档定义图表的样式规范和布局算法。

---

## 颜色规范

### 标准调色板

| 用途 | 颜色代码 | 说明 |
|------|---------|------|
| 主色 | #1a365d | 深蓝，用于重要元素 |
| 次色 | #2c5282 | 中蓝，用于次要元素 |
| 强调 | #3182ce | 亮蓝，用于高亮 |
| 成功 | #38a169 | 绿色，用于成功状态 |
| 警告 | #d69e2e | 黄色，用于警告状态 |
| 错误 | #e53e3e | 红色，用于错误状态 |
| 背景 | #ffffff | 白色，默认背景 |
| 边框 | #e2e8f0 | 浅灰，默认边框 |
| 文字 | #2d3748 | 深灰，默认文字 |

### 流程图配色

| 元素 | 填充色 | 边框色 |
|------|--------|--------|
| 开始 | #d5e8d4 | #82b366 |
| 结束 | #f8cecc | #b85450 |
| 处理 | #dae8fc | #6c8ebf |
| 判断 | #fff2cc | #d6b656 |
| 输入/输出 | #e1d5e7 | #9673a6 |

---

## 字体规范

### 推荐字体

```
fontFamily=Microsoft YaHei;
```

### 字号规范

| 元素 | 字号 | 说明 |
|------|------|------|
| 标题 | 16px | 图表标题 |
| 节点标签 | 12px | 默认节点文字 |
| 连线标签 | 10px | 连线上的文字 |
| 注释 | 10px | 辅助说明文字 |

### 字体样式

| 样式 | fontStyle 值 |
|------|-------------|
| 普通 | 0 |
| 粗体 | 1 |
| 斜体 | 2 |
| 粗斜体 | 3 |

---

## 尺寸规范

### 节点尺寸

| 类型 | 宽度 | 高度 | 说明 |
|------|------|------|------|
| 小型 | 80px | 40px | 简短标签 |
| 标准 | 120px | 60px | 默认尺寸 |
| 大型 | 160px | 80px | 长标签或多行 |
| 宽型 | 200px | 60px | 横向内容 |

### 动态尺寸计算

```python
def calc_node_size(label, font_size=12, padding=20):
    """根据标签计算节点尺寸"""
    lines = label.split('\n')
    max_width = 0

    for line in lines:
        width = 0
        for char in line:
            if ord(char) > 127:  # 中文
                width += font_size * 1.2
            else:  # ASCII
                width += font_size * 0.6
        max_width = max(max_width, width)

    width = max(80, max_width + padding * 2)
    height = max(40, len(lines) * (font_size + 4) + padding * 2)

    return width, height
```

### 间距规范

| 间距类型 | 推荐值 | 说明 |
|---------|--------|------|
| 节点水平间距 | 80px | 同行节点之间 |
| 节点垂直间距 | 60px | 相邻行之间 |
| 分组内边距 | 20px | 分组边框到内容 |
| 分组标题高度 | 30px | 分组标题区域 |

---

## 布局算法

### 层次布局 (Hierarchical)

适用于：流程图、组织架构图

```python
def hierarchical_layout(nodes, edges, direction="TB", spacing=(80, 60)):
    """
    层次布局算法

    参数:
        nodes: 节点列表
        edges: 边列表
        direction: TB/BT/LR/RL
        spacing: (水平间距, 垂直间距)
    """
    # 1. 计算节点层级
    levels = assign_levels(nodes, edges)

    # 2. 同层节点排序（减少交叉）
    for level in levels:
        sort_by_barycenter(level, edges)

    # 3. 计算坐标
    h_spacing, v_spacing = spacing
    for level_idx, level in enumerate(levels):
        for node_idx, node in enumerate(level):
            if direction == "TB":
                node.x = node_idx * h_spacing
                node.y = level_idx * v_spacing
            elif direction == "LR":
                node.x = level_idx * h_spacing
                node.y = node_idx * v_spacing
```

### 力导向布局 (Force-Directed)

适用于：网络拓扑图、关系图

```python
def force_directed_layout(nodes, edges, iterations=100):
    """
    力导向布局算法

    参数:
        nodes: 节点列表
        edges: 边列表
        iterations: 迭代次数
    """
    for _ in range(iterations):
        # 1. 计算斥力（节点间）
        for n1 in nodes:
            for n2 in nodes:
                if n1 != n2:
                    apply_repulsion(n1, n2)

        # 2. 计算引力（连线）
        for edge in edges:
            apply_attraction(edge.source, edge.target)

        # 3. 更新位置
        for node in nodes:
            node.update_position()
```

### 树形布局 (Tree)

适用于：思维导图、组织架构图

```python
def tree_layout(root, direction="LR", spacing=(100, 50)):
    """
    树形布局算法

    参数:
        root: 根节点
        direction: LR/RL/TB/BT
        spacing: (层间距, 节点间距)
    """
    # 1. 计算子树尺寸
    calc_subtree_size(root)

    # 2. 分配位置
    assign_positions(root, 0, 0, direction, spacing)
```

---

## 连线样式

### 连线类型

| 类型 | edgeStyle 值 | 说明 |
|------|-------------|------|
| 正交 | orthogonalEdgeStyle | 直角转弯 |
| 弯曲 | elbowEdgeStyle | 单次转弯 |
| 曲线 | curved=1 | 平滑曲线 |
| 直线 | (无) | 直接连接 |

### 箭头类型

| 类型 | 值 | 说明 |
|------|-----|------|
| 无 | none | 无箭头 |
| 经典 | classic | 实心三角 |
| 空心 | open | 空心三角 |
| 菱形 | diamond | 菱形 |
| 圆形 | oval | 圆形 |
| 方块 | block | 方块 |

### 连线样式示例

```python
EDGE_STYLES = {
    "default": "edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=classic;",
    "dashed": "edgeStyle=orthogonalEdgeStyle;dashed=1;endArrow=classic;",
    "curved": "curved=1;endArrow=classic;",
    "bidirectional": "edgeStyle=orthogonalEdgeStyle;startArrow=classic;endArrow=classic;",
    "association": "edgeStyle=orthogonalEdgeStyle;endArrow=none;",
}
```

---

## 分组样式

### 分组结构

```xml
<mxCell id="group-1" value="分组标题"
        style="group;rounded=1;fillColor=#f5f5f5;strokeColor=#666666;
               verticalAlign=top;fontStyle=1;spacingTop=10;"
        vertex="1" parent="1" connectable="0">
  <mxGeometry x="50" y="50" width="300" height="200" as="geometry"/>
</mxCell>
```

### 分组样式属性

| 属性 | 说明 | 推荐值 |
|------|------|--------|
| rounded | 圆角 | 1 |
| fillColor | 背景色 | #f5f5f5 |
| strokeColor | 边框色 | #666666 |
| strokeWidth | 边框宽度 | 1 |
| verticalAlign | 标题位置 | top |
| spacingTop | 标题上边距 | 10 |
| fontStyle | 标题字体 | 1 (粗体) |

---

## 对齐与分布

### 对齐方式

```python
def align_nodes(nodes, alignment):
    """
    对齐节点

    alignment: left/center/right/top/middle/bottom
    """
    if alignment == "left":
        min_x = min(n.x for n in nodes)
        for n in nodes:
            n.x = min_x
    elif alignment == "center":
        center_x = sum(n.x + n.width/2 for n in nodes) / len(nodes)
        for n in nodes:
            n.x = center_x - n.width/2
    # ... 其他对齐方式
```

### 均匀分布

```python
def distribute_nodes(nodes, direction, spacing=None):
    """
    均匀分布节点

    direction: horizontal/vertical
    spacing: 固定间距（None 则自动计算）
    """
    if direction == "horizontal":
        nodes.sort(key=lambda n: n.x)
        if spacing is None:
            total_width = sum(n.width for n in nodes)
            available = nodes[-1].x + nodes[-1].width - nodes[0].x
            spacing = (available - total_width) / (len(nodes) - 1)

        x = nodes[0].x
        for n in nodes:
            n.x = x
            x += n.width + spacing
```

---

## 最佳实践

1. **保持一致性**：同类元素使用相同样式
2. **适当留白**：节点间保持足够间距
3. **层次分明**：使用颜色和大小区分层级
4. **减少交叉**：优化布局减少连线交叉
5. **对齐整齐**：同层节点对齐
6. **颜色克制**：避免使用过多颜色
