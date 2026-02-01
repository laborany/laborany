# Draw.io 多轮修改工作流指南

> 本文档详细说明如何在多轮对话中追踪图表状态、生成修改摘要、处理用户反馈。

---

## 核心理念

**增量修改优于全量重写**

每次修改只触及需要变更的部分，保留原图表的：
- 节点位置和布局
- 样式和主题
- 连线关系
- 分组结构

---

## 工作流程

### 第一轮：初始分析

```
1. 用户提供需求或现有图表
   ↓
2. 分析图表结构
   - 新建：规划节点和连线
   - 编辑：加载并解析现有图表
   ↓
3. 向用户确认需求
   - 图表类型？
   - 具体内容？
   - 样式偏好？
```

### 后续轮次：增量修改

```
1. 接收用户反馈
   ↓
2. 定位需要修改的部分
   - 使用节点 ID 或标签
   - 记录修改位置
   ↓
3. 执行修改
   ↓
4. 生成修改摘要
   ↓
5. 询问后续需求
```

---

## 图表状态追踪

### 状态信息

每轮对话需要追踪：

| 信息 | 说明 |
|------|------|
| 图表路径 | 当前操作的 .drawio 文件位置 |
| 节点数量 | 当前图表的节点数 |
| 连线数量 | 当前图表的连线数 |
| 分组数量 | 当前图表的分组数 |
| 修改历史 | 本次会话的所有修改 |
| 待确认项 | 需要用户确认的问题 |

### 状态模板

```
## 当前图表状态

- 图表: [文件名]
- 节点: [N] 个
- 连线: [M] 条
- 分组: [K] 个
- 已完成修改: [X] 处
- 待处理: [描述]
```

---

## 修改摘要生成

### 格式规范

```markdown
## 修改摘要

本次修改共涉及 N 处变更：

### 节点修改
1. **节点 [ID]**:
   - 原标签: "[原内容]"
   - 新标签: "[新内容]"

### 连线修改
1. **连线 [ID]**: 删除
2. **连线 [ID]**: 新增 "[源]" → "[目标]"

### 样式调整
1. **节点 [ID]**: 应用 [样式描述]

### 新增内容
1. **节点 [ID]**: 新增 "[标签]"
```

### 示例

```markdown
## 修改摘要

本次修改共涉及 4 处变更：

### 节点修改
1. **节点 n2**:
   - 原标签: "处理"
   - 新标签: "数据处理"

2. **节点 n3**:
   - 原标签: "判断"
   - 新标签: "条件判断"

### 连线修改
1. **连线 e3**: 删除

### 新增内容
1. **节点 n5**: 新增 "日志记录"
```

---

## 用户反馈处理

### 反馈类型与响应

| 反馈类型 | 响应方式 |
|---------|---------|
| 确认完成 | 导出 PNG，提供下载 |
| 继续修改 | 进入下一轮修改 |
| 撤销修改 | 回退到上一版本 |
| 调整修改 | 修正刚才的变更 |

### 响应模板

**确认完成时：**
```
图表已完成所有修改。

修改总结：
- 节点修改: N 处
- 连线修改: M 处
- 新增内容: K 处

文件已保存：
- 源文件: [文件名].drawio
- 预览图: [文件名].png
```

**继续修改时：**
```
好的，请告诉我还需要修改什么。

当前图表状态：
- 已完成 N 处修改
- 最后修改: [描述]
```

---

## 最佳实践

### 1. 精确定位

使用多种方式定位修改位置：
- 节点 ID（n1, n2, ...）
- 节点标签（"开始"、"处理"）
- 连线 ID（e1, e2, ...）
- 分组 ID（g1, g2, ...）

**避免**：使用模糊描述（"那个节点"、"第一个框"）

### 2. 最小化修改

```python
# 好的做法：只修改变化的属性
diagram.update_node("n2", label="新标签")

# 避免：删除重建
diagram.remove_node("n2")
diagram.add_node("n2", "新标签", ...)
```

### 3. 批量处理

相关修改分组处理：
- 同一分组的节点 → 一次处理
- 同类型修改（如样式更新）→ 批量处理
- 每批 5-15 处修改

### 4. 验证修改

每次修改后验证：
```python
# 验证图表结构
diagram.validate()

# 导出预览
export_png("output.drawio", "preview.png")
```

---

## 常见场景

### 场景1：添加新节点

```
用户: 在"处理"后面加一个"验证"步骤

响应:
1. 定位"处理"节点
2. 创建"验证"节点
3. 调整连线关系
4. 重新布局
5. 生成摘要
```

### 场景2：修改节点标签

```
用户: 把"判断"改成"条件检查"

响应:
1. 查找标签为"判断"的节点
2. 更新标签
3. 生成摘要
```

### 场景3：调整布局

```
用户: 把图表改成从左到右的布局

响应:
1. 调用 auto_layout(direction="LR")
2. 重新计算节点位置
3. 导出预览
```

### 场景4：多轮迭代

```
第1轮: 用户描述需求，生成初始图表
第2轮: 用户要求添加节点
第3轮: 用户要求修改连线
第4轮: 用户确认完成

每轮都：
- 执行修改
- 生成摘要
- 询问后续
```

---

## 错误处理

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 节点不存在 | ID 或标签错误 | 列出所有节点供用户选择 |
| 连线无效 | 源或目标节点不存在 | 检查节点 ID |
| 布局失败 | 循环依赖 | 检查连线关系 |
| 导出失败 | CLI 未安装 | 自动安装 draw.io CLI |

### 恢复策略

1. 保留原始图表备份
2. 每批修改后验证
3. 出错时回退到上一个正确状态

---

## 工具命令速查

```python
from scripts.diagram import Diagram
from scripts.exporter import export_png, export_svg
from scripts.installer import ensure_drawio_cli

# 创建新图表
diagram = Diagram(title="标题", theme="default")

# 加载现有图表
diagram = Diagram.load("input.drawio")

# 节点操作
diagram.add_node(id, label, shape, x, y)
diagram.update_node(id, label=None, shape=None)
diagram.remove_node(id)
diagram.find_nodes(label_contains="关键词")

# 连线操作
diagram.add_edge(source, target, label)
diagram.remove_edge(id)

# 分组操作
diagram.add_group(id, label, children)

# 布局
diagram.auto_layout(direction="TB", spacing=(80, 60))

# 保存和导出
diagram.save("output.drawio")
export_png("output.drawio", "output.png", scale=2)
export_svg("output.drawio", "output.svg")
```

---

## Python API 速查

```python
from skills.drawio.scripts import Diagram
from skills.drawio.scripts.exporter import export_png

# 初始化
diagram = Diagram(title="流程图")

# 添加节点
diagram.add_node("start", "开始", shape="ellipse")
diagram.add_node("process", "处理", shape="rectangle")
diagram.add_node("end", "结束", shape="ellipse")

# 添加连线
diagram.add_edge("start", "process")
diagram.add_edge("process", "end")

# 自动布局
diagram.auto_layout(direction="TB")

# 保存
diagram.save("flowchart.drawio")

# 导出 PNG
export_png("flowchart.drawio", "flowchart.png")
```
