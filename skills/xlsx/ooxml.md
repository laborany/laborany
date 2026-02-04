# SpreadsheetML (XLSX) OOXML 技术参考

> 本文档提供 Office Open XML SpreadsheetML 格式的技术参考，用于直接操作 xlsx 文件的 XML 结构。

---

## 文件结构

### xlsx 包结构

```
xlsx_file.xlsx (ZIP 压缩包)
├── [Content_Types].xml          # 内容类型定义
├── _rels/
│   └── .rels                    # 包级关系
├── docProps/
│   ├── app.xml                  # 应用属性
│   └── core.xml                 # 核心属性（作者、标题等）
└── xl/
    ├── workbook.xml             # 工作簿定义
    ├── styles.xml               # 样式定义
    ├── sharedStrings.xml        # 共享字符串表
    ├── theme/
    │   └── theme1.xml           # 主题定义
    ├── worksheets/
    │   ├── sheet1.xml           # 工作表1
    │   ├── sheet2.xml           # 工作表2
    │   └── ...
    ├── charts/                  # 图表（如有）
    ├── drawings/                # 绘图（如有）
    └── _rels/
        └── workbook.xml.rels    # 工作簿关系
```

---

## 核心命名空间

```xml
xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"
```

---

## 工作表结构 (sheet.xml)

### 基本结构

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <selection activeCell="A1" sqref="A1"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="10" customWidth="1"/>
  </cols>
  <sheetData>
    <!-- 数据行 -->
  </sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75"/>
</worksheet>
```

### 行元素 (row)

```xml
<row r="1" spans="1:5" ht="15" customHeight="1">
  <!-- 单元格 -->
</row>
```

| 属性 | 说明 |
|------|------|
| `r` | 行号（1-indexed） |
| `spans` | 列范围 |
| `ht` | 行高 |
| `customHeight` | 是否自定义高度 |
| `hidden` | 是否隐藏 |

### 单元格元素 (c)

```xml
<c r="A1" t="s" s="1">
  <v>0</v>
</c>
```

| 属性 | 说明 |
|------|------|
| `r` | 单元格引用（如 A1） |
| `t` | 类型：s=共享字符串, n=数值, b=布尔, e=错误, str=公式字符串, inlineStr=内联字符串 |
| `s` | 样式索引（styles.xml 中的 cellXfs 索引） |

### 单元格值类型

**数值 (默认)**
```xml
<c r="A1"><v>123.45</v></c>
```

**共享字符串**
```xml
<c r="A1" t="s"><v>0</v></c>  <!-- 0 是 sharedStrings.xml 中的索引 -->
```

**内联字符串**
```xml
<c r="A1" t="inlineStr">
  <is><t>文本内容</t></is>
</c>
```

**公式**
```xml
<c r="A1">
  <f>SUM(B1:B10)</f>
  <v>100</v>  <!-- 缓存的计算结果 -->
</c>
```

**布尔值**
```xml
<c r="A1" t="b"><v>1</v></c>  <!-- 1=TRUE, 0=FALSE -->
```

---

## 样式结构 (styles.xml)

### 基本结构

```xml
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts>...</numFmts>      <!-- 数字格式 -->
  <fonts>...</fonts>          <!-- 字体 -->
  <fills>...</fills>          <!-- 填充 -->
  <borders>...</borders>      <!-- 边框 -->
  <cellStyleXfs>...</cellStyleXfs>  <!-- 单元格样式格式 -->
  <cellXfs>...</cellXfs>      <!-- 单元格格式（被 c/@s 引用） -->
  <cellStyles>...</cellStyles>
</styleSheet>
```

### 数字格式 (numFmt)

```xml
<numFmts count="2">
  <numFmt numFmtId="164" formatCode="¥#,##0.00"/>
  <numFmt numFmtId="165" formatCode="0.00%"/>
</numFmts>
```

**内置格式 ID**

| ID | 格式 |
|----|------|
| 0 | 常规 |
| 1 | 0 |
| 2 | 0.00 |
| 3 | #,##0 |
| 4 | #,##0.00 |
| 9 | 0% |
| 10 | 0.00% |
| 14 | m/d/yyyy |
| 164+ | 自定义格式 |

### 字体 (font)

```xml
<font>
  <b/>                        <!-- 加粗 -->
  <i/>                        <!-- 斜体 -->
  <u/>                        <!-- 下划线 -->
  <sz val="11"/>              <!-- 字号 -->
  <color rgb="FF000000"/>     <!-- 颜色 -->
  <name val="等线"/>          <!-- 字体名 -->
  <family val="2"/>           <!-- 字体族 -->
  <charset val="134"/>        <!-- 字符集 -->
</font>
```

### 填充 (fill)

```xml
<fill>
  <patternFill patternType="solid">
    <fgColor rgb="FF4472C4"/>
    <bgColor indexed="64"/>
  </patternFill>
</fill>
```

**patternType 值**: none, solid, gray125, gray0625, ...

### 边框 (border)

```xml
<border>
  <left style="thin"><color indexed="64"/></left>
  <right style="thin"><color indexed="64"/></right>
  <top style="thin"><color indexed="64"/></top>
  <bottom style="thin"><color indexed="64"/></bottom>
  <diagonal/>
</border>
```

**style 值**: thin, medium, thick, double, dotted, dashed, ...

### 单元格格式 (xf)

```xml
<cellXfs count="2">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0"
      applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"
      applyAlignment="1">
    <alignment horizontal="center" vertical="center"/>
  </xf>
</cellXfs>
```

---

## 共享字符串 (sharedStrings.xml)

### 结构

```xml
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
     count="10" uniqueCount="5">
  <si><t>字符串1</t></si>
  <si><t>字符串2</t></si>
  <si>
    <r>
      <rPr><b/><sz val="11"/></rPr>
      <t>富文本</t>
    </r>
  </si>
</sst>
```

- `count`: 总引用次数
- `uniqueCount`: 唯一字符串数量
- 单元格通过索引引用：`<c t="s"><v>0</v></c>` 引用第一个字符串

---

## 工作簿 (workbook.xml)

### 结构

```xml
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
    <sheet name="Sheet2" sheetId="2" r:id="rId2"/>
  </sheets>
  <definedNames>
    <definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!$A$1:$E$10</definedName>
  </definedNames>
</workbook>
```

---

## 关系文件 (.rels)

### workbook.xml.rels

```xml
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>
```

---

## 常用操作示例

### 添加新行

```xml
<!-- 在 sheetData 中添加 -->
<row r="5" spans="1:5">
  <c r="A5"><v>1</v></c>
  <c r="B5" t="inlineStr"><is><t>新数据</t></is></c>
  <c r="C5"><v>100</v></c>
  <c r="D5"><v>25.5</v></c>
  <c r="E5"><f>C5*D5</f></c>
</row>
```

### 添加公式

```xml
<c r="E10">
  <f>SUM(E2:E9)</f>
</c>
```

### 应用样式

```xml
<!-- 引用 styles.xml 中 cellXfs 的索引 -->
<c r="A1" s="1"><v>标题</v></c>
```

### 合并单元格

```xml
<mergeCells count="1">
  <mergeCell ref="A1:E1"/>
</mergeCells>
```

---

## 验证清单

修改 XML 后检查：

1. **XML 语法正确**
   - 标签闭合
   - 属性引号
   - 特殊字符转义

2. **引用一致性**
   - 单元格引用格式正确
   - 样式索引在范围内
   - 共享字符串索引有效

3. **关系完整**
   - 所有引用的文件存在
   - rId 对应正确

4. **结构完整**
   - 必需元素存在
   - 元素顺序正确

---

## 参考资源

- [ECMA-376 标准](https://www.ecma-international.org/publications-and-standards/standards/ecma-376/)
- [Office Open XML 规范](https://docs.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/)
