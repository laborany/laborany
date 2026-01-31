---
name: paper-editor
description: |
  学术论文修改与优化助手。当用户发送论文内容并提出修改需求时使用此技能。
  功能包括：论文分类识别、深度内容理解、基于网络搜索的专业知识补充、系统性修改意见提出、
  保持学术风格的论文重写、修改效果验证、以及最终校对。
  最终输出仅生成 HTML 文件（使用 assets/paper-template.html 模板），
  HTML 文件使用 Write 工具保存到当前工作目录，支持三种查看模式：纯净版、修改痕迹、完整 Diff。
  HTML 中同时包含修改意见区域，与论文内容整合呈现。
  适用于各类学术论文的审阅、修改和优化。
icon: 📚
category: 学术
---

# 论文修改助手

## 工作流程

此技能采用五步迭代式修改流程，确保论文质量达到学术标准。

### 步骤 1：论文理解与分类

**目标**：全面理解论文主题、结构和内容，并确定论文类别。

**操作**：

1. **论文分类**：判断论文属于哪个学术领域（如计算机科学、生物学、经济学等）
2. **深度阅读**：逐段通读论文，理解研究问题、方法、结果和结论
3. **网络搜索**（必要时）：针对论文主题进行搜索，获取相关领域的前沿知识、
   相关论文引用、专业术语解释等
4. **记录关键信息**：
   - 研究问题/假设
   - 研究方法
   - 主要发现
   - 论文结构完整性

### 步骤 2：提出修改意见

**目标**：基于学术写作标准和领域专业知识，提出系统性修改建议。

**操作**：

检查以下方面并给出具体修改意见：

| 检查项 | 内容 |
|--------|------|
| **结构完整性** | 摘要、引言、方法、结果、讨论、结论是否齐全且逻辑连贯 |
| **问题陈述** | 研究问题是否清晰、有价值 |
| **方法描述** | 方法是否可复现、描述是否充分 |
| **结果呈现** | 数据是否清晰、图表是否恰当 |
| **讨论深度** | 是否充分解释结果意义、对比相关研究 |
| **语言表达** | 是否存在歧义、冗长、不规范的表述 |
| **逻辑连贯** | 论证链条是否完整、是否有逻辑漏洞 |
| **学术规范** | 引用是否规范、术语使用是否准确 |

**输出格式**：将修改意见按优先级排序，标明每条意见对应的论文段落。

### 步骤 3：论文修改

**目标**：根据步骤 2 提出的修改意见重写论文，保持原有学术风格。

**操作**：

1. **逐项修改**：按优先级处理每条修改意见，并记录每处修改的"原文"与"新内容"对照
2. **风格保持**：
   - 保持原文的语气和表达习惯（正式、客观、精确）
   - 使用领域内标准的学术用语
   - 避免改变作者的核心观点和创新点
3. **连贯性检查**：修改后确保段落之间、章节之间的过渡自然
4. **术语一致性**：全文术语使用保持统一
5. **修改对照记录**：维护一份修改记录表，格式如下：
   ```
   | 位置 | 原文 | 修改后 |
   |------|------|--------|
   | 第X段第Y句 | ... | ... |
   ```
   此记录用于后续生成 HTML 的 diff 标记

**修改原则**：

```
┌─────────────────────────────────────────────────────┐
│  只改需要改的，不改不需要改的                        │
│  改进表述，不改观点                                   │
│  增强逻辑，不改变意图                                │
└─────────────────────────────────────────────────────┘
```

### 步骤 4：验证与迭代

**目标**：验证修改是否完成，论文是否达到合格标准。

**操作**：

1. **修改完成度检查**：
   - 逐条对照步骤 2 的修改意见，确认每条都已处理
   - 标记未完成或处理不充分的意见
   - 记录每处修改对应的原文和新内容，用于 HTML 中的 diff 标记

2. **论文质量判定**：
   - 论文结构是否完整
   - 逻辑是否清晰连贯
   - 学术语言是否规范
   - 表述是否准确无误

3. **迭代决策**：
   - 如果修改意见全部完成 且 论文质量合格 → 进入步骤 5
   - 否则 → 返回步骤 3，针对性修改未完成的部分

### 步骤 5：最终校对与输出

**目标**：检查细节问题，输出最终论文（仅输出 HTML 格式，包含修改意见和论文内容）。

**操作**：

1. **错别字检查**：逐字检查拼写错误
2. **标点符号检查**：确认中英文标点使用正确
3. **格式一致性**：确认编号格式、引用格式等统一
4. **生成 HTML 文件**（必须执行）：

   **关键原则**：HTML 文件必须包含完整的 diff 标记，否则三种模式无法切换。HTML 中每个句子/段落必须按以下格式构建：

   ```
   修改处 = <span class="del-text">原文内容</span><span class="add-text">修改后内容</span>
   未修改处 = 保持原样，不加任何标签
   ```

   具体步骤：

   - 读取 `assets/paper-template.html` 模板
   - 将论文标题替换 `{PAPER_TITLE}` 占位符
   - **将修改意见转换为 HTML 结构**，替换 `{REVIEW_NOTES}` 占位符：
     - 使用 `<div class="review-notes">` 包裹修改意见区域
     - 使用 `<div class="review-note priority-high">` 表示高优先级意见
     - 使用 `<div class="review-note priority-medium">` 表示中优先级意见
     - 使用 `<div class="review-note priority-low">` 表示低优先级意见
   - 将论文内容（包含标题、摘要、正文、参考文献）转换为 HTML 结构并替换 `{PAPER_CONTENT}`
   - **核心要求：为所有修改内容添加 diff 标记**
     - **删除的内容**：用 `<span class="del-text">原文</span>` 包裹
     - **新增的内容**：用 `<span class="add-text">新内容</span>` 包裹
     - 未修改的内容不加标签
     - diff 标签必须成对出现，用于同一位置的原内容和新内容对照
   - 使用模板中的 CSS 类样式化各部分内容
   - **使用 `Write` 工具将完整的 HTML 内容写入文件**，文件名为 `{paper-title}.html`，路径为当前工作目录

5. **输出确认**：
   - 向用户确认 HTML 文件已生成（显示文件名和路径）
   - 说明 HTML 支持三种模式切换：纯净版、修改痕迹、完整 Diff
   - 说明修改意见已整合到 HTML 文件顶部

## 学术写作原则

在进行修改时，遵守以下学术写作原则：

| 原则 | 说明 |
|------|------|
| **客观性** | 避免主观判断，用数据和事实说话 |
| **精确性** | 术语使用准确，避免模糊表述 |
| **简洁性** | 用最少的话表达完整意思，避免冗余 |
| **逻辑性** | 论证清晰，因果关系明确 |
| **完整性** | 不遗漏必要的信息和论证步骤 |

## 常见问题处理

### 论文风格不一致

- 判断作者的学术背景和写作习惯
- 统一为该领域常见的学术风格
- 保持第一人称/第三人称使用的一致性

### 术语使用混乱

- 搜索并确认领域内标准术语
- 统一全文的术语表达
- 在首次出现时给出术语解释

### 逻辑链条断裂

- 识别论证中的跳跃点
- 补充必要的连接句和过渡段
- 确保每个结论都有前文铺垫

## 输出格式

### 修改意见输出

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
论文修改意见
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【优先级：高】
1. [具体问题] → [修改建议]
   位置：第X段/第Y节

【优先级：中】
2. ...

【优先级：低】
3. ...
```

### 最终论文输出（必须执行）

完成论文修改后，必须生成 HTML 文件，包含修改意见和论文完整内容。

#### HTML 文件（必须生成）
使用 `Write` 工具生成 HTML 文件：
- 读取 `assets/paper-template.html` 模板
- 替换占位符：`{PAPER_TITLE}`、`{REVIEW_NOTES}` 和 `{PAPER_CONTENT}`
  - `{REVIEW_NOTES}`：修改意见区域，按优先级分类展示
  - `{PAPER_CONTENT}`：论文完整内容，包含 diff 标记
- 文件保存路径：当前工作目录
- 文件命名：`{paper-title}.html`
- 向用户确认：`已生成 HTML 文件：{paper-title}.html`

#### 修改意见 HTML 格式

修改意见区域使用以下 HTML 结构：

```html
<div class="review-notes">
    <h2 class="review-title">论文修改意见</h2>

    <div class="review-section priority-high">
        <h3 class="priority-heading">【优先级：高】</h3>
        <div class="review-note">
            <span class="note-id">1.</span>
            <span class="note-content">[具体问题] → [修改建议]</span>
            <span class="note-location">位置：第X段/第Y节</span>
        </div>
        <div class="review-note">
            <span class="note-id">2.</span>
            <span class="note-content">...</span>
        </div>
    </div>

    <div class="review-section priority-medium">
        <h3 class="priority-heading">【优先级：中】</h3>
        <div class="review-note">...</div>
    </div>

    <div class="review-section priority-low">
        <h3 class="priority-heading">【优先级：低】</h3>
        <div class="review-note">...</div>
    </div>
</div>
```

#### HTML 格式
使用 `assets/paper-template.html` 模板生成精美的 HTML 文件。将论文内容转换为对应 HTML 结构：

| 论文元素 | HTML 结构/CSS 类 |
|----------|-------------------|
| 修改意见区域 | `<div class="review-notes">` |
| 修改意见标题 | `<h2 class="review-title">` |
| 优先级分组 | `<div class="review-section priority-{high|medium|low}">` |
| 优先级标题 | `<h3 class="priority-heading">` |
| 单条意见 | `<div class="review-note">` |
| 意见序号 | `<span class="note-id">` |
| 意见内容 | `<span class="note-content">` |
| 意见位置 | `<span class="note-location">` |
| 论文标题 | `<h1 class="paper-title">` |
| 作者/日期 | `<div class="paper-meta">` |
| 摘要 | `<div class="abstract-text">` |
| 一级标题 | `<h2 class="section-title">` |
| 二级标题 | `<h3 class="subsection-title">` |
| 段落 | `<p class="paragraph">` |
| 无缩进段落 | `<p class="paragraph no-indent">` |
| 有序列表 | `<ol class="list list-ordered">` |
| 无序列表 | `<ul class="list list-unordered">` |
| 表格 | `<table>`（带 `.table-wrapper` 包裹） |
| 公式 | `<div class="formula">` 或 `<span class="inline-formula">` |
| 代码块 | `<div class="code-block">` |
| 引用标记 | `<sup class="citation">` |
| 参考文献 | `<div class="reference-section">` + `<div class="reference-item">` |

#### Diff/修改痕迹格式（HTML 专用）

**关键要求**：HTML 文件中所有修改内容必须用 diff 标签标记，否则三种模式无法正确切换。

| 修改类型 | HTML 标签 | 显示效果 |
|----------|-----------|----------|
| 删除的原文 | `<span class="del-text">原文内容</span>` | 红色删除线（仅在修改痕迹/Diff 模式显示） |
| 新增内容 | `<span class="add-text">新内容</span>` | 绿色高亮（仅在修改痕迹/Diff 模式显示） |
| 未修改内容 | 无标签 | 正常显示（所有模式都显示） |

**Diff 标签必须成对使用**：同一位置的原内容和新内容必须用 `<span class="del-text">` 和 `<span class="add-text">` 一一对应包裹。

**Diff 标签使用示例**：

```html
<!-- 示例 1：句内修改 -->
<p class="paragraph">
    <span class="del-text">本文提出了一种</span>
    <span class="add-text">本研究设计并实现了一种</span>
    基于<span class="del-text">传统机器学习</span><span class="add-text">深度神经网络</span>的方法。
</p>

<!-- 示例 2：整句修改 -->
<p class="paragraph">
    <span class="del-text">该方法在实验中表现良好。</span>
    <span class="add-text">该方法在多个基准数据集上取得了显著优于基线模型的性能。</span>
</p>

<!-- 示例 3：未修改内容 -->
<p class="paragraph">
    卷积神经网络是图像识别领域的核心技术之一。
</p>
```

**三种查看模式说明**（用户可通过页面顶部按钮切换）：

| 模式 | body class | `.del-text` 显示 | `.add-text` 显示 | 效果 |
|------|-----------|-----------------|-----------------|------|
| 纯净版 | 无 | ❌ 隐藏 | ❌ 隐藏 | 只显示最终修改后的内容 |
| 修改痕迹 | `show-changes` | ✅ 显示（删除线） | ✅ 显示（高亮） | 显示原内容+新内容对照 |
| 完整 Diff | `show-diff` | ✅ 显示（删除线） | ✅ 显示（高亮） | 同修改痕迹模式 |

**模式切换原理**：

```css
/* 默认：纯净版 - 所有 diff 标记隐藏 */
.del-text { display: none; }
.add-text { display: none; }

/* 修改痕迹/Diff 模式 - 显示所有 diff 标记 */
body.show-diff .del-text,
body.show-changes .del-text { display: inline; }
body.show-diff .add-text,
body.show-changes .add-text { display: inline; }
```

**生成 HTML 时必须遵守**：

1. 只有修改过的内容才用 diff 标签包裹
2. 未修改的内容保持原样，不加任何标签
3. diff 标签在同一位置必须成对出现（del + add）
4. 确保所有 `<span class="del-text">` 和 `<span class="add-text">` 都正确闭合

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
修改完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

已生成 HTML 文件：{paper-title}.html
文件包含：
  - 修改意见区域（按优先级分类）
  - 论文完整内容（支持纯净版/修改痕迹/完整 Diff 三种模式）
已处理修改意见：X/Y 条
