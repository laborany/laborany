# Markdown 到 HTML 转换指南

本文档说明 `scripts/calculate_diff.py` 脚本如何将论文从 Markdown 格式转换为精美的 HTML 格式。

## 转换流程

1. 脚本读取原文和修改后的论文
2. 使用 `difflib.SequenceMatcher` 计算精确 diff
3. 自动添加 diff 标记（`del-text`/`add-text`）
4. 将 Markdown 转换为 HTML 结构
5. 替换模板占位符并输出完整 HTML

## 脚本使用

```bash
python3 "/Users/lizhe/Library/Application Support/LaborAny/skills/paper-editor/scripts/calculate_diff.py" \
    "$(pwd)/original.md" "$(pwd)/modified.md" --output "$(pwd)/result.html"
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `original.md` | 原始论文文件（Markdown 格式） |
| `modified.md` | 修改后的论文文件（Markdown 格式） |
| `--output` | 输出 HTML 文件路径（**必需**） |
| `--notes` | 修改意见 JSON 文件（可选） |

**注意**：脚本已内嵌 HTML 模板，无需指定 `--template` 参数。

## Markdown 元素到 HTML 的映射

### 标题

```markdown
# 深度学习在图像识别中的应用研究
```
```html
<h1 class="paper-title">深度学习在图像识别中的应用研究</h1>
```

```markdown
## 1. 引言
```
```html
<h2 class="section-title">1. 引言</h2>
```

```markdown
### 1.1 研究背景
```
```html
<h3 class="subsection-title">1.1 研究背景</h3>
```

### 元信息（作者、日期）

```markdown
**作者**：张三，李四
**日期**：2024年1月
```
```html
<div class="paper-meta">
    <p><strong>作者</strong>：张三，李四</p>
    <p><strong>日期</strong>：2024年1月</p>
</div>
```

### 摘要

```markdown
**摘要**
本文研究了深度学习在图像识别领域的应用...
```
```html
<div class="abstract-text">
    <strong>摘要</strong>
    <p>本文研究了深度学习在图像识别领域的应用...</p>
</div>
```

### 段落

普通段落（首行缩进）：
```markdown
本研究采用卷积神经网络作为基础模型...
```
```html
<p class="paragraph">本研究采用卷积神经网络作为基础模型...</p>
```

无缩进段落（如摘要、引言开头等）：
```html
<p class="paragraph no-indent">本文旨在探讨...</p>
```

### 列表

有序列表：
```markdown
1. 数据预处理
2. 模型训练
3. 结果评估
```
```html
<ol class="list list-ordered">
    <li>数据预处理</li>
    <li>模型训练</li>
    <li>结果评估</li>
</ol>
```

无序列表：
```markdown
- 高准确率
- 低计算复杂度
- 良好的泛化能力
```
```html
<ul class="list list-unordered">
    <li>高准确率</li>
    <li>低计算复杂度</li>
    <li>良好的泛化能力</li>
</ul>
```

### 表格

```markdown
| 方法 | 准确率 | 召回率 |
|------|--------|--------|
| 方法A | 92.5% | 89.3% |
| 方法B | 94.2% | 91.7% |
```
```html
<div class="table-wrapper">
    <table>
        <thead>
            <tr>
                <th>方法</th>
                <th>准确率</th>
                <th>召回率</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>方法A</td>
                <td>92.5%</td>
                <td>89.3%</td>
            </tr>
            <tr>
                <td>方法B</td>
                <td>94.2%</td>
                <td>91.7%</td>
            </tr>
        </tbody>
    </table>
</div>
```

### 公式

行间公式：
```markdown
$$
f(x) = \sum_{i=1}^{n} w_i x_i + b
$$
```
```html
<div class="formula">f(x) = Σ w_i x_i + b</div>
```

行内公式：
```markdown
模型使用 $e$ 作为自然对数的底数。
```
```html
<p class="paragraph">模型使用 <span class="inline-formula">e</span> 作为自然对数的底数。</p>
```

### 代码块

```markdown
```python
import torch
model = torch.nn.Sequential(...)
```
```
```html
<div class="code-block"><code>import torch
model = torch.nn.Sequential(...)</code></div>
```

### 引用标记

```markdown
卷积神经网络[1]在图像处理中表现优异。
```
```html
<p class="paragraph">卷积神经网络<sup class="citation">[1]</sup>在图像处理中表现优异。</p>
```

### 参考文献

```markdown
## 参考文献

[1] LeCun Y, Bengio Y, Hinton G. Deep learning[J]. Nature, 2015, 521(7553): 436-444.
[2] Krizhevsky A, Sutskever I, Hinton G E. ImageNet classification with deep convolutional neural networks[C]//Advances in neural information processing systems. 2012: 1097-1105.
```
```html
<div class="reference-section">
    <h2 class="section-title">参考文献</h2>
    <div class="reference-item">[1] LeCun Y, Bengio Y, Hinton G. Deep learning[J]. Nature, 2015, 521(7553): 436-444.</div>
    <div class="reference-item">[2] Krizhevsky A, Sutskever I, Hinton G E. ImageNet classification with deep convolutional neural networks[C]//Advances in neural information processing systems. 2012: 1097-1105.</div>
</div>
```

## Diff 标记（脚本自动生成）

脚本会自动为修改内容添加以下 diff 标记：

| 修改类型 | HTML 标签 | 显示效果 |
|----------|-----------|----------|
| 删除的原文 | `<span class="del-text">原文内容</span>` | 红色删除线 |
| 新增内容 | `<span class="add-text">新内容</span>` | 绿色高亮 |
| 未修改内容 | 无标签 | 正常显示 |

**注意**：diff 标记由脚本自动计算生成，不需要手动添加。

## 完整转换示例

### 输入（Markdown）

```markdown
# 深度学习在图像识别中的应用研究

**作者**：张三，李四
**日期**：2024年1月

**摘要**
本文研究了深度学习在图像识别领域的应用...

## 1. 引言

随着人工智能技术的发展...

### 1.1 研究背景

卷积神经网络[1]是图像识别的核心技术之一。

本文的主要贡献如下：
1. 提出了一种新的网络结构
2. 在多个数据集上进行了验证
3. 实现了性能提升

## 参考文献

[1] LeCun Y, Bengio Y, Hinton G. Deep learning[J]. Nature, 2015, 521(7553): 436-444.
```

### 输出（HTML 内容部分）

```html
<div class="paper-container">
    <h1 class="paper-title">深度学习在图像识别中的应用研究</h1>

    <div class="paper-meta">
        <p><strong>作者</strong>：张三，李四</p>
        <p><strong>日期</strong>：2024年1月</p>
    </div>

    <div class="abstract-text">
        <strong>摘要</strong>
        <p class="paragraph no-indent">本文研究了深度学习在图像识别领域的应用...</p>
    </div>

    <div class="section">
        <h2 class="section-title">1. 引言</h2>

        <p class="paragraph no-indent">随着人工智能技术的发展...</p>

        <h3 class="subsection-title">1.1 研究背景</h3>

        <p class="paragraph">卷积神经网络<sup class="citation">[1]</sup>是图像识别的核心技术之一。</p>

        <p class="paragraph">本文的主要贡献如下：</p>

        <ol class="list list-ordered">
            <li>提出了一种新的网络结构</li>
            <li>在多个数据集上进行了验证</li>
            <li>实现了性能提升</li>
        </ol>
    </div>

    <div class="reference-section">
        <h2 class="section-title">参考文献</h2>
        <div class="reference-item">[1] LeCun Y, Bengio Y, Hinton G. Deep learning[J]. Nature, 2015, 521(7553): 436-444.</div>
    </div>
</div>
```

## 输出文件命名

生成的 HTML 文件建议命名为：`{paper-title}.html`

例如：`深度学习在图像识别中的应用研究.html`
