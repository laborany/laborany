---
name: 图表绘制助手
description: |
  智能图表绘制助手，支持流程图、架构图、序列图、思维导图等多种图表类型。
  触发场景:
  (1) 用户需要绘制流程图、架构图、思维导图等
  (2) 用户需要编辑或修改现有 .drawio 文件
  (3) 用户询问"帮我画个图"、"画个流程图"、"架构图"
  支持: 流程图、架构图、序列图、思维导图、组织架构图、网络拓扑图、UML图
icon: 📐
category: 办公
---

# Draw.io 智能图表助手

## ⚠️ 强制要求

> **必须使用内置脚本**：本 Skill 目录下的 `scripts/` 包含完整的图表生成和导出功能。
> **禁止**：自己编写 XML 生成代码、自己下载 draw.io、询问用户是否安装。
> **必须**：先设置 Python 路径，再 import `scripts.diagram.Diagram` 和 `scripts.exporter.export_png`。

### 路径设置（每个脚本开头必须包含）

由于工作目录可能不在 skill 目录下，**必须先动态查找并设置 Python 路径**：

```python
# ═══════════════════════════════════════════════════════════════
# 路径设置 - 每个脚本开头必须包含这段代码
# ═══════════════════════════════════════════════════════════════
import sys
from pathlib import Path

def find_skill_dir(skill_name: str) -> Path:
    """从当前目录向上搜索 skill 目录"""
    current = Path.cwd()
    while current != current.parent:
        for base in ["skills", "laborany/skills"]:
            skill_path = current / base / skill_name
            if skill_path.exists():
                return skill_path
        current = current.parent
    raise FileNotFoundError(f"找不到 {skill_name} skill 目录")

skill_dir = find_skill_dir("drawio")
sys.path.insert(0, str(skill_dir))
# ═══════════════════════════════════════════════════════════════

# 现在可以正常导入
from scripts.diagram import Diagram
from scripts.exporter import export_png
```

### 完整示例

```python
# ═══════════════════════════════════════════════════════════════
# 路径设置
# ═══════════════════════════════════════════════════════════════
import sys
from pathlib import Path

def find_skill_dir(skill_name: str) -> Path:
    """从当前目录向上搜索 skill 目录"""
    current = Path.cwd()
    while current != current.parent:
        for base in ["skills", "laborany/skills"]:
            skill_path = current / base / skill_name
            if skill_path.exists():
                return skill_path
        current = current.parent
    raise FileNotFoundError(f"找不到 {skill_name} skill 目录")

skill_dir = find_skill_dir("drawio")
sys.path.insert(0, str(skill_dir))
# ═══════════════════════════════════════════════════════════════

from scripts.diagram import Diagram
from scripts.exporter import export_png

diagram = Diagram(title="标题")
diagram.add_node("n1", "节点1")
diagram.save("output.drawio")
export_png("output.drawio", "output.png")  # CLI 自动安装，无需询问
```

## 核心原则

1. **五阶段工作流**: 需求理解 → 结构规划 → 样式设计 → 生成图表 → 迭代修改
2. **增量修改优先**: 只修改需要修改的部分，保留原图表完整性
3. **主动澄清需求**: 不确定时先问，不要猜测用户意图
4. **等待用户回答**: 使用 AskUserQuestion 后必须停止等待，**绝对禁止自己假设答案继续执行**

---

## 任务识别与路由

### 创建新图表
使用 **Diagram 类** (Python)，参考 [`references/xml-format.md`](references/xml-format.md)

### 编辑现有图表
加载 .drawio 文件 → 使用 Diagram 类修改 → 导出

### 导出图片
使用 **exporter.py** 调用 draw.io CLI 导出 PNG/SVG

---

## 五阶段工作流

### 阶段一：需求理解

在开始任何操作前，必须：

**1. 识别任务类型**
- 创建新图表
- 编辑现有图表
- 导出图片

**2. 主动澄清不明确的需求**

> **重要**: 当需求不够明确时，**必须使用 AskUserQuestion 工具**询问用户，并**等待用户回答后才能继续**。
> **禁止**: 自己假设用户的回答然后继续执行。

对于**创建新图表**任务，如果用户没有明确指定，必须询问：

```
使用 AskUserQuestion 工具询问以下问题：

问题1: 图表类型是什么？
- 选项: 流程图 / 架构图 / 序列图 / 思维导图 / 其他

问题2: 图表复杂度？
- 选项: 简单（5-10个节点）/ 中等（10-20个节点）/ 复杂（20个以上）

问题3: 视觉风格偏好？
- 选项: 商务简约 / 技术蓝图 / 极简黑白 / 多彩活泼
```

**调用 AskUserQuestion 后，必须停止并等待用户回答。绝对不能自己假设答案继续执行。**

### 阶段二：结构规划

**1. 生成图表结构大纲**

```markdown
## 图表大纲

### 节点列表
1. [节点1] - [描述]
2. [节点2] - [描述]
...

### 连接关系
- [节点1] → [节点2]: [关系描述]
- [节点2] → [节点3]: [关系描述]
...

### 分组（如有）
- [组名]: 包含 [节点列表]
```

**2. 等待用户确认**

使用 AskUserQuestion 工具询问：
```
问题: 大纲是否符合您的预期？
- 选项: 确认，开始设计 / 需要调整大纲 / 添加更多内容
```

### 阶段三：样式设计

**1. 选择/应用主题**

可用预设主题：
- `default.json` - 默认主题（蓝色系，专业风格）
- `blueprint.json` - 蓝图主题（深蓝配色，技术风格）
- `minimal.json` - 极简主题（黑白配色，简洁风格）
- `colorful.json` - 多彩主题（活泼配色，现代风格）

**2. 规划布局**

布局方向选择：
- `TB` - 从上到下（Top to Bottom）
- `LR` - 从左到右（Left to Right）
- `BT` - 从下到上（Bottom to Top）
- `RL` - 从右到左（Right to Left）

### 阶段四：生成图表

**完整代码模板**（包含路径设置）：

```python
# ═══════════════════════════════════════════════════════════════
# 路径设置
# ═══════════════════════════════════════════════════════════════
import sys
from pathlib import Path

def find_skill_dir(skill_name: str) -> Path:
    """从当前目录向上搜索 skill 目录"""
    current = Path.cwd()
    while current != current.parent:
        for base in ["skills", "laborany/skills"]:
            skill_path = current / base / skill_name
            if skill_path.exists():
                return skill_path
        current = current.parent
    raise FileNotFoundError(f"找不到 {skill_name} skill 目录")

skill_dir = find_skill_dir("drawio")
sys.path.insert(0, str(skill_dir))
# ═══════════════════════════════════════════════════════════════

from scripts.diagram import Diagram
from scripts.exporter import export_png

# ═══════════════════════════════════════════════════════════════
# 1. 创建 Diagram 实例
# ═══════════════════════════════════════════════════════════════
diagram = Diagram(title="图表标题", theme="default")

# ═══════════════════════════════════════════════════════════════
# 2. 添加节点和连线
# ════════════════════���══════════════════════════════════════════
diagram.add_node("n1", "开始", shape="ellipse")
diagram.add_node("n2", "处理", shape="rectangle")
diagram.add_node("n3", "判断", shape="rhombus")

diagram.add_edge("n1", "n2", label="")
diagram.add_edge("n2", "n3", label="")

# ═══════════════════════════════════════════════════════════════
# 3. 自动布局
# ═══════════════════════════════════════════════════════════════
diagram.auto_layout(direction="TB", spacing=(80, 60))

# ═══════════════════════════════════════════════════════════════
# 4. 保存并导出 PNG
# ═══════════════════════════════════════════════════════════════
diagram.save("output.drawio")
success = export_png("output.drawio", "output.png")
if not success:
    print("PNG 导出失败，请下载 .drawio 文件用 draw.io 打开")
```

> **重要**: 生成 .drawio 文件后，**必须自动导出 PNG 预览**，无需询问用户。
> draw.io CLI 会自动安装，**不需要询问用户是否安装**。

**自动化流程要求**：
- 生成图表后必须自动尝试导出 PNG
- draw.io CLI 安装过程完全静默，不询问用户
- 只有在安装/导出都失败时才告知用户

### 阶段五：迭代修改

**1. 接收用户反馈**

**2. 定位修改位置**
- 使用节点 ID
- 使用节点标签搜索
- 使用连线 ID

**3. 增量更新**

```python
# 路径设置已在脚本开头完成

# 修改节点
diagram.update_node("n2", label="数据处理")

# 删除连线
diagram.remove_edge("e1")

# 添加新连线
diagram.add_edge("n2", "n3", label="新连线")

# 保存并导出
diagram.save("output.drawio")
export_png("output.drawio", "output.png")
```

**4. 生成修改摘要**

```markdown
## 修改摘要

本次修改共涉及 N 处变更：

### 节点修改
1. **节点 [ID]**: "[原标签]" → "[新标签]"

### 连线修改
1. **连线 [ID]**: 删除

### 新增内容
1. **节点 [ID]**: 新增 "[标签]"
```

**5. 询问后续需求**

使用 AskUserQuestion 工具询问：
```
问题: 接下来您想？
- 选项: 继续修改其他部分 / 调整刚才的修改 / 确认完成，下载文件
```

---

## 技术实现细节

### 创建新图表

> **强制**：必须使用 `scripts/diagram.py` 中的 Diagram 类，禁止自己生成 XML。
> **强制**：必须先设置 Python 路径（见上方"路径设置"部分）。

**Workflow**
1. 设置路径：`find_skill_dir("drawio")` + `sys.path.insert`
2. Import: `from scripts.diagram import Diagram`
3. Create diagram and add nodes/edges
4. Save: `diagram.save("output.drawio")`
5. Export PNG: `from scripts.exporter import export_png; export_png("output.drawio", "output.png")`

### 编辑现有图表

使用 **Diagram.load()** 加载现有图表。

**Workflow**
1. 设置路径（同上）
2. Load the diagram: `diagram = Diagram.load("input.drawio")`
3. Modify using Diagram API
4. Save and export

### 导出图片

> **强制**：必须使用 `scripts/exporter.py`，禁止自己下载或安装 draw.io CLI。
> CLI 安装是**完全自动化**的，**禁止询问用户**。

**Workflow**
1. 设置路径（同上）
2. Import: `from scripts.exporter import export_png`
3. Export: `export_png("input.drawio", "output.png", scale=2)`
4. 如果导出失败，静默降级为仅提供 .drawio 文件

---

## 图表类型指南

| 类型 | 说明 | 典型节点形状 | 布局方向 |
|------|------|-------------|---------|
| 流程图 | 业务流程、算法流程 | 矩形、菱形、椭圆 | TB |
| 架构图 | 系统架构、技术栈 | 矩形、圆角矩形 | TB/LR |
| 序列图 | 时序交互、消息流 | 矩形、生命线 | TB |
| 思维导图 | 概念发散、知识整理 | 圆角矩形 | LR |
| 组织架构图 | 人员层级、部门结构 | 矩形 | TB |
| 网络拓扑图 | 网络设备、连接关系 | 图标、矩形 | 自由 |

---

## 节点形状参考

| 形状 | shape 值 | 适用场景 |
|------|----------|---------|
| 矩形 | rectangle | 处理步骤、模块 |
| 圆角矩形 | rounded | 通用节点 |
| 椭圆 | ellipse | 开始/结束 |
| 菱形 | rhombus | 判断/决策 |
| 平行四边形 | parallelogram | 输入/输出 |
| 圆柱 | cylinder | 数据库 |
| 六边形 | hexagon | 准备步骤 |
| 云形 | cloud | 云服务 |

---

## 依赖

```bash
# Python
pip install defusedxml lxml

# draw.io CLI（自动安装）
# Windows: portable exe
# Linux: AppImage
# macOS: /Applications/draw.io.app
```

---

## Code Style Guidelines

- Write concise code
- Avoid verbose variable names and redundant operations
- Avoid unnecessary print statements
- 中文注释，ASCII 风格分块
