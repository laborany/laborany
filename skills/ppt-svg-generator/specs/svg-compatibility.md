# SVG → PPT 兼容性规范

> 确保生成的 SVG 文件能在 PowerPoint 中完美转换为可编辑形状

## 🎯 规范概述

将 SVG 导入 PowerPoint 并点击「转换为形状」后，可能出现以下问题：
- 圆角矩形变成直角矩形
- 文字位置偏移
- 字号大小变化
- 字体颜色改变（尤其是半透明颜色）
- 阴影效果丢失

**以下 5 条规范必须严格遵守**，以确保最佳兼容性。

---

## 📐 规范 1: 圆角矩形优化

### 问题
`<rect rx="24">` 属性在 PPT 中可能丢失圆角

### 解决方案
使用 `<path>` 配合贝塞尔曲线 `C` 命令绘制圆角

### 代码对比

```xml
<!-- ❌ 错误写法 - PPT 可能丢失圆角 -->
<rect x="100" y="160" width="840" height="340" rx="24" fill="white"/>

<!-- ✅ 正确写法 - 使用 path 绘制圆角矩形 -->
<path d="M124,160 L916,160 C931,160 940,169 940,184 L940,476 C940,491 931,500 916,500 L124,500 C109,500 100,491 100,476 L100,184 C100,169 109,160 124,160 Z" fill="white"/>
```

### Path 圆角矩形绘制公式

对于一个位于 `(x, y)`，宽 `w`、高 `h`、圆角半径 `r` 的矩形：

```
M [x+r],y                    // 起点（左上圆角右端）
L [x+w-r],y                  // 顶边直线
C [x+w],y [x+w],[y+r]        // 右上圆角
L [x+w],[y+h-r]              // 右边直线
C [x+w],[y+h] [x+w-r],[y+h]  // 右下圆角
L [x+r],[y+h]                // 底边直线
C x,[y+h] x,[y+h-r]          // 左下圆角
L x,[y+r]                    // 左边直线
C x,y [x+r],y                // 左上圆角
Z                            // 闭合路径
```

### 快速生成工具

```javascript
// 生成圆角矩形 path
function roundedRect(x, y, w, h, r) {
  return `M${x+r},${y} L${x+w-r},${y} C${x+w},${y} ${x+w},${y+r} ${x+w},${y+r} L${x+w},${y+h-r} C${x+w},${y+h} ${x+w-r},${y+h} ${x+w-r},${y+h} L${x+r},${y+h} C${x},${y+h} ${x},${y+h-r} ${x},${y+h-r} L${x},${y+r} C${x},${y} ${x+r},${y} ${x+r},${y} Z`;
}
```

---

## 🔤 规范 2: 字体优化

### 问题
`PingFang SC` 在 Windows 上不存在，导致回退字体时布局变化

### 解决方案
优先使用跨平台字体，Windows 字体放在最前面

### 代码对比

```xml
<!-- ❌ 错误写法 - PingFang SC 在 Windows 不存在 -->
font-family="PingFang SC, Microsoft YaHei, sans-serif"

<!-- ✅ 正确写法 - Windows 字体优先 -->
font-family="Microsoft YaHei, SimHei, PingFang SC, sans-serif"

<!-- ✅ 推荐写法 - 使用 style 属性 -->
style="font-family:Microsoft YaHei,SimHei,PingFang SC,sans-serif;"
```

### 推荐字体列表

| 优先级 | 字体名称 | 平台 |
|--------|---------|------|
| 1 | Microsoft YaHei | Windows |
| 2 | SimHei | Windows |
| 3 | PingFang SC | macOS/iOS |
| 4 | Hiragino Sans GB | macOS |
| 5 | sans-serif | 回退 |

---

## 📍 规范 3: 文字定位优化

### 问题
`text-anchor` 和 `dominant-baseline` 属性在 PPT 中支持不完善

### 解决方案
- 使用 `style` 属性整合样式
- 手动计算居中位置
- 尽量使用左对齐

### 代码对比

```xml
<!-- ❌ 错误写法 - PPT 支持不完善 -->
<text x="210" y="170" text-anchor="middle" dominant-baseline="middle">文字</text>

<!-- ✅ 正确写法 - 使用 style 属性 -->
<text x="210" y="170" style="font-family:Microsoft YaHei,SimHei,sans-serif; font-size:24px; text-anchor:middle;">文字</text>

<!-- ✅ 更安全的写法 - 手动计算位置，左对齐 -->
<text x="150" y="178" style="font-family:Microsoft YaHei,SimHei,sans-serif; font-size:24px;">文字</text>
```

### 居中计算公式

```
水平居中: x = 容器x + (容器宽度 - 文字宽度) / 2
垂直居中: y = 容器y + (容器高度 / 2) + (字号 / 3)  // 粗略估算
```

---

## 🎨 规范 4: 颜色格式优化

### 问题
`rgba()` 和带透明度的十六进制颜色（如 `#FFFFFFCC`）PPT 支持不完善

### 解决方案
- 使用标准六位十六进制颜色 `#RRGGBB`
- 透明度使用 `fill-opacity` 或 `stroke-opacity` 属性

### 代码对比

```xml
<!-- ❌ 错误写法 - PPT 支持不佳 -->
fill="rgba(1,107,255,0.1)"
fill="#FFFFFFCC"
fill="rgb(1,107,255)"

<!-- ✅ 正确写法 - 分离颜色和透明度 -->
fill="#016BFF" fill-opacity="0.1"
fill="#FFFFFF" fill-opacity="0.8"
fill="#016BFF"
```

### 常用颜色转换

| 原格式 | 转换后 |
|--------|--------|
| `rgb(1,107,255)` | `#016BFF` |
| `rgb(86,91,255)` | `#565BFF` |
| `rgb(46,204,247)` | `#2ECCF7` |
| `rgb(246,246,246)` | `#F6F6F6` |
| `rgba(0,0,0,0.1)` | `#000000` + `fill-opacity="0.1"` |

---

## 🌫️ 规范 5: 阴影效果处理

### 问题
`filter="drop-shadow(...)"` PPT 完全不支持

### 解决方案
在 SVG 中移除 filter 属性，转换为形状后在 PPT 中手动添加阴影

### 代码对比

```xml
<!-- ❌ 错误写法 - PPT 不支持 -->
<rect ... filter="drop-shadow(0 4px 20px rgba(0,0,0,0.06))"/>

<filter id="cardShadow">
  <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.08"/>
</filter>

<!-- ✅ 正确写法 - 移除 filter，后续在 PPT 添加 -->
<rect .../>
<!-- 注释：在 PPT 中添加阴影：格式 → 形状效果 → 阴影 → 偏移下 -->
```

### PPT 中添加阴影的步骤

1. 选中形状
2. 格式 → 形状效果 → 阴影
3. 选择「外部」→「偏移: 下」
4. 调整透明度和模糊度

---

## 📋 检查清单

生成 SVG 后，使用此清单进行检查：

| # | 检查项 | 要求 |
|---|--------|------|
| 1 | 圆角矩形 | 使用 `<path>` 实现，不用 `rx` |
| 2 | 字体 | `Microsoft YaHei` 在最前面 |
| 3 | 文字样式 | 使用 `style` 属性整合 |
| 4 | 颜色 | `#RRGGBB` 格式，透明度分离 |
| 5 | 阴影 | 已移除 `filter` 属性 |
| 6 | 编码 | UTF-8 |
| 7 | 尺寸 | 1920 × 1080 |

---

## 🔧 备选方案

如果优化后仍有问题，可考虑：

| 方案 | 说明 | 优缺点 |
|------|------|--------|
| 文字转路径 | 用 Inkscape 将文字转为 `<path>` | 完美保持，但不可编辑 |
| python-pptx | 使用 Python 直接生成 PPTX | 原生格式，但开发成本高 |
| 保持图片 | 不转换为形状，作为图片使用 | 简单，但完全不可编辑 |

---

## 📚 相关文档

- [设计系统](design-system.md) - 字体、间距、组件规范
- [页面模板](page-templates.md) - 各类页面的布局模板
