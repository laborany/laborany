# /ppt-quick 命令 - 一键生成 PPT

## 命令说明

一键完成「文稿分析 → 风格设计 → SVG 生成」全流程，适合已明确需求的用户快速产出。

## 触发方式

```
/ppt-quick @文稿.md [--style=风格名称] [--output=输出目录]
```

**参数说明**：

| 参数 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `@文稿.md` | ✅ | - | 要转换的 Markdown 文件 |
| `--style` | ❌ | `品牌蓝` | 风格名称，支持：`极简主义`、`商务咨询`、`科技暗黑`、`瑞士平面`、`品牌蓝` |
| `--output` | ❌ | `./ppt-output/` | SVG 文件输出目录 |

**示例**：

```bash
# 最简用法（使用默认风格）
/ppt-quick @report.md

# 指定风格
/ppt-quick @report.md --style=科技暗黑

# 完整参数
/ppt-quick @report.md --style=商务咨询 --output=./slides/
```

**自然语言触发**：

以下表达会触发此命令：
- "帮我把 @xxx.md 快速转成 PPT"
- "一键生成 PPT，文稿是 @xxx.md，用科技暗黑风格"
- "直接帮我生成所有 PPT 页面，文稿 @xxx.md"

---

## 执行流程

### 流程概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    /ppt-quick 一键生成流程                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1️⃣  初始化                                                │
│            ├─ 解析参数（文稿、风格、输出目录）                      │
│            ├─ 验证文稿文件存在                                    │
│            └─ 创建会话目录 .ppt-session/                          │
│                                                                 │
│  Phase 2️⃣  文稿分析（对应 /ppt-analyze）                          │
│            ├─ 读取并分析 Markdown 内容                            │
│            ├─ 拆解为页面结构                                     │
│            └─ 💾 保存 → .ppt-session/structure.json               │
│                                                                 │
│  Phase 3️⃣  风格应用（对应 /ppt-design）                           │
│            ├─ 加载预设风格配置                                    │
│            ├─ 生成设计规范                                       │
│            └─ 💾 保存 → .ppt-session/design.json                  │
│                                                                 │
│  Phase 4️⃣  批量生成（对应 /ppt-generate）                         │
│            ├─ 读取结构和设计规范                                  │
│            ├─ 逐页生成 SVG 文件                                   │
│            └─ 📁 输出 → [output]/slide-XX-type.svg                │
│                                                                 │
│  Phase 5️⃣  完成报告                                              │
│            ├─ 输出生成结果汇总                                    │
│            └─ 提供 PPT 导入指南                                   │
│                                                                 │
│  Phase 6️⃣  导出提示（可选）                                       │
│            ├─ 询问是否需要导出 PDF/PPTX                           │
│            ├─ 执行导出脚本                                       │
│            └─ 输出导出结果汇总                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: 初始化

#### 1.1 解析参数

```
输入: /ppt-quick @report.md --style=科技暗黑 --output=./slides/

解析结果:
├─ 文稿路径: report.md
├─ 风格名称: 科技暗黑
└─ 输出目录: ./slides/
```

#### 1.2 验证文件

1. 检查文稿文件是否存在
2. 如果文件不存在，终止并提示用户

#### 1.3 创建会话目录

```bash
mkdir -p .ppt-session
```

会话目录用于存储中间产物，确保三个阶段数据一致性。

---

### Phase 2: 文稿分析

**执行 `/ppt-analyze` 核心逻辑，但跳过交互确认环节。**

#### 2.1 分析文稿

按照 [analyze.md](analyze.md) 中定义的流程：
- 读取 Markdown 内容
- 提取主题、关键词、要点
- 拆解为页面结构

#### 2.2 保存结构文件

将分析结果保存为 JSON，供后续阶段使用：

```json
// .ppt-session/structure.json
{
  "source_file": "report.md",
  "created_at": "2024-01-15T10:30:00Z",
  "metadata": {
    "title": "年度业务汇报",
    "theme": "商业/管理",
    "keywords": ["业绩", "增长", "战略", "目标"],
    "total_pages": 12,
    "estimated_duration": "15-20分钟"
  },
  "pages": [
    {
      "page_number": 1,
      "type": "cover",
      "title": "年度业务汇报",
      "subtitle": "2024年工作总结与2025年规划",
      "content": [],
      "density": "low"
    },
    {
      "page_number": 2,
      "type": "intro",
      "title": "今年我们经历了什么？",
      "subtitle": null,
      "content": ["市场环境变化", "团队扩张", "新产品上线"],
      "density": "medium"
    }
  ]
}
```

#### 2.3 输出进度

```
✅ Phase 2/6 完成：文稿分析

📊 分析结果：
├─ 总页数: 12 页
├─ 页面类型: 封面(1) + 引言(1) + 观点(6) + 图表(2) + 总结(1) + 结束(1)
├─ 预计时长: 15-20 分钟
└─ 结构文件: .ppt-session/structure.json

⏳ 继续执行 Phase 3: 风格应用...
```

---

### Phase 3: 风格应用

**执行 `/ppt-design` 核心逻辑，但跳过交互选择环节。**

#### 3.1 加载预设风格

根据 `--style` 参数，加载对应的风格文件：

| 风格名称 | 配置文件 |
|----------|----------|
| 极简主义 | [styles/01-minimalism.md](../styles/01-minimalism.md) |
| 商务咨询 | [styles/02-consulting.md](../styles/02-consulting.md) |
| 科技暗黑 | [styles/03-tech-dark.md](../styles/03-tech-dark.md) |
| 瑞士平面 | [styles/04-swiss-style.md](../styles/04-swiss-style.md) |
| 品牌蓝 | [styles/05-brand-blue.md](../styles/05-brand-blue.md) |

#### 3.2 生成设计规范

将风格配置转换为结构化设计规范：

```json
// .ppt-session/design.json
{
  "style_name": "科技暗黑",
  "style_file": "styles/03-tech-dark.md",
  "created_at": "2024-01-15T10:30:05Z",
  "canvas": {
    "width": 1920,
    "height": 1080,
    "aspect_ratio": "16:9"
  },
  "colors": {
    "background": "#0D0D0D",
    "primary": "#00F5D4",
    "secondary": "#7B61FF",
    "accent": "#FF6B6B",
    "text_primary": "#FFFFFF",
    "text_secondary": "#B4B4B4"
  },
  "typography": {
    "font_stack": "Microsoft YaHei, SimHei, PingFang SC, sans-serif",
    "title_size": "48px",
    "subtitle_size": "32px",
    "body_size": "24px",
    "caption_size": "18px"
  },
  "spacing": {
    "margin": 80,
    "padding": 40,
    "gap": 24
  },
  "gradients": {
    "primary": "linear-gradient(135deg, #00F5D4 0%, #7B61FF 100%)",
    "background": "linear-gradient(180deg, #0D0D0D 0%, #1A1A2E 100%)"
  }
}
```

#### 3.3 输出进度

```
✅ Phase 3/6 完成：风格应用

🎨 设计规范：
├─ 风格: 科技暗黑
├─ 背景: 深色 (#0D0D0D)
├─ 主色: 荧光青 (#00F5D4)
├─ 次色: 科技紫 (#7B61FF)
└─ 规范文件: .ppt-session/design.json

⏳ 继续执行 Phase 4: 批量生成...
```

---

### Phase 4: 批量生成

**执行 `/ppt-generate` 核心逻辑。**

#### 4.1 读取配置

从会话目录加载：
- `.ppt-session/structure.json` - 页面结构
- `.ppt-session/design.json` - 设计规范

#### 4.2 创建输出目录

```bash
mkdir -p [output]  # 默认 ./ppt-output/
```

#### 4.3 逐页生成

对于每一页，执行以下步骤：

1. **加载页面模板** - 根据页面类型，参考 [specs/page-templates.md](../specs/page-templates.md)
2. **应用设计规范** - 注入配色、字体、间距
3. **填充内容** - 根据 structure.json 中的内容
4. **兼容性处理** - 应用 [specs/svg-compatibility.md](../specs/svg-compatibility.md) 的 5 条规则
5. **保存文件** - 输出为 `slide-XX-type.svg`

#### 4.4 生成进度反馈

```
⏳ Phase 4/6 进行中：批量生成

✅ [1/12] slide-01-cover.svg - 封面页
✅ [2/12] slide-02-intro.svg - 引言页
✅ [3/12] slide-03-achievement.svg - 观点页：年度成就
🔄 [4/12] slide-04-challenges.svg - 生成中...
```

---

### Phase 5: 完成报告

#### 5.1 输出汇总

```
🎉 生成完成！

═══════════════════════════════════════════════════════════════════
                          PPT SVG 生成报告
═══════════════════════════════════════════════════════════════════

📄 源文件: report.md
🎨 使用风格: 科技暗黑
📁 输出目录: ./ppt-output/

📑 生成文件 (共 12 个):
├── slide-01-cover.svg          封面页
├── slide-02-intro.svg          引言页
├── slide-03-achievement.svg    观点页
├── slide-04-challenges.svg     观点页
├── slide-05-strategy.svg       观点页
├── slide-06-data-overview.svg  图表页
├── slide-07-growth.svg         图表页
├── slide-08-team.svg           观点页
├── slide-09-product.svg        观点页
├── slide-10-roadmap.svg        流程页
├── slide-11-summary.svg        总结页
└── slide-12-ending.svg         结束页

═══════════════════════════════════════════════════════════════════
```

#### 5.2 PPT 导入指南

```
📌 下一步操作：

1. 打开 PowerPoint（2016 或更高版本）
2. 将 SVG 文件拖入幻灯片，或使用「插入 → 图片」
3. 选中 SVG → 右键 → 「转换为形状」
4. 现在可以编辑文字、颜色、位置等

⚠️ 注意事项：
• 转换后可能需要微调字号和位置
• 阴影效果需要在 PPT 中手动添加（格式 → 形状效果 → 阴影）
• 建议保留原始 SVG 作为备份

💡 如需调整单页，可使用:
   /ppt-regenerate --page=3 --style=科技暗黑
```

---

### Phase 6: 导出提示（可选）

SVG 生成完成后，询问用户是否需要导出为 PDF 或 PPTX 格式。

#### 6.1 询问导出格式

```
✅ Phase 5/6 完成：完成报告

📤 是否需要导出为演示文档？

请选择导出格式：
1. PDF - 适合打印和分发
2. PPTX - 适合进一步编辑  
3. 两者都要
4. 跳过导出

请输入选项 [1/2/3/4]:
```

#### 6.2 执行导出

根据用户选择，执行对应的导出脚本：

**PDF 导出**:
```bash
python scripts/export_pdf.py ./ppt-output/
```

**PPTX 导出**:
```bash
node scripts/export_pptx.js ./ppt-output/
```

**输出进度示例**:
```
⏳ 正在导出为 PDF...
✅ PDF 导出完成: ./ppt-output/slides-2024-01-15.pdf (12 页)

⏳ 正在导出为 PPTX...
✅ PPTX 导出完成: ./ppt-output/slides-2024-01-15.pptx (12 张幻灯片)
```

#### 6.3 输出导出结果

```
✅ Phase 6/6 完成：导出文件

📁 生成的文件：
├── ./ppt-output/slide-01-cover.svg
├── ./ppt-output/slide-02-intro.svg
├── ...
├── ./ppt-output/slides-2024-01-15.pdf (12 页)
└── ./ppt-output/slides-2024-01-15.pptx (12 张幻灯片)

🎉 全流程完成！
```

> 💡 如果用户选择「跳过」，直接结束流程。可稍后使用 `/ppt-export` 命令单独导出。

---

## 会话文件结构

执行过程中产生的中间文件：

```
.ppt-session/
├── structure.json    # 页面结构（Phase 2 产出）
├── design.json       # 设计规范（Phase 3 产出）
└── generation.log    # 生成日志（Phase 4 产出，可选）

[output]/              # 默认 ./ppt-output/
├── slide-01-cover.svg
├── slide-02-intro.svg
├── ...
└── slide-XX-ending.svg
```

---

## 错误处理

### 文件不存在

```
❌ 错误：找不到文稿文件

指定的文件 @report.md 不存在。
请检查文件路径是否正确，或使用 @ 重新引用文件。
```

### 风格名称无效

```
⚠️ 警告：未知的风格名称「未来主义」

将使用默认风格「品牌蓝」继续执行。

可用的预设风格：
• 极简主义
• 商务咨询
• 科技暗黑
• 瑞士平面
• 品牌蓝
```

### 生成失败

```
❌ 第 5 页生成失败

错误原因：内容过多，超出页面容量

建议操作：
1. 运行 /ppt-analyze 重新拆解，将此页拆分为 2 页
2. 或手动编辑 .ppt-session/structure.json 调整内容

其他页面已成功生成，可在 ./ppt-output/ 查看。
```

---

## 与分步命令的关系

| 场景 | 推荐命令 |
|------|----------|
| 快速生成，使用预设风格 | `/ppt-quick` ✅ |
| 需要自定义配色 | `/ppt-design` 先自定义 → `/ppt-generate` |
| 需要调整页面拆解 | `/ppt-analyze` 先确认 → `/ppt-design` → `/ppt-generate` |
| AI 智能推荐风格 | `/ppt-design`（选择 AI 推荐模式）→ `/ppt-generate` |
| 重新生成单页 | `/ppt-regenerate --page=N` |

---

## 注意事项

1. **会话目录是临时的**：`.ppt-session/` 可在确认 PPT 满意后删除
2. **风格只能选预设**：如需自定义配色，请使用 `/ppt-design` 分步流程
3. **跳过交互确认**：此命令不会询问页面拆解和风格确认，适合已明确需求的场景
4. **支持重复执行**：多次执行会覆盖之前的输出文件
