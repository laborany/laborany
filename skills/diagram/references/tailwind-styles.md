# Tailwind CSS 样式参考

> 图表样式系统与主题配置

## 目录

1. [主题系统](#主题系统)
2. [颜色方案](#颜色方案)
3. [节点样式](#节点样式)
4. [连线样式](#连线样式)
5. [排版规范](#排版规范)
6. [响应式设计](#响应式设计)

---

## 主题系统

### 学术主题 (Academic)

适用于论文、学术报告。黑白配色，简洁专业。

```javascript
const academicTheme = {
  canvas: "bg-white",
  node: {
    rect: "bg-white border-2 border-gray-800 text-gray-800",
    diamond: "bg-white border-2 border-gray-800 text-gray-800",
    circle: "bg-gray-800 text-white",
  },
  arrow: {
    color: "#1f2937",
    width: 2,
  },
  text: {
    title: "text-gray-900 font-serif",
    label: "text-gray-700 text-sm",
  },
};
```

**Tailwind 类：**
```
节点: bg-white border-2 border-gray-800 text-gray-800 shadow-none
箭头: stroke-gray-800
背景: bg-white
```

### 商务主题 (Corporate)

适用于商务文档、PPT。蓝色系，专业大气。

```javascript
const corporateTheme = {
  canvas: "bg-gray-50",
  node: {
    rect: "bg-blue-500 text-white shadow-lg",
    diamond: "bg-blue-600 text-white shadow-lg",
    circle: "bg-blue-700 text-white shadow-lg",
  },
  arrow: {
    color: "#3b82f6",
    width: 2,
  },
  text: {
    title: "text-gray-800 font-sans font-bold",
    label: "text-blue-600 text-sm",
  },
};
```

**Tailwind 类：**
```
节点: bg-blue-500 text-white shadow-lg rounded-lg
箭头: stroke-blue-500
背景: bg-gray-50
```

### 彩色主题 (Colorful)

适用于演示、教学。多彩活泼。

```javascript
const colorfulTheme = {
  canvas: "bg-gradient-to-br from-purple-50 to-blue-50",
  node: {
    colors: ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-blue-500", "bg-purple-500"],
    base: "text-white shadow-lg rounded-xl",
  },
  arrow: {
    color: "#6b7280",
    width: 2,
  },
};
```

### 极简主题 (Minimal)

适用于极简风格设计。灰度配色。

```javascript
const minimalTheme = {
  canvas: "bg-white",
  node: {
    rect: "bg-gray-100 text-gray-700 border border-gray-200",
    diamond: "bg-gray-200 text-gray-700",
    circle: "bg-gray-300 text-gray-700",
  },
  arrow: {
    color: "#9ca3af",
    width: 1,
  },
};
```

---

## 颜色方案

### 主色板

| 用途 | Tailwind 类 | 色值 |
|------|-------------|------|
| 主要操作 | `bg-blue-500` | #3b82f6 |
| 成功/开始 | `bg-green-500` | #22c55e |
| 警告/判断 | `bg-yellow-500` | #eab308 |
| 错误/结束 | `bg-red-500` | #ef4444 |
| 中性 | `bg-gray-500` | #6b7280 |

### 层级色板

用于架构图的层级区分：

```
应用层: bg-blue-500 / bg-blue-50 (边框)
服务层: bg-green-500 / bg-green-50
数据层: bg-purple-500 / bg-purple-50
基础设施: bg-gray-500 / bg-gray-50
```

### 渐变色

```
bg-gradient-to-r from-blue-500 to-purple-500
bg-gradient-to-br from-green-400 to-blue-500
bg-gradient-to-r from-orange-500 to-red-500
```

---

## 节点样式

### 基础节点

```css
/* 矩形节点 */
.node-rect {
  @apply px-6 py-3 rounded-lg shadow-md text-center font-medium;
}

/* 菱形节点 */
.node-diamond {
  @apply w-28 h-28 rotate-45 flex items-center justify-center shadow-md;
}

/* 圆形节点 */
.node-circle {
  @apply w-20 h-20 rounded-full flex items-center justify-center shadow-md;
}
```

### 尺寸变体

| 尺寸 | 矩形 | 圆形 |
|------|------|------|
| 小 | `px-4 py-2 text-sm` | `w-16 h-16 text-xs` |
| 中 | `px-6 py-3 text-base` | `w-20 h-20 text-sm` |
| 大 | `px-8 py-4 text-lg` | `w-24 h-24 text-base` |

### 阴影变体

```
无阴影: shadow-none
轻阴影: shadow-sm
标准: shadow-md
重阴影: shadow-lg
超重: shadow-xl
```

### 边框变体

```
无边框: border-none
细边框: border border-gray-200
标准: border-2 border-gray-300
粗边框: border-4 border-gray-400
```

---

## 连线样式

### SVG 线条

```javascript
// 实线
<line stroke="#666" strokeWidth="2" />

// 虚线
<line stroke="#666" strokeWidth="2" strokeDasharray="5,5" />

// 点线
<line stroke="#666" strokeWidth="2" strokeDasharray="2,4" />
```

### 箭头标记

```jsx
<defs>
  {/* 标准箭头 */}
  <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
  </marker>

  {/* 圆形端点 */}
  <marker id="dot" markerWidth="8" markerHeight="8" refX="4" refY="4">
    <circle cx="4" cy="4" r="3" fill="#666" />
  </marker>

  {/* 菱形端点 */}
  <marker id="diamond" markerWidth="12" markerHeight="12" refX="6" refY="6">
    <polygon points="6 0, 12 6, 6 12, 0 6" fill="#666" />
  </marker>
</defs>
```

---

## 排版规范

### 字体大小

| 用途 | Tailwind 类 | 像素 |
|------|-------------|------|
| 标题 | `text-xl` | 20px |
| 节点文字 | `text-base` | 16px |
| 标签 | `text-sm` | 14px |
| 注释 | `text-xs` | 12px |

### 字重

```
普通: font-normal
中等: font-medium
粗体: font-bold
```

### 间距

```
节点间距: gap-8 (32px)
层级间距: gap-6 (24px)
内部间距: p-4 (16px)
紧凑间距: gap-4 (16px)
```

---

## 响应式设计

### 画布尺寸

```jsx
// 标准画布
<div className="w-full max-w-4xl mx-auto">

// 宽画布
<div className="w-full max-w-6xl mx-auto">

// 全宽画布
<div className="w-full px-8">
```

### 导出尺寸

```javascript
// 标准分辨率
html2canvas(element, { scale: 2 })

// 高分辨率
html2canvas(element, { scale: 3 })

// 超高分辨率（印刷）
html2canvas(element, { scale: 4 })
```

---

## 常用组合

### 学术论文节点

```jsx
<div className="px-6 py-3 bg-white border-2 border-gray-800 text-gray-800 text-center">
  处理步骤
</div>
```

### 商务演示节点

```jsx
<div className="px-6 py-3 bg-blue-500 text-white rounded-lg shadow-lg text-center">
  处理步骤
</div>
```

### 架构图模块

```jsx
<div className="p-4 bg-white border border-gray-200 rounded-lg shadow-md">
  <div className="font-bold text-sm mb-2">模块名称</div>
  <div className="text-xs text-gray-600">描述信息</div>
</div>
```
