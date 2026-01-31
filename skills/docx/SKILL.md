---
name: Word文档助手
description: "智能文档编辑助手，支持结构化写作、多轮修改、格式调整和参考学习"
license: Proprietary. LICENSE.txt has complete terms
icon: 📝
category: 办公
---

# DOCX 智能编辑助手

## 核心原则

1. **修订模式默认开启**: 所有编辑操作自动使用 Word 修订追踪
2. **增量修改优先**: 只修改需要修改的部分，保留原文档完整性
3. **主动澄清需求**: 不确定时先问，不要猜测用户意图

---

## 三阶段工作流

### 阶段一：需求理解

在开始任何操作前，必须：

**1. 识别任务类型**
- 创建新文档
- 编辑现有文档
- 格式调整
- 内容审核

**2. 主动澄清不明确的需求**

当需求不够明确时，使用以下模板：

```
为了更好地帮助您，我需要确认几个问题：

1. [关于文档结构/内容的问题]
2. [关于风格/语气的问题]
3. [关于格式要求的问题]

您可以直接回答，或者说"按你的理解来"。
```

**3. 确认理解后再执行**

```
好的，我理解您的需求是：
- [需求点1]
- [需求点2]

我将按以下步骤进行：
1. [步骤1]
2. [步骤2]

如果理解有误，请告诉我。
```

### 阶段二：文档操作

#### 创建新文档
使用 docx-js，参考 [`docx-js.md`](docx-js.md)

#### 编辑现有文档（默认使用修订模式）

1. 获取当前状态：`pandoc --track-changes=all doc.docx -o current.md`
2. 分析需要修改的部分
3. 使用 Document 库进行增量修改
4. 每次修改后验证结果

#### 格式调整
支持：字体、字号、对齐、行距、缩进、样式应用

### 阶段三：结果呈现

每次修改完成后，必须：

**1. 生成修改摘要**
```
## 修改摘要

本次修改共涉及 N 处变更：

1. [位置]: [原内容] → [新内容]
2. [位置]: [原内容] → [新内容]
```

**2. 询问后续需求**
```
文档已更新。您可以：
- 继续修改其他部分
- 调整刚才的修改
- 确认完成
```

---

## 参考文件处理

当用户提供参考文件或网址时：

### 风格学习
1. 分析结构特征（标题层级、段落组织）
2. 识别写作风格（正式/非正式、简洁/详细）
3. 记录格式规范（字体、间距、对齐）
4. 在创建/编辑时应用这些特征

### 内容提取
1. 提取关键信息
2. 整合到目标文档中
3. 标注信息来源

---

## 技术实现细节

### Reading/Analyzing Content

#### Text extraction
转换文档为 markdown：
```bash
pandoc --track-changes=all path-to-file.docx -o output.md
# Options: --track-changes=accept/reject/all
```

#### Raw XML access
需要原始 XML 访问的场景：comments, complex formatting, document structure, embedded media, metadata

**Unpacking a file**
`python ooxml/scripts/unpack.py <office_file> <output_directory>`

**Key file structures**
* `word/document.xml` - Main document contents
* `word/comments.xml` - Comments referenced in document.xml
* `word/media/` - Embedded images and media files
* Tracked changes use `<w:ins>` (insertions) and `<w:del>` (deletions) tags

### Creating a new Word document

使用 **docx-js** 创建新文档。

**Workflow**
1. **MANDATORY - READ ENTIRE FILE**: Read [`docx-js.md`](docx-js.md) (~500 lines) completely
2. Create a JavaScript/TypeScript file using Document, Paragraph, TextRun components
3. Export as .docx using Packer.toBuffer()

### Editing an existing Word document

使用 **Document library** (Python library for OOXML manipulation)。

**Workflow**
1. **MANDATORY - READ ENTIRE FILE**: Read [`ooxml.md`](ooxml.md) (~600 lines) completely
2. Unpack the document: `python ooxml/scripts/unpack.py <office_file> <output_directory>`
3. Create and run a Python script using the Document library
4. Pack the final document: `python ooxml/scripts/pack.py <input_directory> <office_file>`

---

## Redlining 工作流

**Batching Strategy**: Group related changes into batches of 3-10 changes.

**Principle: Minimal, Precise Edits**
只标记实际变更的文本。将替换拆分为：[unchanged text] + [deletion] + [insertion] + [unchanged text]

Example - Changing "30 days" to "60 days":
```python
# BAD - Replaces entire sentence
'<w:del><w:r><w:delText>The term is 30 days.</w:delText></w:r></w:del><w:ins><w:r><w:t>The term is 60 days.</w:t></w:r></w:ins>'

# GOOD - Only marks what changed
'<w:r w:rsidR="00AB12CD"><w:t>The term is </w:t></w:r><w:del><w:r><w:delText>30</w:delText></w:r></w:del><w:ins><w:r><w:t>60</w:t></w:r></w:ins><w:r w:rsidR="00AB12CD"><w:t> days.</w:t></w:r>'
```

### Tracked changes workflow

1. **Get markdown representation**:
   ```bash
   pandoc --track-changes=all path-to-file.docx -o current.md
   ```

2. **Identify and group changes**: Organize into logical batches

   **Location methods**:
   - Section/heading numbers
   - Paragraph identifiers if numbered
   - Grep patterns with unique surrounding text
   - Document structure
   - **DO NOT use markdown line numbers**

3. **Read documentation and unpack**:
   - Read [`ooxml.md`](ooxml.md) completely
   - `python ooxml/scripts/unpack.py <file.docx> <dir>`

4. **Implement changes in batches**: Use `get_node` to find nodes, implement changes, then `doc.save()`

5. **Pack the document**:
   ```bash
   python ooxml/scripts/pack.py unpacked reviewed-document.docx
   ```

6. **Final verification**:
   ```bash
   pandoc --track-changes=all reviewed-document.docx -o verification.md
   ```

---

## Converting Documents to Images

```bash
# Convert DOCX to PDF
soffice --headless --convert-to pdf document.docx

# Convert PDF pages to JPEG images
pdftoppm -jpeg -r 150 document.pdf page
```

Options:
- `-r 150`: Resolution 150 DPI
- `-f N`: First page
- `-l N`: Last page

---

## Code Style Guidelines

- Write concise code
- Avoid verbose variable names and redundant operations
- Avoid unnecessary print statements

## Dependencies

- **pandoc**: `sudo apt-get install pandoc`
- **docx**: `npm install -g docx`
- **LibreOffice**: `sudo apt-get install libreoffice`
- **Poppler**: `sudo apt-get install poppler-utils`
- **defusedxml**: `pip install defusedxml`
