# 风格 05：品牌蓝 (Brand Blue)

## 风格概述

| 属性 | 值 |
|------|-----|
| 风格名称 | 品牌蓝 / Brand Blue |
| 设计理念 | 公司品牌视觉延续，专业统一，易于识别 |
| 适用场景 | 公司内部汇报、对外宣传、正式场合、客户提案 |
| 情绪基调 | 专业、可信、现代、品牌一致性 |

---

## 配色方案

### 主色板（公司品牌色）

| 角色 | 颜色名称 | Hex | RGB | 使用场景 |
|------|----------|-----|-----|----------|
| 主色 | 品牌蓝 | `#016BFF` | rgb(1,107,255) | 主要强调、标题、图标 |
| 次色 | 紫蓝 | `#565BFF` | rgb(86,91,255) | 次要元素、渐变组合 |
| 辅助色 | 青蓝 | `#2ECCF7` | rgb(46,204,247) | 点缀、图表辅助色 |
| 背景色 | 浅灰 | `#F6F6F6` | rgb(246,246,246) | 页面背景、卡片底 |
| 纯白 | 白色 | `#FFFFFF` | rgb(255,255,255) | 内容区背景 |
| 主文字 | 纯黑 | `#000000` | rgb(0,0,0) | 标题、正文 |
| 次文字 | 深灰 | `#333333` | rgb(51,51,51) | 副标题 |
| 辅助文字 | 中灰 | `#666666` | rgb(102,102,102) | 说明文字 |

### 品牌渐变

```css
/* 主渐变：品牌蓝 → 紫蓝 */
background: linear-gradient(135deg, #016BFF 0%, #565BFF 100%);

/* 辅助渐变：品牌蓝 → 青蓝 */
background: linear-gradient(90deg, #016BFF 0%, #2ECCF7 100%);

/* 浅色渐变背景 */
background: linear-gradient(180deg, #FFFFFF 0%, #F6F6F6 100%);
```

### 色彩使用规则

```
背景：浅灰 #F6F6F6 或 纯白 #FFFFFF
主强调：品牌蓝 #016BFF 用于标题、按钮、关键元素
次强调：紫蓝 #565BFF 用于渐变、次要强调
点缀：青蓝 #2ECCF7 用于图标、数据图表
比例：品牌蓝 60% / 紫蓝 25% / 青蓝 15%
```

---

## 字体配置

### 中文字体栈
```
font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

### 英文/数字字体栈
```
font-family: "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
```

### 字号规范

| 层级 | 中文 | 英文 | 字重 | 用途 |
|------|------|------|------|------|
| H1 | 48px | 52px | Bold (700) | 封面标题 |
| H2 | 36px | 40px | Bold (700) | 章节标题 |
| H3 | 28px | 30px | SemiBold (600) | 页面标题 |
| H4 | 20px | 22px | SemiBold (600) | 小标题 |
| Body | 16px | 16px | Regular (400) | 正文内容 |
| Caption | 14px | 14px | Regular (400) | 说明文字 |
| Data | 40px | 44px | Bold (700) | 大数字展示 |

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
元素间距 (Gap): 24px
```

### 网格系统
- **列数**: 12 列
- **列宽**: 120px
- **列间距**: 24px

---

## 设计元素

### 渐变标题条
```svg
<defs>
  <linearGradient id="brand-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#016BFF"/>
    <stop offset="100%" stop-color="#565BFF"/>
  </linearGradient>
</defs>

<!-- 渐变标题背景 -->
<rect x="0" y="0" width="1920" height="120" fill="url(#brand-gradient)"/>
<text x="80" y="75" font-family="PingFang SC" font-size="28" font-weight="600" fill="#FFFFFF">
  页面标题
</text>
```

### 品牌色卡片
```svg
<!-- 白底卡片 + 品牌蓝边框 -->
<rect x="80" y="200" width="500" height="300" fill="#FFFFFF" stroke="#016BFF" stroke-width="2"/>

<!-- 品牌蓝底卡片 -->
<rect x="80" y="200" width="500" height="300" fill="#016BFF"/>
<text x="100" y="280" font-family="PingFang SC" font-size="20" fill="#FFFFFF">
  白色文字内容
</text>
```

### 数据指标卡
```svg
<g transform="translate(80, 200)">
  <!-- 卡片背景 -->
  <rect width="350" height="180" fill="#FFFFFF" rx="0" ry="0"/>
  
  <!-- 顶部色条 -->
  <rect width="350" height="4" fill="#016BFF"/>
  
  <!-- 数字 -->
  <text x="30" y="80" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#016BFF">
    2,845
  </text>
  
  <!-- 标签 -->
  <text x="30" y="120" font-family="PingFang SC" font-size="16" fill="#666666">
    本月活跃用户
  </text>
  
  <!-- 增长指标 -->
  <text x="30" y="150" font-family="PingFang SC" font-size="14" fill="#2ECCF7">
    ↑ 12.5% 环比增长
  </text>
</g>
```

### 图标风格
```svg
<!-- 品牌色图标（线性风格） -->
<circle cx="50" cy="50" r="40" fill="none" stroke="#016BFF" stroke-width="2"/>
<path d="M35 50 L45 60 L65 40" fill="none" stroke="#016BFF" stroke-width="2"/>

<!-- 渐变填充图标 -->
<defs>
  <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#016BFF"/>
    <stop offset="100%" stop-color="#2ECCF7"/>
  </linearGradient>
</defs>
<circle cx="50" cy="50" r="40" fill="url(#icon-gradient)"/>
```

---

## 图表规范

### 图表配色顺序

| 序号 | Hex | 用途 |
|------|-----|------|
| 1 | `#016BFF` | 主数据系列 |
| 2 | `#565BFF` | 次数据系列 |
| 3 | `#2ECCF7` | 第三数据系列 |
| 4 | `#A5D8FF` | 第四数据系列（品牌蓝浅色） |
| 5 | `#C4B5FD` | 第五数据系列（紫蓝浅色） |
| 对比 | `#E5E5E5` | 基准/对比数据 |

### 柱状图
```svg
<!-- 品牌蓝柱 -->
<rect fill="#016BFF"/>
<!-- 紫蓝柱 -->
<rect fill="#565BFF"/>
<!-- 青蓝柱 -->
<rect fill="#2ECCF7"/>
```

### 折线图
```svg
<path stroke="#016BFF" stroke-width="3" fill="none"/>
<path stroke="#565BFF" stroke-width="2" fill="none"/>
<path stroke="#2ECCF7" stroke-width="2" fill="none"/>
```

---

## 页面模板

### 封面页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cover-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#016BFF"/>
      <stop offset="100%" stop-color="#565BFF"/>
    </linearGradient>
  </defs>
  
  <!-- 渐变背景 -->
  <rect width="1920" height="1080" fill="url(#cover-gradient)"/>
  
  <!-- 装饰圆形 -->
  <circle cx="1600" cy="300" r="200" fill="#2ECCF7" opacity="0.2"/>
  <circle cx="1700" cy="800" r="150" fill="#FFFFFF" opacity="0.1"/>
  
  <!-- 公司 Logo 占位区 -->
  <rect x="80" y="80" width="200" height="60" fill="#FFFFFF" opacity="0.2"/>
  <text x="100" y="120" font-family="SF Pro Display" font-size="24" font-weight="700" fill="#FFFFFF">
    LOGO
  </text>
  
  <!-- 主标题 -->
  <text x="80" y="480" font-family="PingFang SC" font-size="52" font-weight="700" fill="#FFFFFF">
    年度业务汇报
  </text>
  
  <!-- 副标题 -->
  <text x="80" y="550" font-family="PingFang SC" font-size="24" fill="#FFFFFF" opacity="0.9">
    2024 年第一季度工作总结与下季度规划
  </text>
  
  <!-- 分隔线 -->
  <line x1="80" y1="590" x2="500" y2="590" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
  
  <!-- 底部信息 -->
  <text x="80" y="980" font-family="PingFang SC" font-size="16" fill="#FFFFFF" opacity="0.7">
    汇报人：张三 | 2024年3月15日
  </text>
</svg>
```

### 目录页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <!-- 浅灰背景 -->
  <rect width="1920" height="1080" fill="#F6F6F6"/>
  
  <!-- 左侧品牌色块 -->
  <rect x="0" y="0" width="80" height="1080" fill="#016BFF"/>
  
  <!-- 页面标题 -->
  <text x="160" y="120" font-family="PingFang SC" font-size="36" font-weight="700" fill="#000000">
    目录
  </text>
  <text x="160" y="160" font-family="SF Pro Display" font-size="16" fill="#666666">
    CONTENTS
  </text>
  
  <!-- 目录项 -->
  <g transform="translate(160, 250)">
    <text font-family="SF Pro Display" font-size="48" font-weight="700" fill="#016BFF">01</text>
    <text x="100" y="0" font-family="PingFang SC" font-size="24" font-weight="600" fill="#000000">项目背景</text>
    <line x1="0" y1="30" x2="600" y2="30" stroke="#E5E5E5" stroke-width="1"/>
  </g>
  
  <g transform="translate(160, 350)">
    <text font-family="SF Pro Display" font-size="48" font-weight="700" fill="#565BFF">02</text>
    <text x="100" y="0" font-family="PingFang SC" font-size="24" font-weight="600" fill="#000000">工作成果</text>
    <line x1="0" y1="30" x2="600" y2="30" stroke="#E5E5E5" stroke-width="1"/>
  </g>
  
  <g transform="translate(160, 450)">
    <text font-family="SF Pro Display" font-size="48" font-weight="700" fill="#2ECCF7">03</text>
    <text x="100" y="0" font-family="PingFang SC" font-size="24" font-weight="600" fill="#000000">问题与挑战</text>
    <line x1="0" y1="30" x2="600" y2="30" stroke="#E5E5E5" stroke-width="1"/>
  </g>
  
  <g transform="translate(160, 550)">
    <text font-family="SF Pro Display" font-size="48" font-weight="700" fill="#016BFF">04</text>
    <text x="100" y="0" font-family="PingFang SC" font-size="24" font-weight="600" fill="#000000">下季度计划</text>
    <line x1="0" y1="30" x2="600" y2="30" stroke="#E5E5E5" stroke-width="1"/>
  </g>
</svg>
```

### 数据展示页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="header-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#016BFF"/>
      <stop offset="100%" stop-color="#565BFF"/>
    </linearGradient>
  </defs>
  
  <!-- 背景 -->
  <rect width="1920" height="1080" fill="#F6F6F6"/>
  
  <!-- 顶部渐变条 -->
  <rect x="0" y="0" width="1920" height="100" fill="url(#header-gradient)"/>
  <text x="80" y="62" font-family="PingFang SC" font-size="26" font-weight="600" fill="#FFFFFF">
    核心业务指标
  </text>
  
  <!-- 数据卡片区 -->
  <g transform="translate(80, 150)">
    <!-- 卡片 1 -->
    <rect width="400" height="200" fill="#FFFFFF"/>
    <rect width="400" height="4" fill="#016BFF"/>
    <text x="30" y="80" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#016BFF">¥12.5M</text>
    <text x="30" y="120" font-family="PingFang SC" font-size="16" fill="#666666">季度营收</text>
    <text x="30" y="150" font-family="PingFang SC" font-size="14" fill="#2ECCF7">↑ 23.5% YoY</text>
  </g>
  
  <g transform="translate(520, 150)">
    <!-- 卡片 2 -->
    <rect width="400" height="200" fill="#FFFFFF"/>
    <rect width="400" height="4" fill="#565BFF"/>
    <text x="30" y="80" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#565BFF">1,234</text>
    <text x="30" y="120" font-family="PingFang SC" font-size="16" fill="#666666">新增客户</text>
    <text x="30" y="150" font-family="PingFang SC" font-size="14" fill="#2ECCF7">↑ 18.2% MoM</text>
  </g>
  
  <g transform="translate(960, 150)">
    <!-- 卡片 3 -->
    <rect width="400" height="200" fill="#FFFFFF"/>
    <rect width="400" height="4" fill="#2ECCF7"/>
    <text x="30" y="80" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#2ECCF7">95.8%</text>
    <text x="30" y="120" font-family="PingFang SC" font-size="16" fill="#666666">客户满意度</text>
    <text x="30" y="150" font-family="PingFang SC" font-size="14" fill="#2ECCF7">↑ 2.3pts</text>
  </g>
  
  <g transform="translate(1400, 150)">
    <!-- 卡片 4 -->
    <rect width="400" height="200" fill="#FFFFFF"/>
    <rect width="400" height="4" fill="#016BFF"/>
    <text x="30" y="80" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#016BFF">42</text>
    <text x="30" y="120" font-family="PingFang SC" font-size="16" fill="#666666">项目交付</text>
    <text x="30" y="150" font-family="PingFang SC" font-size="14" fill="#2ECCF7">100% 按期完成</text>
  </g>
</svg>
```

### 结束页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="end-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#016BFF"/>
      <stop offset="50%" stop-color="#565BFF"/>
      <stop offset="100%" stop-color="#2ECCF7"/>
    </linearGradient>
  </defs>
  
  <!-- 渐变背景 -->
  <rect width="1920" height="1080" fill="url(#end-gradient)"/>
  
  <!-- 装饰元素 -->
  <circle cx="200" cy="200" r="100" fill="#FFFFFF" opacity="0.1"/>
  <circle cx="1700" cy="900" r="150" fill="#FFFFFF" opacity="0.1"/>
  
  <!-- 感谢文字 -->
  <text x="960" y="480" font-family="PingFang SC" font-size="64" font-weight="700" fill="#FFFFFF" text-anchor="middle">
    感谢聆听
  </text>
  <text x="960" y="550" font-family="SF Pro Display" font-size="24" fill="#FFFFFF" text-anchor="middle" opacity="0.8">
    THANK YOU
  </text>
  
  <!-- 联系信息 -->
  <text x="960" y="700" font-family="PingFang SC" font-size="18" fill="#FFFFFF" text-anchor="middle" opacity="0.7">
    如有问题，欢迎随时交流
  </text>
  <text x="960" y="740" font-family="SF Pro Display" font-size="16" fill="#FFFFFF" text-anchor="middle" opacity="0.7">
    email@company.com | +86 123 4567 8900
  </text>
</svg>
```

---

## 注意事项

1. **品牌一致性**：严格使用品牌色，不随意添加其他颜色
2. **渐变使用**：品牌蓝→紫蓝渐变用于重要区域，避免过度使用
3. **青蓝点缀**：青蓝 #2ECCF7 仅用于小面积点缀和数据增长指标
4. **白色空间**：保持足够留白，避免信息过载
5. **Logo 位置**：封面左上角、结束页中央保留 Logo 位置
6. **数据突出**：数字使用品牌蓝 + 加粗，快速传达关键信息
7. **正式场合**：整体风格偏向正式专业，避免过于花哨的动效描述
