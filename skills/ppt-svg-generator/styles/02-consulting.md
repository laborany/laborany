# 风格 02：商务咨询 (Business Consulting)

## 风格概述

| 属性 | 值 |
|------|-----|
| 风格名称 | 商务咨询 / Business Consulting |
| 设计理念 | 专业可信，数据驱动，麦肯锡风格 |
| 适用场景 | 战略汇报、咨询报告、投资路演、董事会演示 |
| 情绪基调 | 专业、权威、严谨、可信赖 |

---

## 配色方案

### 主色板

| 角色 | 颜色名称 | Hex | RGB | 使用场景 |
|------|----------|-----|-----|----------|
| 主色 | 海军蓝 | `#003366` | rgb(0,51,102) | 标题、图表主色、重要元素 |
| 背景色 | 纯白 | `#FFFFFF` | rgb(255,255,255) | 页面背景 |
| 次背景 | 浅蓝灰 | `#F0F4F8` | rgb(240,244,248) | 卡片背景、图表区域 |
| 辅助色 | 浅蓝 | `#ADD8E6` | rgb(173,216,230) | 图表填充、次要元素 |
| 强调色 | 警示橙 | `#FF8C00` | rgb(255,140,0) | 关键数据、行动号召 |
| 主文字 | 深灰 | `#2C3E50` | rgb(44,62,80) | 正文内容 |
| 次文字 | 中灰 | `#7F8C8D` | rgb(127,140,141) | 说明文字、标签 |

### 辅助色板（图表专用）

| 序号 | Hex | 用途 |
|------|-----|------|
| 1 | `#003366` | 主数据系列 |
| 2 | `#005A9E` | 次数据系列 |
| 3 | `#ADD8E6` | 第三数据系列 |
| 4 | `#FF8C00` | 突出数据 |
| 5 | `#95A5A6` | 基准/对比数据 |

### 色彩使用规则

```
背景：纯白 #FFFFFF 为主，浅蓝灰 #F0F4F8 用于卡片
主色调：海军蓝 #003366 占视觉 60%
辅助色：浅蓝 #ADD8E6 占视觉 25%
强调色：警示橙 #FF8C00 仅用于最重要数据，面积 < 10%
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
| H1 | 44px | 48px | Bold (700) | 封面标题 |
| H2 | 32px | 36px | Bold (700) | 章节标题 |
| H3 | 26px | 28px | SemiBold (600) | 页面标题 |
| H4 | 20px | 22px | SemiBold (600) | 小标题/图表标题 |
| Body | 16px | 16px | Regular (400) | 正文内容 |
| Caption | 12px | 12px | Regular (400) | 图表标签、脚注 |
| Data | 36px | 40px | Bold (700) | 大数字展示 |

---

## 版式规范

### 画布尺寸
- **宽度**: 1920px
- **高度**: 1080px
- **比例**: 16:9

### 边距系统
```
外边距 (Margin): 60px
内边距 (Padding): 32px
元素间距 (Gap): 20px
```

### 网格系统
- **列数**: 12 列
- **列宽**: 130px
- **列间距**: 20px

---

## 设计元素

### 标题装饰
```svg
<!-- 页面标题左侧色块 -->
<rect x="60" y="50" width="6" height="36" fill="#003366"/>
<text x="80" y="80" font-family="PingFang SC" font-size="26" font-weight="600" fill="#2C3E50">
  页面标题
</text>
```

### 信息卡片
```svg
<!-- 数据卡片 -->
<rect x="60" y="150" width="400" height="200" fill="#F0F4F8" rx="0" ry="0"/>
<text x="80" y="200" font-family="SF Pro Display" font-size="40" font-weight="700" fill="#003366">
  $2.5M
</text>
<text x="80" y="240" font-family="PingFang SC" font-size="16" fill="#7F8C8D">
  年度营收增长
</text>
```

### 分隔线
```svg
<!-- 区域分隔线 -->
<line x1="60" y1="400" x2="1860" y2="400" stroke="#E1E8ED" stroke-width="1"/>
```

### 关键指标高亮
```svg
<!-- 橙色强调框 -->
<rect x="100" y="300" width="300" height="80" fill="none" stroke="#FF8C00" stroke-width="3"/>
<text x="120" y="355" font-family="SF Pro Display" font-size="36" font-weight="700" fill="#FF8C00">
  +127%
</text>
```

---

## 图表规范

### 柱状图配色
```svg
<!-- 主系列 -->
<rect fill="#003366"/>
<!-- 次系列 -->
<rect fill="#005A9E"/>
<!-- 对比系列 -->
<rect fill="#ADD8E6"/>
<!-- 突出数据 -->
<rect fill="#FF8C00"/>
```

### 折线图配色
```svg
<!-- 主线条 -->
<path stroke="#003366" stroke-width="3" fill="none"/>
<!-- 次线条 -->
<path stroke="#ADD8E6" stroke-width="2" fill="none"/>
<!-- 强调线条 -->
<path stroke="#FF8C00" stroke-width="3" fill="none"/>
```

### 饼图/环形图配色
```svg
<!-- 按顺序使用：#003366, #005A9E, #ADD8E6, #FF8C00, #95A5A6 -->
```

---

## 页面模板

### 封面页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <!-- 白色背景 -->
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 顶部深蓝色条 -->
  <rect x="0" y="0" width="1920" height="8" fill="#003366"/>
  
  <!-- 主标题 -->
  <text x="60" y="450" font-family="PingFang SC" font-size="44" font-weight="700" fill="#003366">
    战略规划报告
  </text>
  
  <!-- 副标题 -->
  <text x="60" y="510" font-family="PingFang SC" font-size="22" fill="#7F8C8D">
    2024 年度业务发展战略与执行路径
  </text>
  
  <!-- 分隔线 -->
  <line x1="60" y1="540" x2="600" y2="540" stroke="#003366" stroke-width="2"/>
  
  <!-- 公司/日期信息 -->
  <text x="60" y="980" font-family="PingFang SC" font-size="14" fill="#7F8C8D">
    咨询公司名称 | 2024年3月
  </text>
  
  <!-- 右下角装饰 -->
  <rect x="1800" y="960" width="60" height="60" fill="#003366"/>
</svg>
```

### 执行摘要页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 标题区 -->
  <rect x="60" y="50" width="6" height="36" fill="#003366"/>
  <text x="80" y="80" font-family="PingFang SC" font-size="26" font-weight="600" fill="#2C3E50">
    执行摘要
  </text>
  
  <!-- 三栏关键指标 -->
  <g transform="translate(60, 140)">
    <!-- 指标1 -->
    <rect width="560" height="160" fill="#F0F4F8"/>
    <text x="30" y="60" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#003366">$12.5M</text>
    <text x="30" y="100" font-family="PingFang SC" font-size="16" fill="#7F8C8D">预期年度营收</text>
    <text x="30" y="130" font-family="PingFang SC" font-size="14" fill="#FF8C00">↑ 23% YoY</text>
  </g>
  
  <g transform="translate(640, 140)">
    <!-- 指标2 -->
    <rect width="560" height="160" fill="#F0F4F8"/>
    <text x="30" y="60" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#003366">89%</text>
    <text x="30" y="100" font-family="PingFang SC" font-size="16" fill="#7F8C8D">客户满意度</text>
    <text x="30" y="130" font-family="PingFang SC" font-size="14" fill="#FF8C00">↑ 12pts</text>
  </g>
  
  <g transform="translate(1220, 140)">
    <!-- 指标3 -->
    <rect width="560" height="160" fill="#F0F4F8"/>
    <text x="30" y="60" font-family="SF Pro Display" font-size="48" font-weight="700" fill="#003366">156</text>
    <text x="30" y="100" font-family="PingFang SC" font-size="16" fill="#7F8C8D">新增企业客户</text>
    <text x="30" y="130" font-family="PingFang SC" font-size="14" fill="#FF8C00">↑ 45%</text>
  </g>
</svg>
```

### 数据分析页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 标题区 -->
  <rect x="60" y="50" width="6" height="36" fill="#003366"/>
  <text x="80" y="80" font-family="PingFang SC" font-size="26" font-weight="600" fill="#2C3E50">
    市场分析：竞争格局
  </text>
  
  <!-- 左侧图表区域 -->
  <rect x="60" y="120" width="900" height="500" fill="#F0F4F8"/>
  <text x="80" y="160" font-family="PingFang SC" font-size="18" font-weight="600" fill="#2C3E50">
    市场份额分布
  </text>
  
  <!-- 右侧要点区域 -->
  <text x="1000" y="160" font-family="PingFang SC" font-size="18" font-weight="600" fill="#2C3E50">
    关键发现
  </text>
  
  <!-- 要点列表 -->
  <g transform="translate(1000, 190)">
    <rect width="8" height="8" fill="#003366"/>
    <text x="20" y="8" font-family="PingFang SC" font-size="16" fill="#2C3E50">市场领导者占据 45% 份额</text>
  </g>
</svg>
```

---

## 注意事项

1. **数据优先**：每页必须有明确的数据支撑或关键信息
2. **层级分明**：使用色块、边框区分信息层级
3. **专业配色**：严格使用海军蓝色系，避免花哨
4. **图表清晰**：图表必须有标题、单位、数据来源
5. **留白适度**：信息密度可以较高，但需有呼吸空间
6. **橙色慎用**：仅用于最重要的数据点或行动号召
