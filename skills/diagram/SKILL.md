---
name: 论文图表助手
description: |
  智能图表生成助手，支持流程图、架构图、时序图等专业图表创建。
  触发场景:
  (1) 用户需要创建流程图、架构图、时序图等
  (2) 用户需要论文配图、技术文档插图
  (3) 用户询问"帮我画个图"、"画个流程图"、"做个架构图"
  支持: 论文配图、技术文档、演示汇报、教学材料等场景
icon: 📐
category: 办公
---

# Diagram 智能图表助手

## 核心原则

1. **五阶段工作流**: 需求理解 → 结构规划 → 设计构思 → 生成图表 → 迭代修改
2. **增量修改优先**: 只修改需要修改的部分，保留原图表完整性
3. **主动澄清需求**: 不确定时先问，不要猜测用户意图
4. **等待用户回答**: 使用 AskUserQuestion 后必须停止等待，**绝对禁止自己假设答案继续执行**

---

## 技术方案

**静态 HTML + CDN**

生成独立的 HTML 文件，内嵌 React 18 + Tailwind CSS 4 + html2canvas：
- 零依赖，只需浏览器
- 跨平台，Windows/Mac/Linux 通用
- 一键导出 PNG

---

## 任务识别与路由

### 支持的图表类型

| 类型 | 英文 | 适用场景 |
|------|------|----------|
| 流程图 | Flowchart | 算法步骤、业务流程、���策逻辑 |
| 架构图 | Architecture | 系统设计、模块关系、技术栈 |
| 时序图 | Sequence | API 调用、消息传递、交互流程 |
| 类图 | Class | 面向对象设计、数据模型 |
| 思维导图 | Mindmap | 概念整理、知识结构 |

---

## 五阶段工作流

### 阶段一：需求理解

在开始任何操作前，必须：

**1. 识别任务类型**
- 流程图 / 架构图 / 时序图 / 类图 / 思维导图 / 自定义

**2. 收集素材**
- 读取用户提供的文档 (PDF/DOCX/MD)
- 分析用户上传的图片
- 整理关键信息点

**3. 主动澄清不明确的需求**

> **重要**: 当需求不够明确时，**必须使用 AskUserQuestion 工具**询问用户，并**等待用户回答后才能继续**。
> **禁止**: 自己假设用户的回答然后继续执行。

对于**创建图表**任务，如果用户没有明确指定，必须询问：

```
使用 AskUserQuestion 工具询问以下问题：

问题1: 图表类型是什么？
- 选项: 流程图 / 架构图 / 时序图 / 其他

问题2: 图表用途？
- 选项: 论文配图 / 技术文档 / 演示汇报 / 其他

问题3: 视觉风格偏好？
- 选项: 学术简约（黑白）/ 商务专业（蓝色系）/ 彩色活泼 / 极简现代
```

**调用 AskUserQuestion 后，必须停止并等待用户回答。绝对不能自己假设答案继续执行。**

### 阶段二：结构规划

**1. 生成图表结构大纲**

```markdown
## 图表大纲

### 图表类型: [类型]

### 节点列表:
1. [节点类型]: [内容]
2. [节点类型]: [内容]
...

### 连接关系:
- 1 → 2
- 2 → 3 (条件标签)
...
```

**2. 等待用户确认**

使用 AskUserQuestion 工具询问：
```
问题: 大纲是否符合您的预期？
- 选项: 确认，开始设计 / 需要调整大纲 / 添加更多内容
```

**等待用户回答后再继续。**

### 阶段三：设计构思

**1. 选择/应用主题**

可用预设主题：
- `academic` - 学术主题（黑白配色，简洁风格）
- `corporate` - 商务主题（蓝色配色，专业风格）
- `colorful` - 彩色主题（多彩配色，活泼风格）
- `minimal` - 极简主题（灰度配色，极简风格）

**2. 规划视觉呈现**

确定：
- 节点样式（圆角、阴影、边框）
- 连线样式（颜色、粗细、箭头）
- 字体大小与间距
- 整体布局方向（水平/垂直）

### 阶段四：生成图表

**1. 生成 HTML 文件**

参考 [`references/react-components.md`](references/react-components.md) 和 [`templates/`](templates/) 目录下的模板。

**2. 保存文件**

保存到用户工作目录的 `figures/` 文件夹：
```
figures/
└── {描述性名称}.html
```

**3. 告知用户**

```
图表已生成���

文件位置: figures/{name}.html

请用浏览器打开此文件预览，点击"导出 PNG"按钮可下载图片。
```

### 阶段五：迭代修改

**1. 接收用户反馈**

**2. 定位修改位置**
- 使用节点编号
- 使用节点内容
- 使用元素类型（标题/节点/连线）

**3. 增量更新**

直接修改 HTML 文件中的 React 组件代码。

**4. 生成修改摘要**

```markdown
## 修改摘要

本次修改共涉及 N 处变更：

1. [节点/位置]: [原内容] → [新内容]
2. [样式]: [调整说明]
```

**5. 询问后续需求**

使用 AskUserQuestion 工具询问：
```
问题: 接下来您想？
- 选项: 继续修改其他部分 / 调整刚才的修改 / 确认完成
```

**等待用户回答后再继续。**

---

## 参考文档

| 文档 | 路径 | 内容 |
|------|------|------|
| React 组件 | [`references/react-components.md`](references/react-components.md) | 节点、连线组件 |
| Tailwind 样式 | [`references/tailwind-styles.md`](references/tailwind-styles.md) | 主题、样式类 |
| 设计原则 | [`references/design-principles.md`](references/design-principles.md) | 论文图表规范 |
| 工作流指南 | [`WORKFLOW.md`](WORKFLOW.md) | 多轮修改详细流程 |

## 模板文件

| 模板 | 路径 | 用途 |
|------|------|------|
| 流程图 | [`templates/flowchart.html`](templates/flowchart.html) | 算法、业务流程 |
| 架构图 | [`templates/architecture.html`](templates/architecture.html) | 系统设计 |
| 时序图 | [`templates/sequence.html`](templates/sequence.html) | API 调用、消息传递 |
| 类图 | [`templates/class.html`](templates/class.html) | 面向对象设计 |
| 思维导图 | [`templates/mindmap.html`](templates/mindmap.html) | 概念整理、知识结构 |

---

## 素材处理

### PDF 文档处理

当用户提供 PDF 文档时：

1. **读取文档**：使用 Read 工具读取 PDF 内容
2. **提取信息**：识别关键信息点（标题、步骤、流程、关系）
3. **整理结构**：将信息整理为图表结构大纲
4. **确认理解**：使用 AskUserQuestion 确认提取的信息是否准确

### 图片物料处理

当用户提供图片参考时：

1. **查看图片**：使用 Read 工具查看图片内容
2. **分析结构**：识别图片中的图表类型、节点、连接关系
3. **提取元素**：提取可复用的设计元素（颜色、布局、风格）
4. **生成新图**：基于分析结果生成新的图表

### 处理原则

- **不盲目复制**：理解素材意图，而非机械复制
- **主动确认**：提取信息后必须与用户确认
- **增量整合**：多个素材时，逐步整合信息

---

## 输出约定

- **目录**: 用户工作目录下的 `figures/`
- **命名**: `{描述性名称}.html`
- **示例**: `figures/login-flow.html`, `figures/system-arch.html`

---

## HTML 文件结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>图表标题</title>
  <!-- CDN 依赖 -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    // React 组件代码
  </script>
</body>
</html>
```

---

## 依赖

无需安装任何依赖，只需要：
- 现代浏览器（Chrome/Firefox/Edge/Safari）
- 网络连接（加载 CDN）

---

## Code Style Guidelines

- Write concise code
- Avoid verbose variable names and redundant operations
- 中文注释，ASCII 风格分块
- 函数短小，只做一件事
