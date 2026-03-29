---
name: 视频创作助手
description: |
  智能视频创作助手，使用 Remotion 框架生成专业级动画视频。
  触发场景:
  (1) 用户需要创建产品演示、教程、数据可视化视频
  (2) 用户需要制作营销宣传、社交媒体短视频
  (3) 用户需要将论文、报告、概念转化为动画视频
  (4) 用户询问"帮我做个视频"、"创建动画"、"制作演示视频"
  支持: 产品演示、教程、数据可视化、营销宣传、原理解释、科普内容
icon: 🎬
category: 创意
---

# Video Creator 视频创作助手

## 核心原则

1. **五阶段工作流**: 需求挖掘 → 创意规划 → 脚本设计 → 代码生成 → 渲染输出
2. **先理解后创作**: 充分挖掘用户意图，设计视频角度和风格后再生成
3. **主动澄清需求**: 不确定时先问，不要猜测用户意图
4. **等待用户回答**: 使用 AskUserQuestion 后必须停止等待，**绝对禁止自己假设答案继续执行**

---

## 技术方案

**Remotion + React**

使用 Remotion 框架生成专业级视频：
- 可导出 MP4/WebM 视频文件
- 支持复杂动画、转场、数据可视化
- 专业级视频质量

### 依赖要求

| 依赖 | 版本 | 必需 | 安装方式 |
|------|------|------|----------|
| Node.js | 18+ | 是 | https://nodejs.org |
| ffmpeg | 最新 | 是 | `winget install ffmpeg` |
| Chrome | 最新 | 否 | 推荐安装 |

---

## 五阶段工作流

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   阶段一     │     │   阶段二     │     │   阶段三     │
│  需求挖掘    │────▶│  创意规划    │────▶│  脚本设计    │
│             │     │             │     │             │
│ • 理解意图   │     │ • 视频角度   │     │ • 详细分镜   │
│ • 收集素材   │     │ • 演示风格   │     │ • 时间线     │
│ • 澄清需求   │     │ • 视频长度   │     │ • 动画规划   │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
┌──────────────┐     ┌──────────────┐           │
│   阶段五     │     │   阶段四     │           │
│  渲染输出    │◀────│  代码生成    │◀──────────┘
│             │     │             │
│ • 执行渲染   │     │ • React 代码 │
│ • 迭代修改   │     │ • 组件组装   │
│ • 导出视频   │     │ • 样式配置   │
└──────────────┘     └──────────────┘
```

---

### 阶段一：需求挖掘

在开始任何操作前，必须：

**1. 检查依赖**

首先运行依赖检查脚本：
```bash
python scripts/check_deps.py
```

如果缺少依赖，指导用户安装后再继续。

**2. 识别视频类型**

- 产品演示 / 教程
- 数据可视化
- 营销宣传 / 社交媒体
- 原理解释 / 科普内容

**3. 收集素材**

- 读取用户提供的文档 (PDF/DOCX/MD)
- 分析用户上传的图片
- 使用 mcp__laborany_web__read_page 获取网页内容
- 整理关键信息点

**4. 主动澄清不明确的需求**

> **重要**: 当需求不够明确时，**必须使用 AskUserQuestion 工具**询问用户，并**等待用户回答后才能继续**。
> **禁止**: 自己假设用户的回答然后继续执行。

对于**创建视频**任务，如果用户没有明确指定，必须询问：

```
使用 AskUserQuestion 工具询问以下问题：

问题1: 视频类型是什么？
- 选项: 产品演示/教程 / 数据可视化 / 营销宣传 / 原理解释

问题2: 目标受众是谁？
- 选项: 技术人员 / 普通用户 / 决策者 / 学生

问题3: 发布平台？
- 选项: YouTube / 社交媒��(抖音/Instagram) / 内部演示 / 其他

问题4: 预期时长？
- 选项: 15-30秒 / 1-2分钟 / 3-5分钟 / 更长
```

**调用 AskUserQuestion 后，必须停止并等待用户回答。绝对不能自己假设答案继续执行。**

---

### 阶段二：创意规划

**1. 确定视频角度**

根据内容类型选择叙事角度：
- 问题-解决方案（适合产品演示）
- 步骤教学（适合教程）
- 数据故事（适合数据可视化）
- 情感共鸣（适合营销）

**2. 选择视觉风格**

参考 [`references/video-styles.md`](references/video-styles.md)：
- 极简现代 (Minimal)
- 科技感 (Tech)
- 商务专业 (Corporate)
- 活泼多彩 (Playful)

**3. 确定视频参数**

| 平台 | 分辨率 | 帧率 | 推荐时长 |
|------|--------|------|----------|
| YouTube 横屏 | 1920×1080 | 30fps | 1-5分钟 |
| YouTube Shorts | 1080×1920 | 30fps | 30-60秒 |
| Instagram Reels | 1080×1920 | 30fps | 15-30秒 |
| TikTok | 1080×1920 | 30fps | 15-60秒 |

**4. 等待用户确认**

使用 AskUserQuestion 工具询问：
```
问题: 以上创意方向是否符合您的预期？
- 选项: 确认，开始设计分镜 / 调整视频角度 / 调整视觉风格 / 调整视频参数
```

**等待用户回答后再继续。**

---

### 阶段三：脚本设计

**1. 生成分镜脚本**

参考 [`references/storyboard-guide.md`](references/storyboard-guide.md) 生成详细分镜：

```markdown
## 分镜脚本

### 基本信息
- 总时长: XX 秒
- 分辨率: 1920×1080
- 帧率: 30fps
- 风格: [选定风格]

---

### 场景 1: 开场 (0:00 - 0:05)
- 画面: Logo 居中显示
- 动画: ScaleIn + FadeIn
- 背景: 品牌主色

### 场景 2: [场景名称] (0:05 - 0:XX)
- 画面: [描述]
- 动画: [动画类型]
- 文字: [文案]
- 备注: [其他说明]

...
```

**2. 等待用户确认**

使用 AskUserQuestion 工具询问：
```
问题: 分镜脚本是否符合您的预期？
- 选项: 确认，开始生成代码 / 调整场景内容 / 调整时间分配 / 添加更多场景
```

**等待用户回答后再继续。**

---

### 阶段四：代码生成

**1. 初始化项目**

如果是新项目，运行初始化脚本：
```bash
python scripts/init_project.py ./video-project
```

**2. 生成 React 组件**

参考以下文档：
- [`references/remotion-core.md`](references/remotion-core.md) - 核心概念
- [`references/remotion-effects.md`](references/remotion-effects.md) - 动画特效
- [`references/remotion-media.md`](references/remotion-media.md) - 媒体处理

**3. 使用预制组件**

可用的预制组件（位于 `assets/components/`）：

| 组件 | 路径 | 用途 |
|------|------|------|
| FadeIn | `animations/FadeIn.tsx` | 淡入动画 |
| SlideIn | `animations/SlideIn.tsx` | 滑入动画 |
| ScaleIn | `animations/ScaleIn.tsx` | 缩放动画 |
| Typewriter | `animations/Typewriter.tsx` | 打字机效果 |
| BarChart | `charts/BarChart.tsx` | 柱状图 |
| LineChart | `charts/LineChart.tsx` | 折线图 |
| Counter | `charts/Counter.tsx` | 数字计数器 |
| TitleSlide | `layouts/TitleSlide.tsx` | 标题页 |
| ContentSlide | `layouts/ContentSlide.tsx` | 内容页 |
| FadeTransition | `transitions/FadeTransition.tsx` | 淡入淡出转场 |
| SlideTransition | `transitions/SlideTransition.tsx` | 滑动转场 |

**4. 代码结构**

```
video-project/
├── src/
│   ├── Root.tsx              # Composition 定义
│   ├── index.ts              # 入口文件
│   └── compositions/
│       └── Main.tsx          # 主视频组件
├── public/                   # 静态资源
│   ├── images/
│   └── fonts/
└── out/                      # 输出目录
```

---

### 阶段五：渲染输出

**1. 预览视频**

```bash
python scripts/preview_video.py ./video-project
```

或在项目目录中：
```bash
npm start
```

**2. 渲染视频**

```bash
python scripts/render_video.py -p ./video-project -o out/video.mp4
```

可选参数：
- `-c, --composition`: Composition ID（默认 Main）
- `-o, --output`: 输出文件路径
- `--codec`: 编码器（h264/h265/vp8/vp9/prores）
- `-q, --quality`: 质量 1-100（默认 80）

**3. 告知用户**

```
视频已渲染完成！

文件位置: [输出路径]
分辨率: 1920×1080
时长: XX 秒
文件大小: XX MB

如需修改，请告诉我需要调整的部分。
```

**4. 迭代修改**

使用 AskUserQuestion 工具询问：
```
问题: 接下来您想？
- 选项: 修改某个场景 / 调整动画效果 / 更换配色 / 确认完成
```

**等待用户回答后再继续。**

---

## 参考文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 核心概念 | [`references/remotion-core.md`](references/remotion-core.md) | Composition、Sequence、Series |
| 媒体处理 | [`references/remotion-media.md`](references/remotion-media.md) | 图片、视频、字体 |
| 动画特效 | [`references/remotion-effects.md`](references/remotion-effects.md) | 插值、Spring、转场 |
| 风格指南 | [`references/video-styles.md`](references/video-styles.md) | 视觉风格、配色、节奏 |
| 分镜指南 | [`references/storyboard-guide.md`](references/storyboard-guide.md) | 分镜脚本模板 |

---

## 辅助脚本

| 脚本 | 路径 | 用途 |
|------|------|------|
| 依赖检查 | `scripts/check_deps.py` | 检查 Node.js、ffmpeg |
| 项目初始化 | `scripts/init_project.py` | 创建新项目 |
| 预览视频 | `scripts/preview_video.py` | 启动 Remotion Studio |
| 渲染视频 | `scripts/render_video.py` | 导出 MP4 |

---

## 素材处理

### PDF 文档处理

当用户提供 PDF 文档时：

1. **读取文档**：使用 Read 工具读取 PDF 内容
2. **提取信息**：识别关键信息点（标题、数据、流程）
3. **整理结构**：将信息整理为视频脚本
4. **确认理解**：使用 AskUserQuestion 确认提取的信息是否准确

### 网页内容处理

当用户提供网页链接时：

1. **获取内容**：使用 mcp__laborany_web__read_page 获取网页内容
2. **提取要点**：识别核心信息和数据
3. **转化脚本**：将内容转化为视频叙事

### 图片素材处理

当用户提供图片时：

1. **查看图片**：使用 Read 工具查看图片
2. **分析内容**：识别图片中的元素和风格
3. **整合设计**：将图片风格融入视频设计

---

## 输出约定

- **项目目录**: 用户工作目录下的 `video-project/` 或用户指定目录
- **输出目录**: 项目目录下的 `out/`
- **命名规则**: `video-{timestamp}.mp4`

---

## 重要提示

### Remotion 动画规则

1. **所有动画必须由 `useCurrentFrame()` 驱动**
2. **禁止使用 CSS transitions/animations**
3. **禁止使用 Tailwind 动画类名**
4. **使用 `<Img>` 组件而非原生 `<img>`**

### 代码风格

- 中文注释，ASCII 风格分块
- 函数短小，只做一件事
- 避免超过 3 层缩进
- 每个文件不超过 800 行

---

## Code Style Guidelines

- Write concise code
- Avoid verbose variable names and redundant operations
- 中文注释，ASCII 风格分块
- 函数短小，只做一件事
