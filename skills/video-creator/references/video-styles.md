# 视频风格指南

## 视频类型与风格

### 1. 产品演示 / 教程

**特点**：
- 清晰的步骤展示
- 重点高亮
- 适度的动画节奏

**推荐风格**：
- 配色：品牌色 + 中性背景
- 动画：平滑过渡，无弹跳
- 节奏：每步 3-5 秒

**示例结构**：
```
开场 (3s) → 问题展示 (5s) → 解决方案 (10s) → 步骤演示 (30s) → 总结 (5s)
```

---

### 2. 数据可视化

**特点**：
- 数据驱动
- 渐进式揭示
- 强调对比

**推荐风格**：
- 配色：数据区分色（蓝、绿、橙）
- 动画：交错入场，数字滚动
- 节奏：数据点 1-2 秒

**示例结构**：
```
标题 (2s) → 背景介绍 (5s) → 数据展示 (15s) → 关键洞察 (5s) → 结论 (3s)
```

---

### 3. 营销宣传 / 社交媒体

**特点**：
- 吸引眼球
- 快节奏
- 强烈视觉冲击

**推荐风格**：
- 配色：高对比度，品牌色
- 动画：弹跳、缩放、快速切换
- 节奏：每镜头 1-3 秒

**示例结构**：
```
Hook (2s) → 痛点 (3s) → 解决方案 (5s) → 特性展示 (10s) → CTA (3s)
```

---

### 4. 原理解释 / 科普内容

**特点**：
- 逻辑清晰
- 循序渐进
- 适当类比

**推荐风格**：
- 配色：学术风（蓝、灰、白）
- 动画：平滑、有序
- 节奏：概念 5-10 秒

**示例结构**：
```
引入问题 (5s) → 基础概念 (15s) → 核心原理 (20s) → 应用示例 (10s) → 总结 (5s)
```

---

## 视觉风格预设

### 极简现代 (Minimal)

```tsx
const minimalTheme = {
  background: '#ffffff',
  text: '#1a1a1a',
  accent: '#0066ff',
  fontFamily: 'Inter, sans-serif',
  animation: { damping: 200 },  // 平滑无弹跳
};
```

### 科技感 (Tech)

```tsx
const techTheme = {
  background: '#0a0a0a',
  text: '#ffffff',
  accent: '#00ff88',
  fontFamily: 'JetBrains Mono, monospace',
  animation: { damping: 20, stiffness: 200 },  // 快速响应
};
```

### 商务专业 (Corporate)

```tsx
const corporateTheme = {
  background: '#f5f5f5',
  text: '#333333',
  accent: '#0052cc',
  fontFamily: 'Roboto, sans-serif',
  animation: { damping: 200 },
};
```

### 活泼多彩 (Playful)

```tsx
const playfulTheme = {
  background: '#fff8e1',
  text: '#333333',
  accent: '#ff6b6b',
  fontFamily: 'Poppins, sans-serif',
  animation: { damping: 8 },  // 弹跳效果
};
```

---

## 分辨率与帧率

### 常用分辨率

| 平台 | 分辨率 | 宽高比 |
|------|--------|--------|
| YouTube 横屏 | 1920×1080 | 16:9 |
| YouTube 竖屏 | 1080×1920 | 9:16 |
| Instagram Reels | 1080×1920 | 9:16 |
| Instagram 方形 | 1080×1080 | 1:1 |
| TikTok | 1080×1920 | 9:16 |
| Twitter | 1280×720 | 16:9 |

### 帧率选择

| 帧率 | 适用场景 |
|------|----------|
| 24 fps | 电影感、叙事内容 |
| 30 fps | 通用、教程、演示 |
| 60 fps | 流畅动画、游戏内容 |

---

## 时长建议

| 平台 | 推荐时长 | 最大时长 |
|------|----------|----------|
| TikTok | 15-60s | 10min |
| Instagram Reels | 15-30s | 90s |
| YouTube Shorts | 30-60s | 60s |
| YouTube 长视频 | 5-15min | 无限制 |
| Twitter | 15-45s | 2min 20s |

---

## 动画节奏指南

### 入场动画

```tsx
// 标题入场：0.5-1 秒
const titleEntrance = spring({
  frame,
  fps,
  durationInFrames: 0.5 * fps,
  config: { damping: 200 },
});

// 内容入场：交错 0.1-0.2 秒
const STAGGER = 0.1 * fps;
items.map((item, i) => spring({
  frame,
  fps,
  delay: i * STAGGER,
}));
```

### 停留时间

- 标题：2-3 秒
- 要点：3-5 秒
- 复杂图表：5-10 秒
- 代码片段：5-8 秒

### 退场动画

```tsx
// 退场通常比入场快
const exit = spring({
  frame,
  fps,
  delay: exitStartFrame,
  durationInFrames: 0.3 * fps,
  config: { damping: 200 },
});
```

---

## 配色原则

### 对比度

- 文字与背景对比度 ≥ 4.5:1
- 重要元素使用高饱和度强调色
- 次要元素使用低饱和度

### 色彩数量

- 主色：1 个
- 强调色：1-2 个
- 中性色：2-3 个

### 数据可视化配色

```tsx
const dataColors = [
  '#4285f4',  // 蓝
  '#34a853',  // 绿
  '#fbbc04',  // 黄
  '#ea4335',  // 红
  '#9334e6',  // 紫
];
```
