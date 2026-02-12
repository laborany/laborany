# 微信公众号排版主题

本文件定义了公众号文章的排版主题。每套主题包含完整的配色方案、布局规范和元素样式定义。

---

## 主题列表

| 主题 | 代号 | 风格 | 适合内容 |
|------|------|------|----------|
| 🟠 秋日暖光 | autumn-warm | 温暖治愈，橙色调，文艺美学 | 情感故事、生活随笔 |
| 🟢 春日清新 | spring-fresh | 清新自然，绿色调，生机盎然 | 旅行日记、自然主题 |
| 🔵 深海静谧 | ocean-calm | 深邃冷静，蓝色调，理性专业 | 技术文章、商业分析 |

---

## 通用技术规范

所有主题必须遵守以下规范（详见 `html-guide.md`）：

### 主容器结构

微信会剥离 `<body>` 样式，必须用主 `<div>` 承载全局样式：

```html
<body>
  <div style="background-color: {主背景色}; padding: 40px 10px; letter-spacing: {字间距};">
    <section style="max-width: 800px; margin: 0 auto; padding: 25px; background-color: #ffffff; {卡片纹理}; border: {边框}; box-shadow: {阴影}; border-radius: {圆角};">
      <!-- 文章内容 -->
    </section>
  </div>
</body>
```

### 字体栈

所有主题统一使用：
```
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### 正文基础样式

- 字号：`font-size: 16px`
- 行高：`line-height: 1.75` ~ `1.8`
- 每个 `<p>` 必须显式指定 `color`（微信会重置为黑色）

### 标题双span结构

所有主题的 `<h2>` 标题必须使用双 `<span>` 结构：

```html
<h2 style="...">
  <span style="color: {主强调色}; text-shadow: 0 0 {光晕半径} rgba({RGB}, {透明度});">{符号}</span>
  <span style="color: {强调色};">{标题文字}</span>
</h2>
```

### 安全HTML标签

只使用以下标签：
```
section, p, span, strong, em, u, a, h1-h6, ul, ol, li,
blockquote, pre, code, table, thead, tbody, tr, th, td, img, br, hr
```

### 禁止使用

- `<style>` 标签（微信不支持）
- flexbox、grid 布局
- position: absolute/fixed/sticky
- animation、transition、transform
- filter、clip-path

---

## 主题一：秋日暖光 (autumn-warm)

> 温暖治愈、橙色调、文艺美学。如同精致的艺术博客，充满自然感、柔和光效和清晰的视觉层次。

### 配色方案

| 用途 | 色值 | 说明 |
|------|------|------|
| 主背景 | `#faf9f5` | 暖白 |
| 文字色 | `#4a413d` | 深褐灰 |
| 主强调色 | `#d97758` | 秋日暖橙 |
| 副强调色 | `#c06b4d` | 橙红高亮 |
| 引用背景 | `#fef4e7` | 淡橙 |

### 卡片布局

```html
<section style="
  max-width: 800px;
  margin: 0 auto;
  padding: 25px;
  background-color: #ffffff;
  background-image: linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px);
  background-size: 20px 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04), 0 0 15px rgba(217, 119, 88, 0.4);
  border-radius: 18px;
">
```

纹理：米白方格纹理（20px网格）

### 元素样式

#### h2（一级标题）

```html
<h2 style="font-size: 22px; font-weight: 700; margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 1px dashed rgba(74, 65, 61, 0.3);">
  <span style="color: #d97758; text-shadow: 0 0 12px rgba(217, 119, 88, 0.5); margin-right: 8px;">▶</span>
  <span style="color: #d97758;">标题文字</span>
</h2>
```

符号：▶（暖橙色 + 光晕）

#### h3（二级标题）

```html
<h3 style="font-size: 18px; font-weight: 600; color: #d97758; margin: 25px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #d97758; display: inline-block;">
  标题文字
</h3>
```

无 text-shadow，短实线下划线。

#### p（段落）

```html
<p style="color: #4a413d; font-size: 16px; line-height: 1.75; margin: 12px 0;">
  段落文字
</p>
```

#### strong（加粗）

```html
<strong style="color: #c06b4d; font-weight: 700;">加粗文字</strong>
```

无 text-shadow。

#### blockquote（引用）

```html
<blockquote style="
  background-color: #fef4e7;
  border-left: 5px solid #d97758;
  padding: 15px 20px;
  margin: 20px 0;
  border-radius: 0 8px 8px 0;
  box-shadow: inset 0 0 15px rgba(217, 119, 88, 0.1);
">
  <p style="color: #4a413d; margin: 0;">引用文字</p>
</blockquote>
```

#### hr（分割线）

```html
<hr style="border: none; height: 1px; background-color: rgba(74, 65, 61, 0.1); margin: 30px 0;" />
```

#### ul/ol（列表）

```html
<ul style="color: #4a413d; padding-left: 20px; margin: 15px 0;">
  <li style="margin: 8px 0; line-height: 1.75;">列表项</li>
</ul>
```

#### code（行内代码）

```html
<code style="background-color: rgba(217, 119, 88, 0.1); color: #c06b4d; padding: 2px 6px; border-radius: 4px; font-size: 14px;">代码</code>
```

#### table（表格）

```html
<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background-color: #fef4e7;">
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #d97758; color: #4a413d;">表头</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid rgba(74, 65, 61, 0.1); color: #4a413d;">内容</td>
    </tr>
  </tbody>
</table>
```

---

## 主题二：春日清新 (spring-fresh)

> 清新自然、绿色调、生机盎然。如同精致的园艺博客或自然杂志，充满生机感和绿意。

### 配色方案

| 用途 | 色值 | 说明 |
|------|------|------|
| 主背景 | `#f5f8f5` | 淡绿 |
| 文字色 | `#3d4a3d` | 深绿灰 |
| 主强调色 | `#6b9b7a` | 春日嫩绿 |
| 副强调色 | `#4a8058` | 草地翠绿 |
| 引用背景 | `#e8f0e8` | 淡绿 |

### 卡片布局

```html
<section style="
  max-width: 800px;
  margin: 0 auto;
  padding: 25px;
  background-color: #ffffff;
  background-image: radial-gradient(circle at 1px 1px, rgba(107, 155, 122, 0.08) 1px, transparent 0);
  background-size: 20px 20px;
  border: 1px solid rgba(107, 155, 122, 0.1);
  box-shadow: 0 8px 24px rgba(74, 128, 88, 0.08), 0 0 12px rgba(107, 155, 122, 0.2);
  border-radius: 16px;
">
```

纹理：清新点状纹理（20px间距）

### 元素样式

#### h2（一级标题）

```html
<h2 style="font-size: 22px; font-weight: 700; margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 1px dashed rgba(74, 128, 88, 0.25);">
  <span style="color: #6b9b7a; text-shadow: 0 0 10px rgba(107, 155, 122, 0.4); margin-right: 8px;">❀</span>
  <span style="color: #4a8058;">标题文字</span>
</h2>
```

符号：❀（嫩绿色 + 光晕）

#### h3（二级标题）

```html
<h3 style="font-size: 18px; font-weight: 600; color: #4a8058; margin: 25px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #6b9b7a; display: inline-block;">
  标题文字
</h3>
```

#### p（段落）

```html
<p style="color: #3d4a3d; font-size: 16px; line-height: 1.8; margin: 12px 0;">
  段落文字
</p>
```

#### strong（加粗）

```html
<strong style="color: #4a8058; font-weight: 700;">加粗文字</strong>
```

#### blockquote（引用）

```html
<blockquote style="
  background-color: #e8f0e8;
  border-left: 5px solid #6b9b7a;
  padding: 15px 20px;
  margin: 20px 0;
  border-radius: 0 8px 8px 0;
  box-shadow: inset 0 0 12px rgba(107, 155, 122, 0.1);
">
  <p style="color: #3d4a3d; margin: 0;">引用文字</p>
</blockquote>
```

#### hr（分割线）

```html
<hr style="border: none; height: 1px; background: linear-gradient(90deg, transparent, rgba(107, 155, 122, 0.3), transparent); margin: 30px 0;" />
```

#### code（行内代码）

```html
<code style="background-color: rgba(107, 155, 122, 0.1); color: #4a8058; padding: 2px 6px; border-radius: 4px; font-size: 14px;">代码</code>
```

#### table（表格）

```html
<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background-color: #e8f0e8;">
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #6b9b7a; color: #3d4a3d;">表头</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid rgba(107, 155, 122, 0.1); color: #3d4a3d;">内容</td>
    </tr>
  </tbody>
</table>
```

---

## 主题三：深海静谧 (ocean-calm)

> 深邃冷静、蓝色调、理性专业。如同精致的专业期刊或学术博客，充满理性感和深邃蓝调。

### 配色方案

| 用途 | 色值 | 说明 |
|------|------|------|
| 主背景 | `#f0f4f8` | 淡蓝 |
| 文字色 | `#3a4150` | 深蓝灰 |
| 主强调色 | `#4a7c9b` | 深海蔚蓝 |
| 副强调色 | `#3d6a8a` | 静谧石蓝 |
| 引用背景 | `#e8f0f8` | 淡蓝 |

### 卡片布局

```html
<section style="
  max-width: 800px;
  margin: 0 auto;
  padding: 25px;
  background-color: #ffffff;
  background-image: linear-gradient(rgba(74, 124, 155, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74, 124, 155, 0.03) 1px, transparent 1px);
  background-size: 24px 24px;
  border: 1px solid rgba(74, 124, 155, 0.08);
  box-shadow: 0 8px 28px rgba(58, 65, 80, 0.06), 0 0 16px rgba(74, 124, 155, 0.15);
  border-radius: 14px;
">
```

纹理：淡蓝网格纹理（24px网格）

### 元素样式

#### h2（一级标题）

```html
<h2 style="font-size: 22px; font-weight: 700; margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 1px dashed rgba(74, 124, 155, 0.3);">
  <span style="color: #4a7c9b; text-shadow: 0 0 10px rgba(74, 124, 155, 0.4); margin-right: 8px;">◆</span>
  <span style="color: #3d6a8a;">标题文字</span>
</h2>
```

符号：◆（蔚蓝色 + 光晕）

#### h3（二级标题）

```html
<h3 style="font-size: 18px; font-weight: 600; color: #3d6a8a; margin: 25px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #4a7c9b; display: inline-block;">
  标题文字
</h3>
```

#### p（段落）

```html
<p style="color: #3a4150; font-size: 16px; line-height: 1.8; margin: 12px 0;">
  段落文字
</p>
```

#### strong（加粗）

```html
<strong style="color: #3d6a8a; font-weight: 700;">加粗文字</strong>
```

#### blockquote（引用）

```html
<blockquote style="
  background-color: #e8f0f8;
  border-left: 5px solid #4a7c9b;
  padding: 15px 20px;
  margin: 20px 0;
  border-radius: 0 8px 8px 0;
  box-shadow: inset 0 0 12px rgba(74, 124, 155, 0.08);
">
  <p style="color: #3a4150; margin: 0;">引用文字</p>
</blockquote>
```

#### hr（分割线）

```html
<hr style="border: none; height: 1px; background: linear-gradient(90deg, transparent, rgba(74, 124, 155, 0.25), transparent); margin: 30px 0;" />
```

#### code（行内代码）

```html
<code style="background-color: rgba(74, 124, 155, 0.1); color: #3d6a8a; padding: 2px 6px; border-radius: 4px; font-size: 14px;">代码</code>
```

#### table（表格）

```html
<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background-color: #e8f0f8;">
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #4a7c9b; color: #3a4150;">表头</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid rgba(74, 124, 155, 0.08); color: #3a4150;">内容</td>
    </tr>
  </tbody>
</table>
```

---

## 主题选择建议

| 内容类型 | 推荐主题 | 理由 |
|----------|----------|------|
| 情感故事、生活随笔 | 秋日暖光 | 温暖色调营造情感氛围 |
| 旅行日记、自然主题 | 春日清新 | 清新绿色契合自然主题 |
| 技术文章、商业分析 | 深海静谧 | 专业蓝色调传达可信感 |
| 个人成长、认知升级 | 秋日暖光 | 温暖但不失深度 |
| 产品评测、科技资讯 | 深海静谧 | 理性冷静的专业感 |
| 美食、手工、生活方式 | 春日清新 | 清新自然的生活气息 |
