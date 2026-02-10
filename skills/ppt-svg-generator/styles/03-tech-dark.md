# 风格 03：科技暗黑 (Tech Dark)

## 风格概述

| 属性 | 值 |
|------|-----|
| 风格名称 | 科技暗黑 / Tech Dark |
| 设计理念 | 赛博朋克美学，科技感与神秘感并存 |
| 适用场景 | 技术分享、产品Demo、黑客松、开发者大会 |
| 情绪基调 | 科技、前卫、酷炫、未来感 |

---

## 配色方案

### 主色板

| 角色 | 颜色名称 | Hex | RGB | 使用场景 |
|------|----------|-----|-----|----------|
| 背景色 | 深邃黑 | `#0D0D0D` | rgb(13,13,13) | 页面背景 |
| 次背景 | 暗灰 | `#1A1A2E` | rgb(26,26,46) | 卡片背景、代码块 |
| 主强调 | 荧光青 | `#00F2FF` | rgb(0,242,255) | 主要强调、图标、数据 |
| 次强调 | 科技紫 | `#8A2BE2` | rgb(138,43,226) | 次要强调、渐变 |
| 辅助色 | 霓虹粉 | `#FF00FF` | rgb(255,0,255) | 特殊强调（少量） |
| 主文字 | 纯白 | `#FFFFFF` | rgb(255,255,255) | 标题、重要文字 |
| 次文字 | 浅灰 | `#B0B0B0` | rgb(176,176,176) | 正文、说明 |
| 暗文字 | 深灰 | `#666666` | rgb(102,102,102) | 辅助信息、标签 |

### 渐变方案

```css
/* 主渐变：青紫渐变 */
background: linear-gradient(135deg, #00F2FF 0%, #8A2BE2 100%);

/* 背景微渐变 */
background: linear-gradient(180deg, #0D0D0D 0%, #1A1A2E 100%);

/* 霓虹渐变（少量使用） */
background: linear-gradient(90deg, #00F2FF 0%, #FF00FF 100%);
```

### 色彩使用规则

```
背景：深邃黑 #0D0D0D 为主
文字：纯白 #FFFFFF 标题，浅灰 #B0B0B0 正文
强调：荧光青 #00F2FF 为主强调色，面积 15-20%
次强调：科技紫 #8A2BE2 用于渐变和次要元素
霓虹粉：#FF00FF 仅用于极少数特殊强调
发光效果：使用 filter 或 opacity 模拟发光
```

---

## 字体配置

### 中文字体栈
```
font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

### 英文/代码字体栈
```
/* 标题 */
font-family: "SF Pro Display", "Helvetica Neue", Arial, sans-serif;

/* 代码 */
font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
```

### 字号规范

| 层级 | 中文 | 英文 | 字重 | 用途 |
|------|------|------|------|------|
| H1 | 52px | 60px | Bold (700) | 封面标题 |
| H2 | 36px | 42px | Bold (700) | 章节标题 |
| H3 | 28px | 32px | SemiBold (600) | 页面标题 |
| H4 | 20px | 22px | Medium (500) | 小标题 |
| Body | 16px | 16px | Regular (400) | 正文内容 |
| Code | 14px | 14px | Regular (400) | 代码文本 |
| Caption | 12px | 12px | Regular (400) | 说明文字 |

---

## 版式规范

### 画布尺寸
- **宽度**: 1920px
- **高度**: 1080px
- **比例**: 16:9

### 边距系统
```
外边距 (Margin): 80px
内边距 (Padding): 40px
元素间距 (Gap): 32px
```

### 网格系统
- **列数**: 12 列
- **列宽**: 120px
- **列间距**: 24px

---

## 设计元素

### 发光效果（SVG 实现）
```svg
<defs>
  <!-- 青色发光 -->
  <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
    <feMerge>
      <feMergeNode in="coloredBlur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
  
  <!-- 紫色发光 -->
  <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
    <feMerge>
      <feMergeNode in="coloredBlur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>

<!-- 使用发光效果 -->
<text filter="url(#glow-cyan)" fill="#00F2FF">发光文字</text>
```

### 霓虹边框
```svg
<!-- 霓虹边框卡片 -->
<rect x="80" y="200" width="500" height="300" 
      fill="#1A1A2E" 
      stroke="#00F2FF" 
      stroke-width="2"/>
```

### 渐变边框（高级效果）
```svg
<defs>
  <linearGradient id="gradient-border" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#00F2FF"/>
    <stop offset="100%" stop-color="#8A2BE2"/>
  </linearGradient>
</defs>

<rect x="80" y="200" width="500" height="300" 
      fill="#1A1A2E" 
      stroke="url(#gradient-border)" 
      stroke-width="2"/>
```

### 网格背景
```svg
<defs>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1A1A2E" stroke-width="1"/>
  </pattern>
</defs>

<rect width="1920" height="1080" fill="#0D0D0D"/>
<rect width="1920" height="1080" fill="url(#grid)" opacity="0.5"/>
```

### 代码块
```svg
<!-- 代码块背景 -->
<rect x="80" y="300" width="800" height="400" fill="#1A1A2E" rx="0" ry="0"/>

<!-- 代码文本 -->
<text x="100" y="340" font-family="JetBrains Mono" font-size="14" fill="#B0B0B0">
  <tspan fill="#8A2BE2">const</tspan>
  <tspan fill="#FFFFFF"> result </tspan>
  <tspan fill="#B0B0B0">=</tspan>
  <tspan fill="#00F2FF"> await</tspan>
  <tspan fill="#FFFFFF"> fetch</tspan>
  <tspan fill="#B0B0B0">(</tspan>
  <tspan fill="#00F2FF">url</tspan>
  <tspan fill="#B0B0B0">);</tspan>
</text>
```

---

## 页面模板

### 封面页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <linearGradient id="title-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00F2FF"/>
      <stop offset="100%" stop-color="#8A2BE2"/>
    </linearGradient>
  </defs>
  
  <!-- 深色背景 -->
  <rect width="1920" height="1080" fill="#0D0D0D"/>
  
  <!-- 装饰线条 -->
  <line x1="0" y1="400" x2="400" y2="400" stroke="#00F2FF" stroke-width="1" opacity="0.5"/>
  <line x1="1520" y1="680" x2="1920" y2="680" stroke="#8A2BE2" stroke-width="1" opacity="0.5"/>
  
  <!-- 主标题（发光效果） -->
  <text x="80" y="480" font-family="SF Pro Display" font-size="60" font-weight="700" 
        fill="url(#title-gradient)" filter="url(#glow)">
    TECH KEYNOTE
  </text>
  
  <!-- 中文副标题 -->
  <text x="80" y="550" font-family="PingFang SC" font-size="28" fill="#B0B0B0">
    下一代技术架构深度解析
  </text>
  
  <!-- 装饰元素 -->
  <circle cx="1700" cy="300" r="100" fill="none" stroke="#00F2FF" stroke-width="1" opacity="0.3"/>
  <circle cx="1700" cy="300" r="60" fill="none" stroke="#8A2BE2" stroke-width="1" opacity="0.5"/>
  
  <!-- 底部信息 -->
  <text x="80" y="980" font-family="SF Mono" font-size="14" fill="#666666">
    SPEAKER NAME // 2024.03.15
  </text>
</svg>
```

### 技术架构页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="card-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00F2FF" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#8A2BE2" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  
  <rect width="1920" height="1080" fill="#0D0D0D"/>
  
  <!-- 页面标题 -->
  <text x="80" y="80" font-family="PingFang SC" font-size="28" font-weight="600" fill="#FFFFFF">
    系统架构
  </text>
  <line x1="80" y1="100" x2="250" y2="100" stroke="#00F2FF" stroke-width="2"/>
  
  <!-- 架构卡片 -->
  <g transform="translate(80, 150)">
    <rect width="400" height="250" fill="#1A1A2E" stroke="#00F2FF" stroke-width="1"/>
    <text x="20" y="40" font-family="PingFang SC" font-size="18" font-weight="600" fill="#00F2FF">
      前端层
    </text>
    <text x="20" y="80" font-family="PingFang SC" font-size="14" fill="#B0B0B0">
      React + TypeScript
    </text>
  </g>
  
  <g transform="translate(520, 150)">
    <rect width="400" height="250" fill="#1A1A2E" stroke="#8A2BE2" stroke-width="1"/>
    <text x="20" y="40" font-family="PingFang SC" font-size="18" font-weight="600" fill="#8A2BE2">
      服务层
    </text>
    <text x="20" y="80" font-family="PingFang SC" font-size="14" fill="#B0B0B0">
      Node.js + GraphQL
    </text>
  </g>
  
  <!-- 连接线 -->
  <line x1="480" y1="275" x2="520" y2="275" stroke="#00F2FF" stroke-width="2" stroke-dasharray="5,5"/>
</svg>
```

### 代码展示页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#0D0D0D"/>
  
  <!-- 页面标题 -->
  <text x="80" y="80" font-family="PingFang SC" font-size="28" font-weight="600" fill="#FFFFFF">
    核心代码实现
  </text>
  
  <!-- 代码块 -->
  <rect x="80" y="120" width="1200" height="500" fill="#1A1A2E"/>
  
  <!-- 代码窗口控制点 -->
  <circle cx="110" cy="145" r="6" fill="#FF5F56"/>
  <circle cx="135" cy="145" r="6" fill="#FFBD2E"/>
  <circle cx="160" cy="145" r="6" fill="#27CA40"/>
  
  <!-- 代码内容 -->
  <text y="200" font-family="JetBrains Mono" font-size="16">
    <tspan x="100" fill="#8A2BE2">async function</tspan>
    <tspan fill="#FFFFFF"> processData</tspan>
    <tspan fill="#B0B0B0">(</tspan>
    <tspan fill="#00F2FF">input</tspan>
    <tspan fill="#B0B0B0">) {</tspan>
  </text>
  <text y="230" font-family="JetBrains Mono" font-size="16">
    <tspan x="120" fill="#8A2BE2">const</tspan>
    <tspan fill="#FFFFFF"> result</tspan>
    <tspan fill="#B0B0B0"> = </tspan>
    <tspan fill="#8A2BE2">await</tspan>
    <tspan fill="#FFFFFF"> transform</tspan>
    <tspan fill="#B0B0B0">(</tspan>
    <tspan fill="#00F2FF">input</tspan>
    <tspan fill="#B0B0B0">);</tspan>
  </text>
  <text y="260" font-family="JetBrains Mono" font-size="16">
    <tspan x="120" fill="#8A2BE2">return</tspan>
    <tspan fill="#FFFFFF"> result</tspan>
    <tspan fill="#B0B0B0">;</tspan>
  </text>
  <text y="290" font-family="JetBrains Mono" font-size="16">
    <tspan x="100" fill="#B0B0B0">}</tspan>
  </text>
  
  <!-- 右侧说明 -->
  <text x="1350" y="200" font-family="PingFang SC" font-size="16" fill="#B0B0B0">
    关键点说明：
  </text>
  <text x="1350" y="240" font-family="PingFang SC" font-size="14" fill="#666666">
    • 异步处理优化性能
  </text>
  <text x="1350" y="270" font-family="PingFang SC" font-size="14" fill="#666666">
    • 类型安全保证
  </text>
</svg>
```

---

## 注意事项

1. **对比度保证**：深色背景下文字必须清晰可读，白色/浅灰为主
2. **发光效果适度**：filter 发光效果不要过度，避免视觉疲劳
3. **霓虹色慎用**：荧光色面积控制在 20% 以内
4. **代码高亮**：技术内容使用语法高亮，提升专业感
5. **渐变协调**：青紫渐变为主，避免使用过多颜色
6. **留黑空间**：深色背景下适当留黑，增加层次感
