# /ppt-export 命令 - 导出为 PDF/PPTX

## 命令说明

将生成的 SVG 页面批量导出为可直接演示的 PDF 文档或可编辑的 PPTX 幻灯片文件。

## 触发方式

```bash
/ppt-export [--format=pdf|pptx|both] [--output=目录]
```

或者使用自然语言：
- "导出为 PDF"
- "导出为 PPTX"
- "生成 PDF 和 PPTX"
- "把 SVG 导出成 PPT"

## 参数说明

| 参数 | 可选值 | 默认值 | 说明 |
|------|--------|--------|------|
| `--format` | `pdf`, `pptx`, `both` | `both` | 指定导出的文件格式 |
| `--output` | 目录路径 | `./ppt-output/` | 导出文件的存放目录 |

## 前置条件

在执行导出前，必须确保：
1. 已执行 `/ppt-generate` 或 `/ppt-quick`。
2. `./ppt-output/` 目录下已存在生成的 SVG 文件（文件名符合 `slide-XX-xxx.svg` 规范）。

## 依赖安装

导出功能需要 Node.js 环境和相关依赖包。**首次使用前**，请在 `scripts/` 目录下执行：

```bash
cd scripts/
npm install
```

这将自动安装：
- `playwright` - 跨平台浏览器自动化（用于 PDF 导出）
- `pdf-lib` - PDF 文件合并
- `pptxgenjs` - PPTX 生成

> 💡 安装过程会自动下载 Chromium 浏览器（约 150MB），用于 SVG 渲染。

### 跨平台支持

| 平台 | 状态 | 说明 |
|------|------|------|
| macOS | ✅ 支持 | Intel 和 Apple Silicon 均可 |
| Windows | ✅ 支持 | Windows 10/11 |
| Linux | ✅ 支持 | Ubuntu, Debian, CentOS 等 |

## 执行流程

### Step 1: 扫描 SVG 文件

系统将扫描输出目录中的所有 SVG 文件，并按自然数顺序进行排序。

```
🔍 正在扫描 SVG 文件...
📄 发现 12 个页面 (slide-01-cover.svg ... slide-12-ending.svg)
```

### Step 2: 确认导出配置

```
🚀 准备导出文件

📋 导出配置：
- 源目录: ./ppt-output/
- 目标格式: [pdf | pptx | both]
- 输出路径: ./ppt-output/slides-2024-05-20.pdf
```

### Step 3: 执行转换脚本

系统将根据选定的格式运行对应的导出脚本：

#### 3.1 导出为 PDF
使用 Playwright 渲染 SVG 并生成高质量 PDF。
```bash
node scripts/export_pdf.js ./ppt-output/ [--output=路径]
```

#### 3.2 导出为 PPTX
使用 pptxgenjs 生成包含矢量图形的幻灯片。
```bash
node scripts/export_pptx.js ./ppt-output/ [路径]
```

### Step 4: 命名与冲突处理
- **自动命名**: 默认使用 `slides-YYYY-MM-DD.pdf/pptx`。
- **冲突处理**: 如果文件名已存在，将自动递增编号，如 `slides-YYYY-MM-DD-2.pdf`。

### Step 5: 完成反馈

```
✅ 导出完成！

📄 生成文件：
- 📂 ./ppt-output/slides-2024-05-20.pdf
- 📂 ./ppt-output/slides-2024-05-20.pptx

🎉 您现在可以打开文件进行演示或进一步编辑了。
```

## 错误处理

| 现象 | 可能原因 | 解决方案 |
|------|----------|---------|
| ❌ 未发现 SVG 文件 | 尚未执行生成命令 | 请先执行 `/ppt-generate` |
| ❌ 缺少依赖 | 未安装 npm 包 | 运行 `cd scripts && npm install` |
| ❌ Chromium 未安装 | Playwright 浏览器缺失 | 运行 `npx playwright install chromium` |
| ❌ 权限不足 | 目标目录不可写 | 请检查目录权限或使用 `--output` 指定其他位置 |

## 示例

```bash
# 默认导出两种格式
/ppt-export

# 仅导出 PDF
/ppt-export --format=pdf

# 导出为 PPTX 到指定目录
/ppt-export --format=pptx --output=./final-delivery/

# 自然语言
帮我把生成的图导出成 PDF
```

## 注意事项

1. **版本说明**: v1 版本将导出 `ppt-output/` 目录下的所有页面，暂不支持筛选特定页面。
2. **PDF 质量**: 使用 Playwright 渲染确保字体和样式完美呈现，支持所有系统字体。
3. **PPTX 编辑性**: 导出的 PPTX 将 SVG 作为矢量对象嵌入，支持在 PowerPoint 中进行基本的缩放和位置调整。
