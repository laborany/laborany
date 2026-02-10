# 风格 01：极简主义 (Minimalism)

## 风格概述

| 属性 | 值 |
|------|-----|
| 风格名称 | 极简主义 / Minimalism |
| 设计理念 | 少即是多，内容为王 |
| 适用场景 | 产品发布、设计提案、创意展示、TED 演讲 |
| 情绪基调 | 克制、精致、专注、高级 |

---

## 配色方案

### 主色板

| 角色 | 颜色名称 | Hex | RGB | 使用场景 |
|------|----------|-----|-----|----------|
| 背景色 | 纯白 | `#FFFFFF` | rgb(255,255,255) | 页面背景 |
| 主文字 | 炭黑 | `#333333` | rgb(51,51,51) | 标题、正文 |
| 次文字 | 中灰 | `#666666` | rgb(102,102,102) | 副标题、说明文字 |
| 强调色 | 克莱因蓝 | `#002FA7` | rgb(0,47,167) | 关键词、图标、装饰线 |
| 辅助色 | 浅灰 | `#F5F5F5` | rgb(245,245,245) | 卡片背景、分隔区域 |

### 色彩使用规则

```
背景：90% 纯白 #FFFFFF
文字：炭黑 #333333 为主，中灰 #666666 为辅
强调：克莱因蓝 #002FA7 仅用于点睛，面积 < 10%
装饰：极少装饰元素，以留白为美
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
| H1 | 48px | 56px | Bold (700) | 封面标题 |
| H2 | 36px | 40px | Bold (700) | 章节标题 |
| H3 | 28px | 32px | SemiBold (600) | 页面标题 |
| H4 | 22px | 24px | Medium (500) | 小标题 |
| Body | 18px | 18px | Regular (400) | 正文内容 |
| Caption | 14px | 14px | Regular (400) | 说明文字 |

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

### 线条
```svg
<!-- 装饰线：细线 + 克莱因蓝 -->
<line x1="80" y1="200" x2="400" y2="200" stroke="#002FA7" stroke-width="2"/>

<!-- 分隔线：浅灰细线 -->
<line x1="80" y1="500" x2="1840" y2="500" stroke="#E5E5E5" stroke-width="1"/>
```

### 形状
```svg
<!-- 强调方块：小尺寸色块标记 -->
<rect x="80" y="180" width="8" height="40" fill="#002FA7"/>

<!-- 背景卡片：微灰底 -->
<rect x="80" y="300" width="800" height="400" fill="#F5F5F5" rx="0" ry="0"/>
<!-- 注意：极简风格不使用圆角 -->
```

### 图标风格
- **线条粗细**: 1.5px - 2px
- **风格**: 线性图标 (Outline)
- **颜色**: 炭黑 #333333 或克莱因蓝 #002FA7

---

## 页面模板

### 封面页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <!-- 纯白背景 -->
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 左侧装饰线 -->
  <rect x="80" y="400" width="4" height="120" fill="#002FA7"/>
  
  <!-- 主标题 -->
  <text x="100" y="480" font-family="PingFang SC" font-size="48" font-weight="700" fill="#333333">
    演示文稿标题
  </text>
  
  <!-- 副标题 -->
  <text x="100" y="540" font-family="PingFang SC" font-size="22" font-weight="400" fill="#666666">
    副标题或说明文字
  </text>
  
  <!-- 底部信息 -->
  <text x="100" y="980" font-family="PingFang SC" font-size="14" fill="#666666">
    演讲者姓名 · 日期
  </text>
</svg>
```

### 章节页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 章节编号 -->
  <text x="80" y="500" font-family="SF Pro Display" font-size="120" font-weight="700" fill="#002FA7" opacity="0.15">
    01
  </text>
  
  <!-- 章节标题 -->
  <text x="80" y="560" font-family="PingFang SC" font-size="36" font-weight="700" fill="#333333">
    章节标题
  </text>
  
  <!-- 章节描述 -->
  <text x="80" y="610" font-family="PingFang SC" font-size="18" fill="#666666">
    本章节主要讨论的内容概述
  </text>
</svg>
```

### 内容页
```svg
<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#FFFFFF"/>
  
  <!-- 页面标题 -->
  <text x="80" y="120" font-family="PingFang SC" font-size="28" font-weight="600" fill="#333333">
    页面标题
  </text>
  
  <!-- 标题下划线 -->
  <line x1="80" y1="140" x2="300" y2="140" stroke="#002FA7" stroke-width="2"/>
  
  <!-- 内容区域 - 留白为主 -->
  <!-- 正文内容根据实际需求填充 -->
</svg>
```

---

## 注意事项

1. **留白是设计语言**：页面空白面积应 > 40%
2. **克制使用强调色**：克莱因蓝仅用于最重要的元素
3. **对齐严谨**：所有元素必须严格网格对齐
4. **无多余装饰**：不使用渐变、阴影、纹理
5. **字体层级清晰**：最多使用 3 种字号层级
