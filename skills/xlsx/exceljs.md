# ExcelJS API 参考

> ExcelJS 是一个功能强大的 JavaScript 库，用于读写 Excel 文件。本文档提供常用 API 的快速参考。

---

## 安装

```bash
npm install exceljs
```

---

## 基础用法

### 创建工作簿

```javascript
import ExcelJS from 'exceljs'

const workbook = new ExcelJS.Workbook()

// ═══════════════════════════════════════════════════════════════════════════════
//  设置工作簿属性
// ═══════════════════════════════════════════════════════════════════════════════
workbook.creator = '作者名'
workbook.lastModifiedBy = '修改者'
workbook.created = new Date()
workbook.modified = new Date()
```

### 读取工作簿

```javascript
// 从文件读取
await workbook.xlsx.readFile('input.xlsx')

// 从 Buffer 读取
await workbook.xlsx.load(buffer)

// 从流读取
await workbook.xlsx.read(stream)
```

### 保存工作簿

```javascript
// 保存到文件
await workbook.xlsx.writeFile('output.xlsx')

// 保存到 Buffer
const buffer = await workbook.xlsx.writeBuffer()

// 保存到流
await workbook.xlsx.write(stream)
```

---

## 工作表操作

### 添加工作表

```javascript
const sheet = workbook.addWorksheet('Sheet1')

// 带选项
const sheet = workbook.addWorksheet('Sheet1', {
  properties: { tabColor: { argb: 'FF00FF00' } },
  pageSetup: { paperSize: 9, orientation: 'landscape' },
  views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
})
```

### 获取工作表

```javascript
// 按名称
const sheet = workbook.getWorksheet('Sheet1')

// 按索引（1-based）
const sheet = workbook.getWorksheet(1)

// 遍历所有工作表
workbook.eachSheet((worksheet, sheetId) => {
  console.log(worksheet.name)
})
```

### 删除工作表

```javascript
workbook.removeWorksheet(sheetId)
```

---

## 列��作

### 定义列

```javascript
sheet.columns = [
  { header: '序号', key: 'id', width: 10 },
  { header: '名称', key: 'name', width: 20 },
  { header: '数量', key: 'qty', width: 12 },
  { header: '单价', key: 'price', width: 12, style: { numFmt: '¥#,##0.00' } },
  { header: '金额', key: 'amount', width: 15 },
]
```

### 获取/设置列

```javascript
// 获取列
const col = sheet.getColumn('A')
const col = sheet.getColumn(1)

// 设置列宽
col.width = 20

// 设置列样式
col.style = { font: { bold: true } }

// 隐藏列
col.hidden = true
```

---

## 行操作

### 添加行

```javascript
// 添加单行
sheet.addRow({ id: 1, name: '产品A', qty: 100, price: 25.5 })

// 添加多行
sheet.addRows([
  { id: 1, name: '产品A', qty: 100, price: 25.5 },
  { id: 2, name: '产品B', qty: 200, price: 18.0 },
])

// 插入行
sheet.insertRow(2, { id: 1, name: '插入的行' })
```

### 获取行

```javascript
const row = sheet.getRow(1)

// 遍历行
sheet.eachRow((row, rowNumber) => {
  console.log(`Row ${rowNumber}:`, row.values)
})

// 遍历（包括空行）
sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
  // ...
})
```

### 行属性

```javascript
row.height = 20
row.hidden = false
row.outlineLevel = 1

// 提交行（优化内存）
row.commit()
```

---

## 单元格操作

### 访问单元格

```javascript
// 按引用
const cell = sheet.getCell('A1')
const cell = sheet.getCell('A1:B2')  // 合并区域

// 按行列
const cell = sheet.getCell(1, 1)

// 通过行
const cell = row.getCell(1)
const cell = row.getCell('A')
```

### 设置值

```javascript
// 直接赋值
cell.value = 'Hello'
cell.value = 123
cell.value = new Date()
cell.value = true

// 公式
cell.value = { formula: 'SUM(A1:A10)' }
cell.value = { formula: 'SUM(A1:A10)', result: 100 }

// 富文本
cell.value = {
  richText: [
    { text: '普通文本' },
    { font: { bold: true }, text: '加粗文本' },
  ]
}

// 超链接
cell.value = {
  text: '点击访问',
  hyperlink: 'https://example.com'
}
```

### 获取值

```javascript
const value = cell.value
const text = cell.text        // 格式化后的文本
const formula = cell.formula  // 公式（如有）
const result = cell.result    // 公式结果
```

---

## 样式

### 字体

```javascript
cell.font = {
  name: '微软雅黑',
  size: 11,
  bold: true,
  italic: false,
  underline: true,  // true, false, 'single', 'double'
  strike: false,
  color: { argb: 'FF000000' }
}
```

### 对齐

```javascript
cell.alignment = {
  horizontal: 'center',  // left, center, right, fill, justify
  vertical: 'middle',    // top, middle, bottom
  wrapText: true,
  textRotation: 45,      // 0-90 或 255（垂直）
  indent: 1
}
```

### 边框

```javascript
cell.border = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
}

// 边框样式: thin, medium, thick, dotted, dashed, double
```

### 填充

```javascript
// 纯色填充
cell.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4472C4' }
}

// 渐变填充
cell.fill = {
  type: 'gradient',
  gradient: 'angle',
  degree: 90,
  stops: [
    { position: 0, color: { argb: 'FFFFFFFF' } },
    { position: 1, color: { argb: 'FF4472C4' } }
  ]
}
```

### 数字格式

```javascript
cell.numFmt = '#,##0.00'
cell.numFmt = '¥#,##0.00'
cell.numFmt = '0.00%'
cell.numFmt = 'yyyy-mm-dd'
```

---

## 合并单元格

```javascript
// 合并
sheet.mergeCells('A1:B2')
sheet.mergeCells(1, 1, 2, 2)  // top, left, bottom, right

// 取消合并
sheet.unMergeCells('A1:B2')
```

---

## 条件格式

```javascript
sheet.addConditionalFormatting({
  ref: 'A1:A10',
  rules: [
    {
      type: 'cellIs',
      operator: 'greaterThan',
      formulae: [100],
      style: {
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF00FF00' } }
      }
    }
  ]
})
```

---

## 数据验证

```javascript
cell.dataValidation = {
  type: 'list',
  allowBlank: true,
  formulae: ['"选项1,选项2,选项3"']
}

cell.dataValidation = {
  type: 'whole',
  operator: 'between',
  formulae: [1, 100],
  showErrorMessage: true,
  errorTitle: '错误',
  error: '请输入 1-100 之间的整数'
}
```

---

## 图片

```javascript
// 添加图片
const imageId = workbook.addImage({
  filename: 'image.png',
  extension: 'png'
})

// 或从 Buffer
const imageId = workbook.addImage({
  buffer: imageBuffer,
  extension: 'png'
})

// 放置图片
sheet.addImage(imageId, {
  tl: { col: 0, row: 0 },
  br: { col: 2, row: 2 }
})

// 或指定位置和大小
sheet.addImage(imageId, {
  tl: { col: 0.5, row: 0.5 },
  ext: { width: 200, height: 100 }
})
```

---

## 打印设置

```javascript
sheet.pageSetup = {
  paperSize: 9,              // A4
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  printArea: 'A1:E20',
  margins: {
    left: 0.7, right: 0.7,
    top: 0.75, bottom: 0.75,
    header: 0.3, footer: 0.3
  }
}

// 页眉页脚
sheet.headerFooter = {
  oddHeader: '&C&B标题',
  oddFooter: '&C第 &P 页，共 &N 页'
}
```

---

## 流式写入（大文件）

```javascript
const options = {
  filename: 'large.xlsx',
  useStyles: true,
  useSharedStrings: true
}

const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(options)
const sheet = workbook.addWorksheet('Sheet1')

// 添加行并立即提交
for (let i = 0; i < 1000000; i++) {
  sheet.addRow({ id: i, name: `Row ${i}` }).commit()
}

await workbook.commit()
```

---

## 常用代码片段

### 创建带样式的表格

```javascript
const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('数据')

// ═══════════════════════════════════════════════════════════════════════════════
//  定义列
// ═══════════════════════════════════════════════════════════════════════════════
sheet.columns = [
  { header: '序号', key: 'id', width: 10 },
  { header: '名称', key: 'name', width: 20 },
  { header: '金额', key: 'amount', width: 15 },
]

// ═══════════════════════════════════════════════════════════════════════════════
//  添加数据
// ═══════════════════════════════════════════════════════════════════════════════
sheet.addRows([
  { id: 1, name: '产品A', amount: 1000 },
  { id: 2, name: '产品B', amount: 2000 },
])

// ═══════════════════════════════════════════════════════════════════════════════
//  设置表头样式
// ═══════════════════════════════════════════════════════════════════════════════
const headerRow = sheet.getRow(1)
headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
headerRow.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4472C4' }
}
headerRow.alignment = { horizontal: 'center' }

// ═══════════════════════════════════════════════════════════════════════════════
//  设置金额列格式
// ═══════════════════════════════════════════════════════════════════════════════
sheet.getColumn('amount').numFmt = '¥#,##0.00'

await workbook.xlsx.writeFile('output.xlsx')
```

### 读取并修改

```javascript
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile('input.xlsx')

const sheet = workbook.getWorksheet('Sheet1')

// 修改单元格
sheet.getCell('A1').value = '新值'

// 添加公式
sheet.getCell('D10').value = { formula: 'SUM(D2:D9)' }

await workbook.xlsx.writeFile('output.xlsx')
```

---

## 参考资源

- [ExcelJS GitHub](https://github.com/exceljs/exceljs)
- [ExcelJS 文档](https://github.com/exceljs/exceljs#readme)
