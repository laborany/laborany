---
name: 前端设计师
description: |
  创建独特、高品质的前端界面，避免千篇一律的 AI 风格。
  触发场景:
  (1) 用户需要创建网页、HTML 页面
  (2) 用户需要设计 UI 界面、组件
  (3) 用户询问"帮我做个网页"、"设计界面"、"前端开发"
  (4) 其他 skill 生成 HTML 输出时自动应用
  设计原则: 避免 AI 味、追求独特性、注重细节、强调品味
icon: 🎨
category: 设计
---

# 前端设计师

## 核心理念

**避免 AI 味，追求独特性。**

AI 生成的界面往往有明显的"AI 味"：过度使用渐变、圆角过大、配色单调、布局雷同。
本 skill 的目标是打破这种模式，创造有品味、有个性的设计。

## 设计原则

### 1. 拒绝模板化

```
❌ 避免                          ✅ 追求
─────────────────────────────────────────────────
蓝紫渐变背景                     单色或微妙的色彩变化
超大圆角 (20px+)                 精确的圆角 (4-8px)
居中对称布局                     不对称、有张力的布局
通用图标库                       定制图形或无图标
"现代感"卡片堆叠                 有层次的信息架构
```

### 2. 色彩哲学

```css
/* ═══════════════════════════════════════════════════════════════
 * 色彩不是装饰，是信息
 * ═══════════════════════════════════════════════════════════════ */

/* 主色调：克制使用，仅用于关键交互 */
--primary: #1a1a1a;        /* 深色系更显高级 */
--accent: #0066ff;         /* 点缀色，少即是多 */

/* 灰度系统：建立层次感 */
--gray-50: #fafafa;
--gray-100: #f5f5f5;
--gray-200: #e5e5e5;
--gray-300: #d4d4d4;
--gray-400: #a3a3a3;
--gray-500: #737373;
--gray-600: #525252;
--gray-700: #404040;
--gray-800: #262626;
--gray-900: #171717;
```

### 3. 排版法则

```css
/* ═══════════════════════════════════════════════════════════════
 * 排版是设计的骨架
 * ═══════════════════════════════════════════════════════════════ */

/* 字体选择：系统字体优先，避免 Google Fonts 的同质化 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;

/* 中文字体：思源黑体或系统默认 */
font-family: "Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif;

/* 字号系统：基于 4px 网格 */
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;

/* 行高：紧凑但可读 */
line-height: 1.5;          /* 正文 */
line-height: 1.2;          /* 标题 */
```

### 4. 间距系统

```css
/* ═══════════════════════════════════════════════════════════════
 * 间距创造呼吸感
 * ═══════════════════════════════════════════════════════════════ */

/* 基于 4px 的间距系统 */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* 组件内间距：紧凑 */
padding: var(--space-3) var(--space-4);

/* 区块间距：宽松 */
margin-bottom: var(--space-8);
```

### 5. 交互细节

```css
/* ═══════════════════════════════════════════════════════════════
 * 微交互体现品质
 * ═══════════════════════════════════════════════════════════════ */

/* 过渡：快速但不突兀 */
transition: all 0.15s ease;

/* 悬停：微妙的变化 */
.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* 点击：即时反馈 */
.button:active {
  transform: translateY(0);
}

/* 焦点：清晰的视觉指示 */
.input:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent);
}
```

## 布局模式

### 不对称布局

```html
<!-- ═══════════════════════════════════════════════════════════════
     打破居中对称，创造视觉张力
     ═══════════════════════════════════════════════════════════════ -->
<div class="container" style="
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 48px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 64px 24px;
">
  <aside><!-- 窄列：导航或辅助信息 --></aside>
  <main><!-- 宽列：主要内容 --></main>
</div>
```

### 留白艺术

```css
/* 大量留白 = 高级感 */
.hero {
  padding: 120px 0;        /* 不要怕空 */
  max-width: 600px;        /* 限制宽度 */
}

.section {
  margin: 80px 0;          /* 区块间大间距 */
}
```

## 组件示例

### 按钮

```html
<!-- 主按钮：简洁有力 -->
<button style="
  background: #1a1a1a;
  color: white;
  border: none;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
">
  确认
</button>

<!-- 次按钮：轻量化 -->
<button style="
  background: transparent;
  color: #1a1a1a;
  border: 1px solid #e5e5e5;
  padding: 12px 24px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
">
  取消
</button>
```

### 卡片

```html
<!-- 卡片：去除多余装饰 -->
<div style="
  background: white;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 24px;
  /* 不要加阴影，除非悬停 */
">
  <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600;">标题</h3>
  <p style="margin: 0; color: #737373; font-size: 14px;">描述文字</p>
</div>
```

## 检查清单

生成 HTML 前，检查以下要点：

- [ ] 是否避免了渐变背景？
- [ ] 圆角是否控制在 8px 以内？
- [ ] 是否有足够的留白？
- [ ] 配色是否克制（主色不超过 3 种）？
- [ ] 字体大小是否遵循系统？
- [ ] 交互是否有微妙的反馈？
- [ ] 布局是否有层次感？

## 反面教材

```html
<!-- ❌ 典型 AI 味设计 -->
<div style="
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  text-align: center;
">
  <h1 style="color: white; font-size: 48px;">欢迎使用</h1>
  <p style="color: rgba(255,255,255,0.8);">开启您的精彩旅程</p>
  <button style="
    background: white;
    color: #667eea;
    border-radius: 50px;
    padding: 20px 60px;
    font-size: 18px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  ">立即开始</button>
</div>
```

**问题分析：**
1. 渐变背景 → 俗气
2. 超大圆角 → 幼稚
3. 过重阴影 → 浮夸
4. 居中布局 → 无聊
5. 空洞文案 → 无意义
