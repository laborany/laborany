---
name: PPT演示助手
description: |
  创建、编辑和分析演示文稿（.pptx），支持幻灯片设计、动画效果和演讲者备注。
  触发场景:
  (1) 用户需要创建新的 PPT 演示文稿
  (2) 用户需要编辑或修改现有 .pptx 文件
  (3) 用户需要提取 PPT 中的内容或图片
  (4) 用户询问"帮我做个PPT"、"制作演示文稿"
  支持: 商务演示、学术报告、产品介绍、培训材料等场景
icon: 📊
category: 办公
---

# PPTX 演示文稿处理

## 概述

处理 PowerPoint 演示文稿（.pptx）的创建、编辑和分析。.pptx 文件本质是包含 XML 和资源的 ZIP 压缩包。

## 工作流决策树

### 创建新演示文稿
使用 **pptxgenjs** (JavaScript) 或 **python-pptx** (Python)

### 编辑现有演示文稿
使用 **OOXML 直接编辑** 或 **python-pptx**

### 提取内容
使用解包工具提取 XML 和媒体文件

## 创建新演示文稿

### 方案一：pptxgenjs (推荐)

```javascript
import pptxgen from 'pptxgenjs'

const pres = new pptxgen()

// ═══════════════════════════════════════════════════════════════
// 设置演示文稿属性
// ═══════════════════════════════════════════════════════════════
pres.author = '作者名'
pres.title = '演示文稿标题'
pres.subject = '主题'

// ═══════════════════════════════════════════════════════════════
// 添加幻灯片
// ═══════════════════════════════════════════════════════════════
const slide = pres.addSlide()

// 添加标题
slide.addText('幻灯片标题', {
  x: 0.5, y: 0.5, w: '90%',
  fontSize: 36, bold: true, color: '363636'
})

// 添加正文
slide.addText('正文内容', {
  x: 0.5, y: 1.5, w: '90%', h: 4,
  fontSize: 18, color: '666666', valign: 'top'
})

// 添加图片
slide.addImage({ path: 'image.png', x: 1, y: 2, w: 4, h: 3 })

// 添加形状
slide.addShape(pres.ShapeType.rect, {
  x: 0.5, y: 5, w: 2, h: 0.5,
  fill: { color: '0066CC' }
})

// ═══════════════════════════════════════════════════════════════
// 保存文件
// ═══════════════════════════════════════════════════════════════
await pres.writeFile({ fileName: 'presentation.pptx' })
```

### 方案二：python-pptx

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

prs = Presentation()

# ═══════════════════════════════════════════════════════════════
# 添加标题幻灯片
# ═══════════════════════════════════════════════════════════════
title_slide_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(title_slide_layout)
title = slide.shapes.title
subtitle = slide.placeholders[1]

title.text = "演示文稿标题"
subtitle.text = "副标题内容"

# ═══════════════════════════════════════════════════════════════
# 添加内容幻灯片
# ═══════════════════════════════════════════════════════════════
content_layout = prs.slide_layouts[1]
slide = prs.slides.add_slide(content_layout)
title = slide.shapes.title
body = slide.placeholders[1]

title.text = "章节标题"
tf = body.text_frame
tf.text = "第一个要点"
p = tf.add_paragraph()
p.text = "第二个要点"
p.level = 1

# ═══════════════════════════════════════════════════════════════
# 添加图片
# ═══════════════════════════════════════════════════════════════
blank_layout = prs.slide_layouts[6]
slide = prs.slides.add_slide(blank_layout)
slide.shapes.add_picture('image.png', Inches(1), Inches(1), width=Inches(5))

prs.save('presentation.pptx')
```

## 编辑现有演示文稿

### OOXML 直接编辑

#### 解包文件

```bash
python ooxml/scripts/unpack.py presentation.pptx unpacked/
```

#### 关键文件结构

```
unpacked/
├── [Content_Types].xml      # 内容类型定义
├── _rels/
│   └── .rels               # 关系文件
├── docProps/
│   ├── app.xml             # 应用属性
│   └── core.xml            # 核心属性（标题、作者等）
└── ppt/
    ├── presentation.xml    # 演示文稿主文件
    ├── slides/
    │   ├── slide1.xml      # 幻灯片内容
    │   └── slide2.xml
    ├── slideLayouts/       # 幻灯片布局
    ├── slideMasters/       # 幻灯片母版
    ├── theme/              # 主题定义
    └── media/              # 图片和媒体文件
```

#### 修改幻灯片内容

幻灯片 XML 结构示例：

```xml
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r>
              <a:t>文本内容</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>
```

#### 重新打包

```bash
python ooxml/scripts/pack.py unpacked/ modified.pptx
```

## 提取内容

### 提取文本

```python
from pptx import Presentation

prs = Presentation('presentation.pptx')
for slide in prs.slides:
    for shape in slide.shapes:
        if hasattr(shape, 'text'):
            print(shape.text)
```

### 提取图片

```bash
# 解包后直接访问 ppt/media/ 目录
python ooxml/scripts/unpack.py presentation.pptx unpacked/
ls unpacked/ppt/media/
```

## 转换为图片

```bash
# 转换为 PDF
soffice --headless --convert-to pdf presentation.pptx

# PDF 转图片
pdftoppm -jpeg -r 150 presentation.pdf slide
```

## 常用布局索引

| 索引 | 布局类型 |
|-----|---------|
| 0 | 标题幻灯片 |
| 1 | 标题和内容 |
| 2 | 节标题 |
| 3 | 两栏内容 |
| 4 | 比较 |
| 5 | 仅标题 |
| 6 | 空白 |

## 依赖

```bash
# JavaScript
npm install pptxgenjs

# Python
pip install python-pptx
```
