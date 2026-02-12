# 微信公众号 HTML 规范

本文档描述微信公众号编辑器的 HTML 限制和最佳实践。了解这些规范有助于生成兼容的 HTML。

## 安全标签清单

微信公众号编辑器支持的 HTML 标签：

| 标签 | 属性限制 | 说明 |
|------|----------|------|
| `section` | style | 容器标签，推荐用于整体包裹 |
| `p` | style | 段落 |
| `span` | style | 内联容器 |
| `strong` | style | 加粗 |
| `em` | style | 斜体 |
| `u` | style | 下划线 |
| `a` | style, href | 链接（href 仅支持 https） |
| `h1` - `h6` | style | 标题 |
| `ul`, `ol` | style | 列表 |
| `li` | style | 列表项 |
| `blockquote` | style | 引用块 |
| `pre` | style | 预格式化文本 |
| `code` | style | 代码 |
| `table` | style | 表格 |
| `thead`, `tbody` | style | 表头/表体 |
| `tr`, `th`, `td` | style | 表格行/单元格 |
| `br` | - | 换行 |
| `img` | src, style, alt | 图片（src 必须是微信域名） |
| `hr` | style | 分割线 |

## 禁止使用的标签

```html
<!-- 脚本相关 -->
<script>...</script>
<noscript>...</noscript>
<iframe>...</iframe>

<!-- 表单相关 -->
<form>...</form>
<input />
<button>...</button>
<textarea>...</textarea>
<select>...</select>

<!-- 其他 -->
<object>...</object>
<embed>...</embed>
<video>...</video>
<audio>...</audio>
<style>...</style>
<link>...</link>
<meta>...</meta>
```

## CSS 属性限制

### 允许的 CSS 属性

```css
/* 文字 */
color
font-size
font-weight
font-style
font-family
line-height
letter-spacing
text-align
text-decoration
text-indent

/* 背景 */
background-color
background-image (仅限 https 图片)

/* 边框 */
border
border-left
border-right
border-top
border-bottom
border-radius

/* 间距 */
margin
margin-top
margin-bottom
margin-left
margin-right
padding
padding-top
padding-bottom
padding-left
padding-right

/* 尺寸 */
width
max-width
min-width
height
max-height
min-height

/* 定位 */
display (仅限 block, inline-block, none)
float (仅限 left, right, none)
clear
overflow

/* 阴影 */
box-shadow
text-shadow
```

### 禁止的 CSS 属性

```css
/* 定位相关 */
position: absolute
position: fixed
position: sticky

/* 复杂布局 */
flexbox
grid
transform

/* 动画 */
transition
animation
@keyframes

/* 其他 */
filter
clip-path
backdrop-filter
```

## AI 主题特殊要求

### 主容器结构（关键）

微信公众号编辑器会剥离 `<body>` 标签的样式，因此必须在 `<body>` 后立即创建主容器：

```html
<body>
  <!-- 主容器：承载所有全局样式 -->
  <div style="background-color: #faf9f5; padding: 40px 10px; letter-spacing: 0.5px;">

    <!-- 卡片/内容 -->
    <section style="max-width: 800px; margin: 0 auto;">
      ...
    </section>

  </div>
</body>
```

### 段落文字颜色

微信编辑器会强制重置 `<p>` 标签的颜色为黑色。必须为每个 `<p>` 明确指定颜色：

```html
<!-- 错误：颜色可能被重置 -->
<p>这段文字颜色不确定</p>

<!-- 正确：明确指定颜色 -->
<p style="color: #4a413d;">这段文字显示为指定颜色</p>
```

### 卡片式布局

AI 主题使用卡片式布局，确保使用内联样式：

```html
<section style="max-width: 800px; margin: 0 auto; padding: 25px;
              background-color: #ffffff; border-radius: 18px;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);">
  <!-- 卡片内容 -->
</section>
```

## 最佳实践

### 1. 容器结构

```html
<section style="max-width:677px;margin:0 auto;padding:20px;background-color:#FFFFFF;">
  <!-- 内容 -->
</section>
```

### 2. 图片处理

```html
<!-- 正确：使用微信 CDN 图片 -->
<img src="https://mmbiz.qpic.cn/..." style="max-width:100%;height:auto;display:block;margin:20px auto;" />

<!-- 错误：外部图片不会显示 -->
<img src="https://example.com/image.jpg" />
```

### 3. 链接处理

```html
<!-- 正确：https 链接 -->
<a href="https://example.com" style="color:#007AFF;">链接文字</a>

<!-- 错误：http 链接可能被拦截 -->
<a href="http://example.com">链接</a>
```

### 4. 代码块

```html
<pre style="background-color:#F0F0F0;padding:16px;overflow-x:auto;border-radius:4px;margin:20px 0;">
<code style="font-family:monospace;font-size:14px;color:#333333;">
代码内容
</code>
</pre>
```

### 5. 表格

```html
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
  <thead>
    <tr style="background-color:#F9F9F9;">
      <th style="padding:12px;text-align:left;border-bottom:2px solid #EEEEEE;">标题1</th>
      <th style="padding:12px;text-align:left;border-bottom:2px solid #EEEEEE;">标题2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:12px;border-bottom:1px solid #EEEEEE;">内容1</td>
      <td style="padding:12px;border-bottom:1px solid #EEEEEE;">内容2</td>
    </tr>
  </tbody>
</table>
```

## 内容限制

| 限制项 | 限制值 |
|--------|--------|
| 标题长度 | 64 字符 |
| 摘要长度 | 120 字符 |
| 正文长度 | 建议 2000-10000 字符 |
| 单张图片大小 | < 5MB |
| 图片总数量 | < 100 张 |
| 外链数量 | 建议 < 10 个 |

## 常见问题

### Q: 为什么我的样式没有生效？

A: 检查：
1. CSS 是否使用内联 `style` 属性
2. CSS 属性是否在允许列表中
3. 是否有语法错误（未闭合的标签等）

### Q: 图片显示为空白？

A: 图片必须使用微信 CDN 域名：
- `mmbiz.qpic.cn`
- 其他微信允许的域名

外部图片需要先上传到微信素材库。

### Q: 链接无法点击？

A: 确保：
1. 链接是 `https://` 开头
2. 链接域名在微信白名单中
3. 链接没有被编辑器过滤

### Q: 代码块显示混乱？

A: 确保：
1. 使用 `<pre>` 和 `<code>` 包裹
2. 特殊字符已转义（`<` → `&lt;`, `>` → `&gt;`）
3. 设置 `overflow-x: auto` 允许横向滚动

### Q: 背景颜色在微信中丢失？

A: 微信会剥离 `<body>` 标签的样式。解决方案：
1. 使用主 `<div>` 容器包裹所有内容
2. 将背景色应用在主容器上，而不是 `<body>` 上

```html
<!-- 正确做法 -->
<div style="background-color: #faf9f5; padding: 40px 10px;">
  <!-- 所有内容 -->
</div>
```

### Q: 标题符号显示异常？

A: 确保：
1. 使用两个 `<span>` 标签分别包裹符号和文字
2. 符号 `<span>` 应用颜色和 text-shadow
3. 文字 `<span>` 只应用纯色（不要用渐变）

```html
<!-- 秋日暖光主题示例 -->
<h2 style="...">
  <span style="color: #d97758; text-shadow: 0 0 12px rgba(217, 119, 88, 0.5);">▶</span>
  <span style="color: #d97758;">标题文字</span>
</h2>
```
