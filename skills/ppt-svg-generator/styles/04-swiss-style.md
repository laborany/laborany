# 风格 04：瑞士平面 (Swiss Style)

## 风格概述

| 属性 | 值 |
|------|-----|
| 风格名称 | 瑞士平面 / Swiss Style (International Typographic Style) |
| 设计理念 | 包豪斯美学，网格系统，功能至上 |
| 适用场景 | 品牌宣讲、艺术展示、创意提案、设计发布 |
| 情绪基调 | 大胆、现代、有力、艺术感 |

---

## 配色方案

### 主色板

| 角色 | 颜色名称 | Hex | RGB | 使用场景 |
|------|----------|-----|-----|----------|
| 主色 | 信号红 | `#E2001A` | rgb(226,0,26) | 标题、强调、色块 |
| 背景色 | 纯白 | `#FFFFFF` | rgb(255,255,255) | 页面背景 |
| 主文字 | 纯黑 | `#000000` | rgb(0,0,0) | 标题、正文 |
| 次文字 | 深灰 | `#333333` | rgb(51,51,51) | 副标题 |
| 辅助色 | 中灰 | `#808080` | rgb(128,128,128) | 说明文字、辅助元素 |
| 装饰色 | 黄色 | `#FFD700` | rgb(255,215,0) | 少量点缀（可选） |
| 装饰色 | 蓝色 | `#0057B8` | rgb(0,87,184) | 少量点缀（可选） |

### 色彩使用规则

```
背景：纯白 #FFFFFF（主）或 纯黑 #000000（反转页）
文字：纯黑 #000000 为主，信号红 #E2001A 强调
色块：信号红 #E2001A 大面积色块，制造视觉冲击
原则：最多使用 3 种颜色，保持克制
三原色：红 #E2001A / 黄 #FFD700 / 蓝 #0057B8 偶尔组合使用
```

---

## 字体配置

### 中文字体栈
```
font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

### 英文字体栈（重要）
```
/* 瑞士风格首选 Helvetica 系列 */
font-family: "Helvetica Neue", "Helvetica", "Arial", sans-serif;
```

### 字号规范

| 层级 | 中文 | 英文 | 字重 | 用途 |
|------|------|------|------|------|
| H1 | 72px | 96px | Black (900) | 封面标题（超大） |
| H2 | 48px | 60px | Bold (700) | 章节标题 |
| H3 | 32px | 40px | Bold (700) | 页面标题 |
| H4 | 22px | 26px | Medium (500) | 小标题 |
| Body | 18px | 18px | Regular (400) | 正文内容 |
| Caption | 14px | 14px | Regular (400) | 说明文字 |
| Overline | 12px | 12px | Bold (700) | 分类标签（大写） |

**特点**：字号对比强烈，标题超大，形成视觉张力

---

## 版式规范

### 画布尺寸
- **宽度**: 1920px
- **高度**: 1080px
- **比例**: 16:9

### 边距系统
```
外边距 (Margin): 100px
内边距 (Padding): 50px
元素间距 (Gap): 40px
```

### 网格系统（核心特征）
- **列数**: 6 列（粗网格，更大胆）
- **列宽**: 270px
- **列间距**: 40px
- **行高**: 基于 8px 基准线

### 网格可视化
```svg
<!-- 调试时显示网格线 -->
<defs>
  <pattern id="swiss-grid" width="310" height="100" patternUnits="userSpaceOnUse">
    <line x1="270" y1="0" x2="270" y2="100" stroke="#E2001A" stroke-width="0.5" opacity="0.2"/>
  </pattern>
</defs>
```

---

## 设计元素

### 大色块
```svg
<!-- 全宽色块标题区 -->
<rect x="0" y="0" width="1920" height="400" fill="#E2001A"/>
<text x="100" y="280" font-family="Helvetica Neue" font-size="96" font-weight="900" fill="#FFFFFF">
  BOLD TITLE
</text>

<!-- 半屏色块 -->
<rect x="0" y="0" width="960" height="1080" fill="#000000"/>
```

### 几何图形
```svg
<!-- 圆形装饰 -->
<circle cx="1600" cy="200" r="150" fill="#E2001A"/>

<!-- 方形装饰 -->
<rect x="100" y="800" width="200" height="200" fill="#000000"/>

<!-- 线条装饰 -->
<line x1="100" y1="500" x2="500" y2="500" stroke="#E2001A" stroke-width="8"/>
```

### 分割布局
```svg
<!-- 左右分割（黑白对比） -->
<rect x="0" y="0" width="960" height="1080" fill="#000000"/>
<rect x="960" y="0" width="960" height="1080" fill="#FFFFFF"/>

<!-- 上下分割 -->
<rect x="0" y="0" width="1920" height="540" fill="#E2001A"/>
<rect x="0" y="540" width="1920" height="540" fill="#FFFFFF"/>
```

### 文字排版特点
```svg
<!-- 大写字母标签 -->
<text font-family="Helvetica Neue" font-size="12" font-weight="700" fill="#808080" letter-spacing="2">
  CATEGORY
</text>

<!-- 超大标题 + 小说明 -->
<text x="100" y="300" font-family="Helvetica Neue" font-size="96" font-weight="900" fill="#000000">
  BIG
</text>
<text x="100" y="340" font-family="PingFang SC" font-size="18" fill="#808080">
  小字说明形成强烈对比
</text>
```

---

## 页面模板

### 封面页（经典瑞士风格）
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <!-- 白色背景 -->
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 红色色块 -->
  <rect x="0" y="0" width="800" height="1080" fill="#E2001A"/>
  
  <!-- 主标题（跨越红白区域） -->
  <text x="100" y="500" font-family="Helvetica Neue" font-size="120" font-weight="900" fill="#FFFFFF">
    DESIGN
  </text>
  <text x="100" y="620" font-family="Helvetica Neue" font-size="120" font-weight="900" fill="#000000">
    SYSTEM
  </text>
  
  <!-- 中文副标题 -->
  <text x="850" y="750" font-family="PingFang SC" font-size="24" fill="#333333">
    设计系统构建指南
  </text>
  
  <!-- 底部信息 -->
  <text x="850" y="980" font-family="Helvetica Neue" font-size="14" font-weight="700" fill="#808080" letter-spacing="2">
    2024 // BRAND GUIDELINES
  </text>
</svg>
```

### 章节页（全屏色块）
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <!-- 全屏红色 -->
  <rect width="1920" height="1080" fill="#E2001A"/>
  
  <!-- 章节编号（超大） -->
  <text x="100" y="400" font-family="Helvetica Neue" font-size="300" font-weight="900" fill="#FFFFFF" opacity="0.2">
    01
  </text>
  
  <!-- 章节标题 -->
  <text x="100" y="600" font-family="Helvetica Neue" font-size="72" font-weight="900" fill="#FFFFFF">
    OVERVIEW
  </text>
  
  <!-- 中文说明 -->
  <text x="100" y="680" font-family="PingFang SC" font-size="24" fill="#FFFFFF" opacity="0.8">
    项目概述与背景介绍
  </text>
</svg>
```

### 内容页（网格布局）
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 页面标题 -->
  <text x="100" y="80" font-family="Helvetica Neue" font-size="14" font-weight="700" fill="#808080" letter-spacing="2">
    SECTION 01
  </text>
  <text x="100" y="150" font-family="Helvetica Neue" font-size="48" font-weight="900" fill="#000000">
    Key Principles
  </text>
  
  <!-- 红色强调线 -->
  <line x1="100" y1="180" x2="400" y2="180" stroke="#E2001A" stroke-width="6"/>
  
  <!-- 内容区域（3列布局） -->
  <g transform="translate(100, 250)">
    <!-- 第一列 -->
    <text font-family="Helvetica Neue" font-size="32" font-weight="700" fill="#000000">01</text>
    <text y="50" font-family="PingFang SC" font-size="20" font-weight="600" fill="#000000">简洁至上</text>
    <text y="90" font-family="PingFang SC" font-size="16" fill="#808080">
      去除一切不必要的装饰
    </text>
  </g>
  
  <g transform="translate(680, 250)">
    <!-- 第二列 -->
    <text font-family="Helvetica Neue" font-size="32" font-weight="700" fill="#000000">02</text>
    <text y="50" font-family="PingFang SC" font-size="20" font-weight="600" fill="#000000">网格系统</text>
    <text y="90" font-family="PingFang SC" font-size="16" fill="#808080">
      严格遵循网格对齐原则
    </text>
  </g>
  
  <g transform="translate(1260, 250)">
    <!-- 第三列 -->
    <text font-family="Helvetica Neue" font-size="32" font-weight="700" fill="#000000">03</text>
    <text y="50" font-family="PingFang SC" font-size="20" font-weight="600" fill="#000000">字体层级</text>
    <text y="90" font-family="PingFang SC" font-size="16" fill="#808080">
      强烈的字号对比产生张力
    </text>
  </g>
</svg>
```

### 反转页（黑底白字）
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <!-- 全屏黑色 -->
  <rect width="1920" height="1080" fill="#000000"/>
  
  <!-- 白色标题 -->
  <text x="100" y="500" font-family="Helvetica Neue" font-size="80" font-weight="900" fill="#FFFFFF">
    THINK DIFFERENT
  </text>
  
  <!-- 红色装饰圆 -->
  <circle cx="1700" cy="540" r="200" fill="#E2001A"/>
</svg>
```

---

## 注意事项

1. **网格严格对齐**：所有元素必须贴合网格线，这是瑞士风格的核心
2. **字号对比强烈**：标题与正文的字号比例至少 3:1
3. **色彩极度克制**：单页最多使用 2-3 种颜色
4. **大面积色块**：不要害怕使用全屏或半屏色块
5. **留白即设计**：空白区域是有意为之的设计元素
6. **大写字母**：英文标签和分类使用全大写 + letter-spacing
7. **无渐变无阴影**：纯平面设计，拒绝立体效果
8. **无圆角**：瑞士风格使用直角，体现硬朗感
