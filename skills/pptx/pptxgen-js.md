# pptxgenjs 使用参考

> pptxgenjs 是一个功能强大的 JavaScript 库，用于创建 PowerPoint 演示文稿。
> 本文档提供 API 参考和最佳实践。

---

## 快速开始

### 安装

```bash
npm install pptxgenjs
```

### 基本用法

```javascript
import pptxgen from 'pptxgenjs'

// ═══════════════════════════════════════════════════════════════
// 创建演示文稿实例
// ═══════════════════════════════════════════════════════════════
const pres = new pptxgen()

// 设置演示文稿属性
pres.author = '作者名'
pres.title = '演示文稿标题'
pres.subject = '主题'
pres.company = '公司名'

// ═══════════════════════════════════════════════════════════════
// 添加幻灯片
// ═══════════════════════════════════════════════════════════════
const slide = pres.addSlide()

// 添加文本
slide.addText('Hello World', { x: 1, y: 1, fontSize: 24 })

// ═══════════════════════════════════════════════════════════════
// 保存文件
// ═══════════════════════════════════════════════════════════════
await pres.writeFile({ fileName: 'presentation.pptx' })
```

---

## 演示文稿设置

### 属性设置

```javascript
const pres = new pptxgen()

// 元数据
pres.author = '张三'
pres.title = '年度报告'
pres.subject = '2025年业务总结'
pres.company = 'ABC公司'
pres.revision = '1'

// 布局设置（默认 16:9）
pres.layout = 'LAYOUT_16x9'  // 或 'LAYOUT_4x3', 'LAYOUT_WIDE'

// 自定义尺寸（英寸）
pres.defineLayout({ name: 'CUSTOM', width: 10, height: 7.5 })
pres.layout = 'CUSTOM'

// RTL 支持（从右到左语言）
pres.rtlMode = false
```

### 预设布局

| 布局名称 | 尺寸 | 说明 |
|---------|------|------|
| LAYOUT_16x9 | 10" x 5.625" | 宽屏（默认） |
| LAYOUT_16x10 | 10" x 6.25" | 宽屏变体 |
| LAYOUT_4x3 | 10" x 7.5" | 标准 |
| LAYOUT_WIDE | 13.33" x 7.5" | 超宽 |

---

## 幻灯片操作

### 添加幻灯片

```javascript
// 添加空白幻灯片
const slide = pres.addSlide()

// 添加带背景色的幻灯片
const slide2 = pres.addSlide({ background: { color: '1a1a2e' } })

// 添加带背景图的幻灯片
const slide3 = pres.addSlide({
  background: { path: 'images/bg.jpg' }
})
```

### 幻灯片背景

```javascript
// 纯色背景
slide.background = { color: '1a1a2e' }

// 渐变背景
slide.background = {
  color: '1a1a2e',
  transparency: 50
}

// 图片背景
slide.background = { path: 'images/background.jpg' }

// Base64 图片背景
slide.background = { data: 'data:image/png;base64,...' }
```

---

## 文本元素

### 基本文本

```javascript
// ═══════════════════════════════════════════════════════════════
// 简单文本
// ═══════════════════════════════════════════════════════════════
slide.addText('简单文本', {
  x: 0.5,           // 左边距（英寸）
  y: 0.5,           // 上边距（英寸）
  w: '90%',         // 宽度（可用百分比或英寸）
  h: 1,             // 高度（英寸）
  fontSize: 24,     // 字号（磅）
  color: '363636',  // 颜色（十六进制，不带#）
  bold: true,       // 粗体
  italic: false,    // 斜体
  underline: false, // 下划线
  fontFace: '微软雅黑'
})
```

### 文本对齐

```javascript
slide.addText('居中文本', {
  x: 0.5, y: 1, w: '90%', h: 1,
  align: 'center',    // 水平对齐: left, center, right, justify
  valign: 'middle'    // 垂直对齐: top, middle, bottom
})
```

### 多段落文本

```javascript
// ═══════════════════════════════════════════════════════════════
// 多段落（数组形式）
// ═══════════════════════════════════════════════════════════════
slide.addText([
  { text: '标题行', options: { fontSize: 28, bold: true, breakLine: true } },
  { text: '正文第一段', options: { fontSize: 18, breakLine: true } },
  { text: '正文第二段', options: { fontSize: 18 } }
], {
  x: 0.5, y: 1, w: '90%', h: 4
})
```

### 项目符号列表

```javascript
// ═══════════════════════════════════════════════════════════════
// 项目符号
// ═══════════════════════════════════════════════════════════════
slide.addText([
  { text: '第一点', options: { bullet: true, indentLevel: 0 } },
  { text: '第二点', options: { bullet: true, indentLevel: 0 } },
  { text: '子项目', options: { bullet: true, indentLevel: 1 } },
  { text: '第三点', options: { bullet: true, indentLevel: 0 } }
], {
  x: 0.5, y: 1, w: '90%', h: 3,
  fontSize: 18,
  color: '333333'
})

// 自定义项目符号
slide.addText([
  { text: '自定义符号', options: { bullet: { type: 'number' } } },  // 数字
  { text: '自定义符号', options: { bullet: { code: '2605' } } }     // Unicode 星号
], { x: 0.5, y: 4, w: '90%' })
```

### 文本框样式

```javascript
slide.addText('带边框的文本', {
  x: 1, y: 1, w: 4, h: 1.5,
  fill: { color: 'f0f0f0' },           // 背景填充
  line: { color: '0066cc', width: 1 }, // 边框
  shadow: {                             // 阴影
    type: 'outer',
    blur: 3,
    offset: 2,
    angle: 45,
    color: '000000',
    opacity: 0.3
  }
})
```

---

## 图片元素

### 添加图片

```javascript
// ═══════════════════════════════════════════════════════════════
// 本地图片
// ═══════════════════════════════════════════════════════════════
slide.addImage({
  path: 'images/logo.png',
  x: 1, y: 1,
  w: 4, h: 3
})

// Base64 图片
slide.addImage({
  data: 'data:image/png;base64,iVBORw0KGgo...',
  x: 1, y: 1, w: 4, h: 3
})

// URL 图片（需要网络访问）
slide.addImage({
  path: 'https://example.com/image.png',
  x: 1, y: 1, w: 4, h: 3
})
```

### 图片选项

```javascript
slide.addImage({
  path: 'images/photo.jpg',
  x: 1, y: 1, w: 4, h: 3,
  sizing: {
    type: 'cover',  // cover, contain, crop
    w: 4, h: 3
  },
  hyperlink: { url: 'https://example.com' },  // 超链接
  rounding: true  // 圆角
})
```

---

## 形状元素

### 基本形状

```javascript
// ═══════════════════════════════════════════════════════════════
// 矩形
// ═══════════════════════════════════════════════════════════════
slide.addShape(pres.ShapeType.rect, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: '0066cc' },
  line: { color: '003366', width: 1 }
})

// 圆形
slide.addShape(pres.ShapeType.ellipse, {
  x: 5, y: 1, w: 2, h: 2,
  fill: { color: 'ff6600' }
})

// 圆角矩形
slide.addShape(pres.ShapeType.roundRect, {
  x: 1, y: 4, w: 3, h: 1.5,
  fill: { color: '00cc66' },
  rectRadius: 0.2  // 圆角半径
})
```

### 常用形状类型

| 形状 | 代码 | 说明 |
|------|------|------|
| 矩形 | rect | 基本矩形 |
| 圆角矩形 | roundRect | 带圆角 |
| 椭圆 | ellipse | 椭圆/圆形 |
| 三角形 | triangle | 等边三角形 |
| 箭头 | rightArrow | 右箭头 |
| 线条 | line | 直线 |

### 线条

```javascript
// 直线
slide.addShape(pres.ShapeType.line, {
  x: 1, y: 1, w: 5, h: 0,
  line: { color: '333333', width: 2, dashType: 'solid' }
})

// 虚线
slide.addShape(pres.ShapeType.line, {
  x: 1, y: 2, w: 5, h: 0,
  line: { color: '333333', width: 2, dashType: 'dash' }
})
```

---

## 表格元素

### 基本表格

```javascript
// ═══════════════════════════════════════════════════════════════
// 简单表格
// ═══════════════════════════════════════════════════════════════
const tableData = [
  ['姓名', '部门', '职位'],
  ['张三', '技术部', '工程师'],
  ['李四', '市场部', '经理'],
  ['王五', '财务部', '主管']
]

slide.addTable(tableData, {
  x: 0.5, y: 1, w: 9,
  colW: [2, 3, 4],  // 列宽
  border: { type: 'solid', color: 'cccccc', pt: 1 },
  fontFace: '微软雅黑',
  fontSize: 14
})
```

### 表格样式

```javascript
const tableData = [
  [
    { text: '标题1', options: { bold: true, fill: '0066cc', color: 'ffffff' } },
    { text: '标题2', options: { bold: true, fill: '0066cc', color: 'ffffff' } }
  ],
  [
    { text: '数据1', options: { fill: 'f0f0f0' } },
    { text: '数据2', options: { fill: 'f0f0f0' } }
  ]
]

slide.addTable(tableData, {
  x: 0.5, y: 1, w: 9,
  align: 'center',
  valign: 'middle'
})
```

---

## 图表元素

### 柱状图

```javascript
// ══════════════════════════════���════════════════════════════════
// 柱状图
// ═══════════════════════════════════════════════════════════════
const chartData = [
  {
    name: '销售额',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    values: [120, 150, 180, 200]
  }
]

slide.addChart(pres.ChartType.bar, chartData, {
  x: 0.5, y: 1, w: 6, h: 4,
  barDir: 'col',  // col=垂直柱状图, bar=水平条形图
  showTitle: true,
  title: '季度销售额',
  showLegend: true,
  legendPos: 'b'  // t=上, b=下, l=左, r=右
})
```

### 折线图

```javascript
const lineData = [
  {
    name: '2024年',
    labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
    values: [100, 120, 115, 140, 160, 180]
  },
  {
    name: '2025年',
    labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
    values: [110, 130, 145, 170, 190, 220]
  }
]

slide.addChart(pres.ChartType.line, lineData, {
  x: 0.5, y: 1, w: 6, h: 4,
  showTitle: true,
  title: '月度趋势对比',
  lineSmooth: true,  // 平滑曲线
  lineDataSymbol: 'circle'  // 数据点样式
})
```

### 饼图

```javascript
const pieData = [
  {
    name: '市场份额',
    labels: ['产品A', '产品B', '产品C', '其他'],
    values: [35, 25, 20, 20]
  }
]

slide.addChart(pres.ChartType.pie, pieData, {
  x: 0.5, y: 1, w: 5, h: 4,
  showTitle: true,
  title: '产品市场份额',
  showPercent: true,
  showLegend: true
})
```

### 图表类型

| 类型 | 代码 | 说明 |
|------|------|------|
| 柱状图 | bar | 垂直/水平柱状 |
| 折线图 | line | 趋势线 |
| 面积图 | area | 填充面积 |
| 饼图 | pie | 占比分布 |
| 环形图 | doughnut | 空心饼图 |
| 散点图 | scatter | 数据分布 |

---

## 主题与样式

### 定义主题颜色

```javascript
// ═══════════════════════════════════════════════════════════════
// 主题配色方案
// ═══���═══════════════════════════════════════════════════════════
const theme = {
  primary: '0066cc',
  secondary: '003366',
  accent: 'ff6600',
  background: 'ffffff',
  text: '333333',
  lightText: '666666'
}

// 应用到幻灯片
const slide = pres.addSlide({ background: { color: theme.background } })

slide.addText('标题', {
  x: 0.5, y: 0.5, w: '90%',
  fontSize: 36, color: theme.primary, bold: true
})

slide.addText('正文', {
  x: 0.5, y: 1.5, w: '90%',
  fontSize: 18, color: theme.text
})
```

### 母版幻灯片

```javascript
// 定义母版
pres.defineSlideMaster({
  title: 'MASTER_SLIDE',
  background: { color: 'ffffff' },
  objects: [
    // 页脚
    { text: { text: '© 2025 公司名', options: { x: 0.5, y: '95%', fontSize: 10, color: '999999' } } },
    // Logo
    { image: { path: 'images/logo.png', x: '90%', y: 0.2, w: 0.8, h: 0.4 } }
  ]
})

// 使用母版
const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' })
```

---

## 动画效果

### 入场动画

```javascript
slide.addText('动画文本', {
  x: 1, y: 1, w: 5, h: 1,
  fontSize: 24
}).animate = {
  type: 'appear',  // appear, fade, fly, zoom
  delay: 0,        // 延迟（秒）
  duration: 0.5    // 持续时间（秒）
}
```

### 常用动画类型

| 类型 | 效果 |
|------|------|
| appear | 出现 |
| fade | 淡入 |
| fly | 飞入 |
| zoom | 缩放 |
| bounce | 弹跳 |

---

## 完整示例

### 商务报告模板

```javascript
import pptxgen from 'pptxgenjs'

// ═══════════════════════════════════════════════════════════════
// 创建商务报告演示文稿
// ═══════════════════════════════════════════════════════════════
async function createBusinessReport() {
  const pres = new pptxgen()

  // 设置属性
  pres.author = '张三'
  pres.title = '2025年度业务报告'
  pres.layout = 'LAYOUT_16x9'

  // 主题配色
  const theme = {
    primary: '1a365d',
    accent: '2b6cb0',
    bg: 'f7fafc',
    text: '2d3748'
  }

  // ─────────────────────────────────────────────────────────────
  // 封面页
  // ─────────────────────────────────────────────────────────────
  const cover = pres.addSlide({ background: { color: theme.primary } })

  cover.addText('2025年度业务报告', {
    x: 0.5, y: 2, w: '90%', h: 1.5,
    fontSize: 44, color: 'ffffff', bold: true, align: 'center'
  })

  cover.addText('ABC科技有限公司', {
    x: 0.5, y: 3.5, w: '90%', h: 0.8,
    fontSize: 24, color: 'e2e8f0', align: 'center'
  })

  cover.addText('2025年1月', {
    x: 0.5, y: 4.5, w: '90%', h: 0.5,
    fontSize: 16, color: 'a0aec0', align: 'center'
  })

  // ─────────────────────────────────────────────────────────────
  // 目录页
  // ─────────────────────────────────────────────────────────────
  const toc = pres.addSlide({ background: { color: theme.bg } })

  toc.addText('目录', {
    x: 0.5, y: 0.5, w: '90%',
    fontSize: 32, color: theme.primary, bold: true
  })

  toc.addText([
    { text: '1. 业务概览', options: { bullet: true, fontSize: 20 } },
    { text: '2. 财务数据', options: { bullet: true, fontSize: 20 } },
    { text: '3. 市场分析', options: { bullet: true, fontSize: 20 } },
    { text: '4. 未来规划', options: { bullet: true, fontSize: 20 } }
  ], {
    x: 1, y: 1.5, w: 8, h: 3,
    color: theme.text
  })

  // ─────────────────────────────────────────────────────────────
  // 数据页
  // ─────────────────────────────────────────────────────────────
  const data = pres.addSlide({ background: { color: theme.bg } })

  data.addText('季度销售数据', {
    x: 0.5, y: 0.3, w: '90%',
    fontSize: 28, color: theme.primary, bold: true
  })

  const chartData = [{
    name: '销售额（万元）',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    values: [1200, 1500, 1800, 2200]
  }]

  data.addChart(pres.ChartType.bar, chartData, {
    x: 0.5, y: 1, w: 6, h: 4,
    barDir: 'col',
    showValue: true,
    chartColors: [theme.accent]
  })

  // ─────────────────────────────────────────────────────────────
  // 结束页
  // ─────────────────────────────────────────────────────────────
  const end = pres.addSlide({ background: { color: theme.primary } })

  end.addText('谢谢观看', {
    x: 0.5, y: 2, w: '90%', h: 1,
    fontSize: 44, color: 'ffffff', bold: true, align: 'center'
  })

  end.addText('联系方式: contact@abc.com', {
    x: 0.5, y: 3.5, w: '90%',
    fontSize: 18, color: 'e2e8f0', align: 'center'
  })

  // ─────────────────────────────────────────────────────────────
  // 保存文件
  // ─────────────────────────────────────────────────────────────
  await pres.writeFile({ fileName: 'business-report-2025.pptx' })
  console.log('演示文稿已生成: business-report-2025.pptx')
}

createBusinessReport()
```

---

## 最佳实践

### 1. 保持一致性

- 使用主题对象统一管理颜色
- 定义常量管理字号、间距
- 使用母版确保页面一致

### 2. 性能优化

- 图片使用适当分辨率（72-150 DPI）
- 避免过多动画效果
- 大型演示分批生成

### 3. 代码组织

```javascript
// 推荐的代码结构
const theme = { /* 主题配置 */ }
const layouts = { /* 布局配置 */ }

function createCoverSlide(pres) { /* 封面 */ }
function createContentSlide(pres, data) { /* 内容 */ }
function createEndSlide(pres) { /* 结束 */ }

async function main() {
  const pres = new pptxgen()
  createCoverSlide(pres)
  data.forEach(d => createContentSlide(pres, d))
  createEndSlide(pres)
  await pres.writeFile({ fileName: 'output.pptx' })
}
```

---

## 参考资源

- [pptxgenjs 官方文档](https://gitbrent.github.io/PptxGenJS/)
- [GitHub 仓库](https://github.com/gitbrent/PptxGenJS)
- [API 参考](https://gitbrent.github.io/PptxGenJS/docs/api-reference/)
