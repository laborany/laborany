# Draw.io XML 格式详解

> 本文档详细说明 draw.io 的 mxGraph XML 格式规范。

---

## 文件结构

draw.io 文件本质是 XML 格式，扩展名为 `.drawio` 或 `.xml`。

### 基本结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2024-01-01T00:00:00.000Z"
        agent="Mozilla/5.0" version="22.0.0" type="device">
  <diagram id="diagram-id" name="Page-1">
    <mxGraphModel dx="1000" dy="600" grid="1" gridSize="10"
                  guides="1" tooltips="1" connect="1" arrows="1"
                  fold="1" page="1" pageScale="1" pageWidth="827"
                  pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- 节点和连线定义 -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 核心元素

### mxCell - 基础单元

所有图形元素都是 `mxCell`，通过属性区分类型：

```xml
<!-- 节点 -->
<mxCell id="node-1" value="节点标签" style="..."
        vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>

<!-- 连线 -->
<mxCell id="edge-1" value="" style="..."
        edge="1" parent="1" source="node-1" target="node-2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

### 关键属性

| 属性 | 说明 |
|------|------|
| id | 唯一标识符 |
| value | 显示文本（支持 HTML） |
| style | 样式字符串 |
| vertex | 值为 "1" 表示节点 |
| edge | 值为 "1" 表示连线 |
| parent | 父元素 ID |
| source | 连线起点节点 ID |
| target | 连线终点节点 ID |

---

## 样式系统

### 样式字符串格式

样式是分号分隔的键值对：

```
shape=rectangle;rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontFamily=Microsoft YaHei;
```

### 常用样式属性

#### 形状属性

| 属性 | 说明 | 示例值 |
|------|------|--------|
| shape | 形状类型 | rectangle, ellipse, rhombus |
| rounded | 圆角 | 0, 1 |
| arcSize | 圆角大小 | 10, 20 |

#### 填充和边框

| 属性 | 说明 | 示例值 |
|------|------|--------|
| fillColor | 填充颜色 | #ffffff, none |
| strokeColor | 边框颜色 | #000000 |
| strokeWidth | 边框宽度 | 1, 2 |
| dashed | 虚线 | 0, 1 |
| dashPattern | 虚线模式 | 3 3 |

#### 文字属性

| 属性 | 说明 | 示例值 |
|------|------|--------|
| fontFamily | 字体 | Microsoft YaHei |
| fontSize | 字号 | 12, 14 |
| fontColor | 字体颜色 | #000000 |
| fontStyle | 字体样式 | 0=普通, 1=粗体, 2=斜体 |
| align | 水平对齐 | left, center, right |
| verticalAlign | 垂直对齐 | top, middle, bottom |

#### 连线属性

| 属性 | 说明 | 示例值 |
|------|------|--------|
| edgeStyle | 连线样式 | orthogonalEdgeStyle, elbowEdgeStyle |
| curved | 曲线 | 0, 1 |
| startArrow | 起点箭头 | none, classic, block |
| endArrow | 终点箭头 | none, classic, block |
| startFill | 起点箭头填充 | 0, 1 |
| endFill | 终点箭头填充 | 0, 1 |

---

## 形状类型

### 基础形状

```xml
<!-- 矩形 -->
<mxCell style="shape=rectangle;"/>

<!-- 圆角矩形 -->
<mxCell style="rounded=1;"/>

<!-- 椭圆 -->
<mxCell style="shape=ellipse;"/>

<!-- 菱形 -->
<mxCell style="shape=rhombus;"/>

<!-- 平行四边形 -->
<mxCell style="shape=parallelogram;"/>

<!-- 六边形 -->
<mxCell style="shape=hexagon;"/>

<!-- 圆柱（数据库） -->
<mxCell style="shape=cylinder;"/>

<!-- 云形 -->
<mxCell style="shape=cloud;"/>
```

### 流程图形状

```xml
<!-- 开始/结束 -->
<mxCell style="shape=ellipse;fillColor=#d5e8d4;strokeColor=#82b366;"/>

<!-- 处理步骤 -->
<mxCell style="rounded=0;fillColor=#dae8fc;strokeColor=#6c8ebf;"/>

<!-- 判断/决策 -->
<mxCell style="shape=rhombus;fillColor=#fff2cc;strokeColor=#d6b656;"/>

<!-- 输入/输出 -->
<mxCell style="shape=parallelogram;fillColor=#e1d5e7;strokeColor=#9673a6;"/>

<!-- 文档 -->
<mxCell style="shape=document;fillColor=#f5f5f5;strokeColor=#666666;"/>
```

---

## 中文支持

### 字体设置

**重要**：必须设置 `fontFamily` 以支持中文显示。

```xml
<!-- 全局默认字体 -->
<mxGraphModel ... defaultFontFamily="Microsoft YaHei">

<!-- 单个元素字体 -->
<mxCell style="fontFamily=Microsoft YaHei;"/>
```

### 推荐字体

| 平台 | 推荐字体 |
|------|---------|
| Windows | Microsoft YaHei |
| macOS | PingFang SC |
| Linux | Noto Sans CJK SC |
| 通用 | Arial Unicode MS |

### 中文字符宽度

计算文本宽度时，中文字符约 14px/字符（12pt 字号）。

```python
def calc_text_width(text, font_size=12):
    """计算文本宽度"""
    width = 0
    for char in text:
        if ord(char) > 127:  # 中文字符
            width += font_size * 1.2
        else:  # ASCII 字符
            width += font_size * 0.6
    return width
```

---

## 几何信息

### mxGeometry

```xml
<!-- 节点几何 -->
<mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>

<!-- 连线几何（相对定位） -->
<mxGeometry relative="1" as="geometry">
  <mxPoint x="160" y="130" as="sourcePoint"/>
  <mxPoint x="160" y="200" as="targetPoint"/>
</mxGeometry>

<!-- 连线路径点 -->
<mxGeometry relative="1" as="geometry">
  <Array as="points">
    <mxPoint x="200" y="150"/>
    <mxPoint x="200" y="250"/>
  </Array>
</mxGeometry>
```

### 坐标系统

- 原点 (0, 0) 在左上角
- X 轴向右为正
- Y 轴向下为正
- 单位为像素

---

## 分组

### 创建分组

```xml
<!-- 分组容器 -->
<mxCell id="group-1" value="分组标题" style="group;rounded=1;fillColor=#f5f5f5;"
        vertex="1" parent="1" connectable="0">
  <mxGeometry x="50" y="50" width="300" height="200" as="geometry"/>
</mxCell>

<!-- 分组内的节点 -->
<mxCell id="node-1" value="节点1" style="..."
        vertex="1" parent="group-1">
  <mxGeometry x="20" y="40" width="100" height="40" as="geometry"/>
</mxCell>
```

### 分组样式

```
group;rounded=1;fillColor=#f5f5f5;strokeColor=#666666;verticalAlign=top;
```

---

## 完整示例

### 简单流程图

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram id="flow-1" name="流程图">
    <mxGraphModel dx="1000" dy="600" grid="1" gridSize="10"
                  guides="1" tooltips="1" connect="1" arrows="1"
                  fold="1" page="1" pageScale="1" pageWidth="827"
                  pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>

        <!-- 开始节点 -->
        <mxCell id="start" value="开始"
                style="shape=ellipse;fillColor=#d5e8d4;strokeColor=#82b366;fontFamily=Microsoft YaHei;"
                vertex="1" parent="1">
          <mxGeometry x="100" y="50" width="80" height="40" as="geometry"/>
        </mxCell>

        <!-- 处理节点 -->
        <mxCell id="process" value="处理数据"
                style="rounded=0;fillColor=#dae8fc;strokeColor=#6c8ebf;fontFamily=Microsoft YaHei;"
                vertex="1" parent="1">
          <mxGeometry x="80" y="130" width="120" height="60" as="geometry"/>
        </mxCell>

        <!-- 结束节点 -->
        <mxCell id="end" value="结束"
                style="shape=ellipse;fillColor=#f8cecc;strokeColor=#b85450;fontFamily=Microsoft YaHei;"
                vertex="1" parent="1">
          <mxGeometry x="100" y="230" width="80" height="40" as="geometry"/>
        </mxCell>

        <!-- 连线 -->
        <mxCell id="e1" value=""
                style="edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=classic;"
                edge="1" parent="1" source="start" target="process">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>

        <mxCell id="e2" value=""
                style="edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=classic;"
                edge="1" parent="1" source="process" target="end">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 最佳实践

1. **始终设置 fontFamily**：确保中文正确显示
2. **使用语义化 ID**：如 `start`, `process-1`, `decision-1`
3. **保持样式一致**：使用主题配置统一样式
4. **合理使用分组**：相关节点放入同一分组
5. **避免重叠**：使用自动布局或手动调整位置
