# PPTX OOXML 编辑参考

> 本文档提供 PowerPoint OOXML 结构说明和直接编辑指南。
> 用于编辑现有演示文稿时的技术参考。

---

## PPTX 文件结构

PPTX 文件本质是一个 ZIP 压缩包，包含以下结构：

```
presentation.pptx (ZIP)
├── [Content_Types].xml      # 内容类型声明
├── _rels/
│   └── .rels               # 根关系文件
├── docProps/
│   ├── app.xml             # 应用属性
│   ├── core.xml            # 核心属性（标题、作者、日期）
│   └── thumbnail.jpeg      # 缩略图
└── ppt/
    ├── presentation.xml    # 演示文稿主文件
    ├── presProps.xml       # 演示属性
    ├── tableStyles.xml     # 表格样式
    ├── viewProps.xml       # 视图属性
    ├── _rels/
    │   └── presentation.xml.rels  # 演示文稿关系
    ├── slides/
    │   ├── slide1.xml      # 幻灯片内容
    │   ├── slide2.xml
    │   └── _rels/
    │       ├── slide1.xml.rels
    │       └── slide2.xml.rels
    ├── slideLayouts/       # 幻灯片布局
    │   ├── slideLayout1.xml
    │   └── _rels/
    ├── slideMasters/       # 幻灯片母版
    │   ├── slideMaster1.xml
    │   └── _rels/
    ├── theme/              # 主题
    │   └── theme1.xml
    └── media/              # 媒体文件
        ├── image1.png
        └── image2.jpg
```

---

## 核心 XML 文件

### presentation.xml

演示文稿主文件，定义幻灯片列表和全局设置。

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <!-- 幻灯片尺寸 -->
  <p:sldSz cx="9144000" cy="6858000"/>  <!-- EMU 单位 -->

  <!-- 幻灯片列表 -->
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
    <p:sldId id="257" r:id="rId3"/>
    <p:sldId id="258" r:id="rId4"/>
  </p:sldIdLst>

  <!-- 母版列表 -->
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
</p:presentation>
```

**关键元素：**
- `p:sldSz`: 幻灯片尺寸（EMU 单位，1英寸 = 914400 EMU）
- `p:sldIdLst`: 幻灯片 ID 列表，决定幻灯片顺序
- `p:sldId`: 单个幻灯片引用，`id` 是唯一标识，`r:id` 是关系引用

### slide*.xml

单个幻灯片内容文件。

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <!-- 形状树根节点 -->
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>

      <!-- 标题形状 -->
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="zh-CN"/>
              <a:t>幻灯片标题</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>

      <!-- 内容形状 -->
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="zh-CN"/>
              <a:t>正文内容</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>
```

**关键元素：**
- `p:spTree`: 形状树，包含所有可视元素
- `p:sp`: 形状（Shape），可以是文本框、图形等
- `p:ph`: 占位符类型（title, body, dt, ftr, sldNum 等）
- `a:t`: 文本内容

---

## 命名空间

| 前缀 | URI | 说明 |
|------|-----|------|
| p | http://schemas.openxmlformats.org/presentationml/2006/main | PresentationML |
| a | http://schemas.openxmlformats.org/drawingml/2006/main | DrawingML |
| r | http://schemas.openxmlformats.org/officeDocument/2006/relationships | 关系 |
| mc | http://schemas.openxmlformats.org/markup-compatibility/2006 | 兼容性 |

---

## 常见编辑操作

### 1. 修改文本内容

定位 `<a:t>` 元素并修改其文本内容。

```python
from scripts.presentation import Presentation

# ═══════════════════════════════════════════════════════════════
# 修改幻灯片文本
# ═══════════════════════════════════════════════════════════════
pres = Presentation('unpacked')

# 获取幻灯片编辑器
slide = pres['ppt/slides/slide1.xml']

# 定位文本节点
node = slide.get_node(tag='a:t', contains='原文本')

# 替换文本
slide.replace_text(node, '新文本')

# 保存
pres.save()
```

### 2. 修改文本样式

文本样式在 `<a:rPr>` 元素中定义。

```xml
<a:r>
  <a:rPr lang="zh-CN" sz="2400" b="1" i="0">
    <a:solidFill>
      <a:srgbClr val="0066CC"/>
    </a:solidFill>
    <a:latin typeface="微软雅黑"/>
    <a:ea typeface="微软雅黑"/>
  </a:rPr>
  <a:t>样式化文本</a:t>
</a:r>
```

**属性说明：**
- `sz`: 字号（百分之一磅，2400 = 24pt）
- `b`: 粗体（1=是，0=否）
- `i`: 斜体
- `u`: 下划线
- `a:solidFill`: 文字颜色

### 3. 添加新幻灯片

添加幻灯片需要：
1. 创建新的 slide*.xml 文件
2. 创建对应的 .rels 文件
3. 更新 presentation.xml 中的 sldIdLst
4. 更新 [Content_Types].xml
5. 更新 presentation.xml.rels

```python
pres = Presentation('unpacked')

# 添加新幻灯片（自动处理所有关系）
pres.add_slide(
    title='新幻灯片标题',
    content='幻灯片内容',
    layout='content'  # title, content, blank, etc.
)

pres.save()
```

### 4. 删除幻灯片

```python
pres = Presentation('unpacked')

# 删除指定幻灯片
pres.remove_slide(slide_number=3)

pres.save()
```

### 5. 调整幻灯片顺序

修改 presentation.xml 中 `<p:sldIdLst>` 的顺序。

```python
pres = Presentation('unpacked')

# 移动幻灯片
pres.move_slide(from_index=3, to_index=1)

pres.save()
```

---

## 关系文件 (.rels)

### presentation.xml.rels

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>
```

### slide*.xml.rels

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>
```

---

## [Content_Types].xml

声明包中所有文件的内容类型。

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>

  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>
```

---

## 占位符类型

| 类型 | 说明 | 常见位置 |
|------|------|----------|
| title | 标题 | 所有布局 |
| ctrTitle | 居中标题 | 标题幻灯片 |
| subTitle | 副标题 | 标题幻灯片 |
| body | 正文 | 内容布局 |
| dt | 日期 | 页脚区域 |
| ftr | 页脚 | 页脚区域 |
| sldNum | 页码 | 页脚区域 |
| chart | 图表 | 图表布局 |
| tbl | 表格 | 表格布局 |
| pic | 图片 | 图片布局 |

---

## 单位换算

OOXML 使用 EMU (English Metric Units) 作为基本单位。

| 单位 | EMU 值 |
|------|--------|
| 1 英寸 | 914400 |
| 1 厘米 | 360000 |
| 1 点 (pt) | 12700 |
| 1 像素 (96dpi) | 9525 |

**常用尺寸：**
- 16:9 幻灯片: 9144000 x 5143500 EMU (10" x 5.625")
- 4:3 幻灯片: 9144000 x 6858000 EMU (10" x 7.5")

---

## 工具命令

### 解包

```bash
python ooxml/scripts/unpack.py presentation.pptx unpacked/
```

### 打包

```bash
python ooxml/scripts/pack.py unpacked/ output.pptx
```

### 验证

```bash
python ooxml/scripts/validate.py output.pptx
```

### 搜索文本

```bash
# 在所有幻灯片中搜索
grep -rn "搜索文本" unpacked/ppt/slides/

# 查看幻灯片结构
cat unpacked/ppt/slides/slide1.xml | xmllint --format -
```

---

## 常见问题

### 1. 文本被分割成多个 run

PowerPoint 可能将一段文本分割成多个 `<a:r>` 元素。

```xml
<!-- 可能的实际结构 -->
<a:p>
  <a:r><a:t>Hello </a:t></a:r>
  <a:r><a:t>World</a:t></a:r>
</a:p>
```

**解决方案：** 使用 `contains` 参数搜索部分文本，或合并相邻的 run。

### 2. 关系 ID 冲突

添加新元素时，确保 rId 唯一。

```python
# 获取下一个可用的 rId
next_rid = pres.get_next_rid('ppt/_rels/presentation.xml.rels')
```

### 3. 幻灯片 ID 冲突

presentation.xml 中的 sldId 必须唯一。

```python
# 获取下一个可用的幻灯片 ID
next_slide_id = pres.get_next_slide_id()
```

### 4. 内容类型未声明

添加新文件类型时，必须在 [Content_Types].xml 中声明。

```python
pres.add_content_type('/ppt/slides/slide3.xml',
    'application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
```

---

## 参考资源

- [ECMA-376 标准](https://www.ecma-international.org/publications-and-standards/standards/ecma-376/)
- [Open XML SDK 文档](https://docs.microsoft.com/en-us/office/open-xml/open-xml-sdk)
- [PresentationML 参考](https://docs.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation)
