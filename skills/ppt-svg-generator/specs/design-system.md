# 设计系统规范

> PPT SVG 生成的通用设计规范，包括画布、字体、间距、组件等

## 📐 基础配置

### 画布尺寸

```
尺寸: 1920 × 1080 px
比例: 16:9
DPI: 96 (标准屏幕)
```

### 安全区域

```
页面边距: 80px (四周)
内容安全区: 1760 × 920 px
顶部保留: 用于标题和装饰条
底部保留: 用于页码
```

```
┌────────────────────────────────────────────────────────────┐
│  80px 边距                                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │                    内容安全区                         │  │
│  │                  1760 × 920 px                       │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                              页码 →  01/14 │
└────────────────────────────────────────────────────────────┘
```

---

## 🔤 字体规范

### 字体族

```css
font-family: "Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
```

**注意**：Windows 字体必须放在最前面，确保跨平台兼容。

### 字号体系

| 用途 | 字号 | 字重 | 行高 | 使用场景 |
|------|------|------|------|---------|
| 超大标题 | 88px | 700 | 1.2 | 封面主标题 |
| 大标题 | 72px | 700 | 1.2 | 封面副场景 |
| 页面标题 | 48px | 700 | 1.3 | 每页主标题 |
| 章节标题 | 42px | 700 | 1.3 | 章节标识 |
| 副标题 | 32px | 600 | 1.4 | 页面副标题 |
| 正文大 | 28px | 400 | 1.5 | 引言、重点正文 |
| 正文 | 24px | 400 | 1.5 | 普通正文 |
| 正文小 | 20px | 400 | 1.5 | 辅助说明 |
| 标注 | 18px | 400 | 1.4 | 页码、来源、注释 |
| 微标注 | 14px | 400 | 1.4 | 图表标注 |

### 字重对照

| 字重值 | 名称 | 用途 |
|--------|------|------|
| 400 | Regular | 正文 |
| 500 | Medium | 强调正文 |
| 600 | SemiBold | 副标题 |
| 700 | Bold | 标题 |
| 800 | ExtraBold | 装饰性大字 |

---

## 📏 间距系统

### 基准单位

基准单位: `8px`

所有间距都应是 8 的倍数，确保视觉一致性。

### 间距层级

| 名称 | 值 | 用途 |
|------|------|------|
| 微间距 | 8px | 图标与文字、行内元素 |
| 小间距 | 16px | 段落内元素 |
| 中小间距 | 24px | 紧凑卡片内部 |
| 中间距 | 32px | 卡片内部、模块内 |
| 大间距 | 48px | 模块之间 |
| 超大间距 | 64px | 区块之间 |
| 页面边距 | 80px | 页面四周 |

### 常用间距组合

```
标题与副标题: 16px
副标题与正文: 32px
卡片内边距: 24px
卡片间距: 32px
模块间距: 48px
```

---

## 🧩 组件样式

### 卡片 (Card)

```xml
<!-- 基础卡片 - 白底 -->
<path d="M[x+16],[y] L[x+w-16],[y] C[x+w],[y] [x+w],[y+16] ..." fill="#FFFFFF"/>

<!-- 卡片参数 -->
圆角: 16px (使用 path 实现)
背景: #FFFFFF (白色)
阴影: 在 PPT 中手动添加
内边距: 24px
```

### 装饰渐变条

```xml
<defs>
  <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="[主色]" stop-opacity="1"/>
    <stop offset="100%" stop-color="[次色]" stop-opacity="1"/>
  </linearGradient>
</defs>

<!-- 顶部装饰条 -->
<rect x="0" y="0" width="1920" height="6" fill="url(#brandGradient)"/>

<!-- 标题下装饰条 -->
<rect x="[x]" y="[y]" width="120" height="4" rx="2" fill="url(#brandGradient)"/>
```

### 圆形编号

```xml
<!-- 编号圆圈 -->
<circle cx="[x+20]" cy="[y+20]" r="20" fill="[主色]"/>
<text x="[x+20]" y="[y+26]" style="font-family:Microsoft YaHei,SimHei,sans-serif; font-size:18px; font-weight:600;" fill="#FFFFFF" text-anchor="middle">1</text>
```

### 引言框

```xml
<!-- 左侧竖条 + 引言文字 -->
<g transform="translate([x], [y])">
  <!-- 竖条 -->
  <rect x="0" y="0" width="4" height="[高度]" rx="2" fill="[次色]"/>
  <!-- 引言文字 -->
  <text x="20" y="28" style="font-family:Microsoft YaHei,SimHei,sans-serif; font-size:24px; font-style:italic;" fill="[次色]">
    "引言内容..."
  </text>
</g>
```

### 要点列表

```xml
<!-- 带圆点的列表项 -->
<g transform="translate([x], [y])">
  <circle cx="8" cy="12" r="4" fill="[主色]"/>
  <text x="24" y="18" style="font-family:Microsoft YaHei,SimHei,sans-serif; font-size:20px;" fill="[文字色]">列表项内容</text>
</g>
```

### 章节装饰数字

```xml
<!-- 大号透明装饰数字 -->
<text x="100" y="200" style="font-family:Microsoft YaHei,SimHei,sans-serif; font-size:200px; font-weight:800;" fill="[主色]" fill-opacity="0.1">
  I
</text>
```

### 高亮框

```xml
<!-- 浅色背景高亮 -->
<path d="M..." fill="[主色]" fill-opacity="0.06"/>
<rect x="0" y="0" width="4" height="100%" fill="[主色]"/>
```

### 对比卡片

```xml
<!-- 正面/负面对比 -->
<!-- 负面卡片 -->
<path d="M..." fill="#FFFFFF"/>
<path d="M... (顶部)" fill="#C8C8C8"/>  <!-- 灰色顶部 -->

<!-- 正面卡片 -->
<path d="M..." fill="#FFFFFF"/>
<path d="M... (顶部)" fill="[主色]"/>  <!-- 主色顶部 -->
```

---

## 🎨 颜色使用规范

### 语义颜色

| 语义 | 用途 | 建议颜色 |
|------|------|---------|
| 成功/正面 | 正确答案、增长 | 绿色系 |
| 警告 | 注意事项 | 橙色/黄色系 |
| 错误/负面 | 错误答案、下降 | 红色系 |
| 信息/中性 | 普通信息 | 蓝色/灰色系 |

### 对比度要求

| 背景 | 文字 | 最小对比度 |
|------|------|-----------|
| 浅色背景 | 深色文字 | 4.5:1 |
| 深色背景 | 浅色文字 | 4.5:1 |
| 品牌色背景 | 白色文字 | 3:1 |

### 透明度使用

| 透明度 | 用途 |
|--------|------|
| 100% | 主要元素、文字 |
| 80% | 次要文字 |
| 60% | 辅助线、边框 |
| 30% | 背景装饰 |
| 10% | 大面积装饰、水印 |

---

## 📋 SVG 基础框架

每个页面的 SVG 都应以此为基础：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <!-- 渐变定义 -->
    <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="[主色]" stop-opacity="1"/>
      <stop offset="100%" stop-color="[次色]" stop-opacity="1"/>
    </linearGradient>
  </defs>
  
  <!-- 背景 -->
  <rect width="1920" height="1080" fill="[背景色]"/>
  
  <!-- 顶部装饰条 (可选) -->
  <rect x="0" y="0" width="1920" height="6" fill="url(#brandGradient)"/>
  
  <!-- ========== 页面内容区域 ========== -->
  
  <!-- 内容在此 -->
  
  <!-- ========== 页面内容结束 ========== -->
  
  <!-- 底部装饰条 (可选) -->
  <rect x="0" y="1074" width="1920" height="6" fill="url(#brandGradient)"/>
  
  <!-- 页码 -->
  <text x="1840" y="1040" style="font-family:Microsoft YaHei,SimHei,sans-serif; font-size:18px;" fill="[次要文字色]" text-anchor="end">
    01/14
  </text>
</svg>
```

---

## 📚 相关文档

- [SVG 兼容性规范](svg-compatibility.md) - PPT 转换的优化规则
- [页面模板](page-templates.md) - 各类页面的布局模板
