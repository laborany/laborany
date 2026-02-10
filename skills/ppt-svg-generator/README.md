# PPT SVG 生成器

> 🎨 将 Markdown 文稿转化为精美、可编辑的 PPT 页面

<img width="2816" height="1536" alt="image" src="https://github.com/user-attachments/assets/2454e688-d3b8-40a2-a3f8-893bbe5060ee" />


[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## ✨ 项目简介

**PPT SVG 生成器** 是一个 [OpenCode](https://github.com/opencode-ai/opencode) Skill，帮助你将 Markdown 文稿快速转化为可导入 PowerPoint 的 SVG 文件。

### 🎯 核心特性

- **一键生成** - `/ppt-quick` 命令一键完成全流程
- **智能文稿分析** - 自动拆解内容，生成结构化页面清单
- **多风格支持** - 5 种预设风格 + 自定义配色 + AI 智能推荐
- **PPT 原生兼容** - 生成的 SVG 支持「转换为形状」后二次编辑
- **批量生成** - 一键输出所有 PPT 页面

### 📐 输出规格

| 规格 | 说明 |
|------|------|
| 尺寸 | 1920 × 1080 px (16:9) |
| 格式 | SVG（矢量，无损缩放） |
| 字体 | Microsoft YaHei / SimHei / PingFang SC |
| 兼容性 | PowerPoint 2016+ / WPS |

---

## 🚀 快速开始

### 前置要求

- 安装 [OpenCode](https://github.com/opencode-ai/opencode)
- 将本项目放置于 OpenCode 的 skills 目录

### 依赖安装（可选，用于导出功能）

如果需要使用 `/ppt-export` 命令将 SVG 导出为 PDF 或 PPTX：

```bash
cd scripts/
npm install
```

这将自动安装所有依赖并下载 Chromium 浏览器（用于 PDF 渲染）。

**跨平台支持**：✅ macOS / ✅ Windows / ✅ Linux

> 💡 如果只需要生成 SVG 文件导入 PPT，无需安装这些依赖。

### 使用流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        PPT SVG 生成流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⚡ 快捷方式  /ppt-quick @文稿.md --style=风格名称                 │
│              ↓ 一键完成全流程，无需交互                           │
│              ↓ 适合已明确需求的用户                               │
│                                                                 │
│  ─────────────────── 或分步执行 ───────────────────              │
│                                                                 │
│  步骤 1️⃣  /ppt-analyze @文稿.md                                  │
│           ↓ 分析文稿，输出页面结构清单                            │
│           ↓ 你可以修改、调整页面拆解结果                          │
│                                                                 │
│  步骤 2️⃣  /ppt-design                                            │
│           ↓ 选择风格模式（预设/自定义/AI推荐）                    │
│           ↓ 输出设计规范文档                                     │
│                                                                 │
│  步骤 3️⃣  /ppt-generate                                          │
│           ↓ 批量生成 SVG 文件                                    │
│           ↓ 自动应用 PPT 兼容性规范                              │
│                                                                 │
│  步骤 4️⃣  /ppt-export（可选）                                     │
│           ↓ 导出为 PDF/PPTX 文件                                 │
│           ↓ 适合打印分发或直接演示                               │
│                                                                 │
│  步骤 5️⃣  导入 PPT → 转换为形状 → 微调完成 ✅                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 可用命令

### `/ppt-quick` - ⚡ 一键生成（推荐）

一键完成「文稿分析 → 风格设计 → SVG 生成」全流程，适合已明确需求的用户。

**语法**：
```bash
/ppt-quick @文稿.md [--style=风格名称] [--output=输出目录]
```

**参数**：

| 参数 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `@文稿.md` | ✅ | - | 要转换的 Markdown 文件 |
| `--style` | ❌ | `品牌蓝` | 预设风格名称 |
| `--output` | ❌ | `./ppt-output/` | SVG 文件输出目录 |

**可选风格**：`极简主义`、`商务咨询`、`科技暗黑`、`瑞士平面`、`品牌蓝`

**示例**：

```bash
# 最简用法（使用默认风格「品牌蓝」）
/ppt-quick @report.md

# 指定风格
/ppt-quick @report.md --style=科技暗黑

# 指定风格和输出目录
/ppt-quick @report.md --style=商务咨询 --output=./slides/

# 自然语言方式
帮我把 @report.md 快速转成 PPT，用极简主义风格
```

**执行流程**：
1. 初始化 → 解析参数、验证文件、创建 `.ppt-session/` 目录
2. 文稿分析 → 拆解内容，保存 `.ppt-session/structure.json`
3. 风格应用 → 加载预设，保存 `.ppt-session/design.json`
4. 批量生成 → 逐页生成 SVG 文件
5. 完成报告 → 输出汇总和 PPT 导入指南

**详细文档**：[commands/quick.md](commands/quick.md)

---

### `/ppt-analyze` - 文稿分析

分析 Markdown 文稿，提取核心内容，输出结构化的 PPT 页面清单。

**语法**：
```bash
/ppt-analyze @文稿.md
```

**示例**：

```bash
# 分析文稿
/ppt-analyze @annual-report.md

# 自然语言方式
帮我分析这份文稿 @report.md，拆解成 PPT 页面
把 @proposal.md 转成 PPT 结构
```

**输出内容**：
- 页面结构表格（页码、类型、标题、内容要点、信息密度）
- 内容概要（总页数、核心主题、关键词、预计时长）
- 拆解说明

**页面类型**：封面页、引言页、观点页、图表页、流程页、对比页、总结页、结束页

**详细文档**：[commands/analyze.md](commands/analyze.md)

---

### `/ppt-design` - 风格设计

选择或定制 PPT 视觉风格，支持预设、自定义、AI 智能推荐三种模式。

**语法**：
```bash
/ppt-design
```

**三种风格模式**：

#### 📦 模式一：预设风格库

从 5 种经典风格中选择，开箱即用。

| 风格 | 特点 | 适用场景 |
|------|------|---------|
| 极简主义 | 纯白高冷，大量留白，克莱因蓝点缀 | 产品发布、设计分享、TED 演讲 |
| 商务咨询 | 深蓝稳重，McKinsey 风，橙色强调 | 方案汇报、咨询报告、投资路演 |
| 科技暗黑 | 深色背景，霓虹渐变，玻璃拟态 | 技术分享、产品演示、黑客松 |
| 瑞士平面 | 强烈对比，包豪斯风，信号红 | 创意提案、品牌展示、艺术展示 |
| 品牌蓝 | 蓝紫青配色，现代专业 | 企业培训、通用演示、正式场合 |

<img width="2003" height="1366" alt="PixPin_2026-01-25_15-58-40" src="https://github.com/user-attachments/assets/97847c7f-5dc3-4a39-b4d8-ee3dc7d0396b" />

#### 🎨 模式二：自定义风格

输入你的品牌色和风格偏好，生成定制化设计规范。

**需要提供**：
- **主色**（必填）：如 `#FF6B00` 或 "橙色"
- **配色方案**（可选）：次色、辅助色、背景色、文字色
- **风格关键词**（可选）：如 "简约"、"科技感"、"温暖"、"高端"
- **参考案例**（可选）：喜欢的 PPT 风格描述或链接

> 💡 如果只提供主色，AI 会自动生成协调的完整配色方案

#### 🔍 模式三：AI 智能推荐

深度分析文稿内容，联网搜索设计趋势，为每页独立推荐最佳风格。

**执行流程**：
1. **文稿分析** - 提取核心关键词、识别文章调性（正式/轻松、理性/感性）
2. **联网搜索** - 搜索相关主题的 PPT 设计案例和趋势
3. **综合推荐** - 输出每页的风格推荐、配色方案、视觉隐喻建议

**输出内容**：
- 文稿主题分析（关键词、调性、风格方向）
- 设计趋势参考（基于联网搜索）
- 每页风格推荐表（页码、标题、推荐风格、理由）
- 定制配色方案

---

**示例**：

```bash
# 启动风格选择（交互式）
/ppt-design

# 自然语言方式 - 选择预设风格
我想用商务咨询风格
选择科技暗黑风格

# 自然语言方式 - 自定义风格
用我们公司的配色，主色是 #FF6B00，背景用深色
我想要一个温暖的橙色系风格，简约高端

# 自然语言方式 - AI 智能推荐
根据文稿内容帮我推荐一个合适的风格
不知道用什么风格，帮我分析一下
帮我分析这份文稿适合什么风格，并推荐配色
```

**详细文档**：[commands/design.md](commands/design.md)

---

### `/ppt-generate` - 批量生成

根据页面结构和设计规范，批量生成符合 PPT 兼容性要求的 SVG 文件。

**语法**：
```bash
/ppt-generate
```

**前置条件**：
- 需要先执行 `/ppt-analyze` 获得页面结构
- 需要先执行 `/ppt-design` 获得设计规范

**示例**：

```bash
# 批量生成（需要先完成 analyze 和 design）
/ppt-generate

# 自然语言方式
生成所有 SVG 文件
开始生成 PPT
```

**输出**：
- SVG 文件存放于 `./ppt-output/` 目录
- 文件命名：`slide-01-cover.svg`, `slide-02-intro.svg` ...
- 自动应用 PPT 兼容性规范

**详细文档**：[commands/generate.md](commands/generate.md)

---

### `/ppt-export` - 📤 导出为 PDF/PPTX

将生成的 SVG 页面批量导出为可直接演示的 PDF 文档或 PPTX 幻灯片。

**语法**：
```bash
/ppt-export [--format=pdf|pptx|both] [--output=输出目录]
```

**参数**：

| 参数 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `--format` | ❌ | `both` | 导出格式：`pdf`、`pptx` 或 `both` |
| `--output` | ❌ | `./ppt-output/` | 导出文件存放目录 |

**前置条件**：需要先执行 `/ppt-generate` 或 `/ppt-quick` 生成 SVG 文件

**示例**：

```bash
# 导出为 PDF 和 PPTX（默认）
/ppt-export

# 仅导出 PDF
/ppt-export --format=pdf

# 导出到指定目录
/ppt-export --format=pptx --output=./final/

# 自然语言方式
导出为 PDF
把生成的 SVG 导出成 PPT
生成 PDF 和 PPTX 文件
```

**输出**：
- 文件命名：`slides-YYYY-MM-DD.pdf` / `slides-YYYY-MM-DD.pptx`
- 如果文件已存在，自动添加序号：`slides-YYYY-MM-DD-2.pdf`

**详细文档**：[commands/export.md](commands/export.md)

---

## 🎨 预设风格

| 风格 | 特点 | 适用场景 |
|------|------|---------|
| **极简主义** | 纯白背景，大量留白，克莱因蓝点缀 | 产品发布、设计分享、TED 演讲 |
| **商务咨询** | 深蓝稳重，McKinsey 风，橙色强调 | 方案汇报、咨询报告、投资路演 |
| **科技暗黑** | 深色背景，霓虹渐变，玻璃拟态 | 技术分享、产品演示、黑客松 |
| **瑞士平面** | 强烈对比，包豪斯风，信号红 | 创意提案、品牌展示、艺术展示 |
| **品牌蓝** | 蓝紫青配色，现代专业 | 企业培训、通用演示、正式场合 |

**👀 效果预览**：[查看 5 种风格对比](svg-comparison.html) - 在浏览器中打开可直观对比各风格在 13 页幻灯片上的实际效果

---

## 📁 项目结构

```
ppt-svg-generator/
├── SKILL.md              # Skill 配置文件
├── README.md             # 项目说明（本文件）
├── commands/             # 命令定义
│   ├── quick.md          # /ppt-quick 一键生成
│   ├── analyze.md        # /ppt-analyze 文稿分析
│   ├── design.md         # /ppt-design 风格设计
│   ├── generate.md       # /ppt-generate 批量生成
│   └── export.md         # /ppt-export 导出 PDF/PPTX
├── scripts/              # 导出脚本
│   ├── package.json      # npm 依赖声明
│   ├── export_pdf.js     # SVG 转 PDF（Playwright）
│   └── export_pptx.js    # SVG 转 PPTX（pptxgenjs）
├── specs/                # 规范文档
│   ├── svg-compatibility.md  # SVG→PPT 兼容性规范
│   ├── design-system.md      # 设计系统（字体、间距）
│   └── page-templates.md     # 页面模板（封面、观点等）
└── styles/               # 风格定义
    ├── 00-style-index.md     # 风格索引
    ├── 01-minimalism.md      # 极简主义
    ├── 02-consulting.md      # 商务咨询
    ├── 03-tech-dark.md       # 科技暗黑
    ├── 04-swiss-style.md     # 瑞士平面
    └── 05-brand-blue.md      # 品牌蓝
```

---

## 📂 会话文件

执行 `/ppt-quick` 或分步命令时会生成中间文件：

```
.ppt-session/              # 会话目录（临时）
├── structure.json         # 页面结构（/ppt-analyze 产出）
├── design.json            # 设计规范（/ppt-design 产出）
└── generation.log         # 生成日志（可选）

./ppt-output/              # 输出目录（默认）
├── slide-01-cover.svg
├── slide-02-intro.svg
├── ...
└── slide-XX-ending.svg
```

> 💡 `.ppt-session/` 是临时目录，确认 PPT 满意后可删除。

---

## 🔧 PPT 导入说明

1. **导入 SVG** - 将生成的 SVG 文件拖入 PowerPoint
2. **转换为形状** - 右键点击 → 选择「转换为形状」
3. **二次编辑** - 现在可以修改文字、颜色、位置等

> ⚠️ **注意**：阴影效果需要在 PPT 中手动添加（格式 → 形状效果 → 阴影）

---

## 📖 详细文档

| 文档 | 说明 |
|------|------|
| [一键生成命令](commands/quick.md) | `/ppt-quick` 完整工作流程 |
| [文稿分析命令](commands/analyze.md) | `/ppt-analyze` 详细说明 |
| [风格设计命令](commands/design.md) | `/ppt-design` 详细说明 |
| [批量生成命令](commands/generate.md) | `/ppt-generate` 详细说明 |
| [导出命令](commands/export.md) | `/ppt-export` PDF/PPTX 导出 |
| [SVG 兼容性规范](specs/svg-compatibility.md) | PPT 转换的 5 条核心规则 |
| [设计系统](specs/design-system.md) | 字体、间距、组件规范 |
| [页面模板](specs/page-templates.md) | 各类页面的布局定义 |
| [风格索引](styles/00-style-index.md) | 5 种预设风格详情 |

---

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。

---

## ⚠️ 注意事项

### Skill 安装路径

oh-my-opencode 从以下路径加载用户 Skills：

| 路径 | 作用域 |
|------|--------|
| `~/.config/opencode/skill/` | OpenCode 全局 |
| `.opencode/skill/` | 项目级 |
| `~/.claude/skills/` | Claude Code 兼容（用户级） |
| `.claude/skills/` | Claude Code 兼容（项目级） |

> ⚠️ 注意是 `skill`（单数），不是 `skills`（复数）！

### SKILL.md 的 `allowed-tools` 格式

`allowed-tools` 字段必须使用**单行字符串格式**（空格分隔），**不能使用 YAML 列表格式**：

```yaml
# ✅ 正确 - 单行字符串格式
allowed-tools: Read Write Glob Grep Bash WebSearch WebFetch

# ❌ 错误 - YAML 列表格式（会导致 Skill 无法加载）
allowed-tools:
  - Read
  - Write
  - Glob
```

**原因**：oh-my-opencode 的解析代码对 `allowed-tools` 调用 `.split()` 方法，期望输入是字符串。如果使用 YAML 列表格式，解析后会变成数组，调用 `.split()` 会导致错误，从而使整个 Skill 加载失败且无任何报错提示。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

如果这个项目对你有帮助，请给个 ⭐ Star 支持一下！
