# /ppt-generate 命令 - SVG 批量生成

## 命令说明

根据页面结构和设计规范，批量生成符合 PPT 兼容性要求的 SVG 文件。

## 触发方式

```
/ppt-generate
```

或者用户说：
- "生成 SVG 文件"
- "开始生成 PPT"
- "批量生成所有页面"

## 前置条件

生成前需要确认以下信息已准备好：

| 信息 | 来源 | 必需 |
|------|------|------|
| 页面结构 | `/ppt-analyze` 输出 | ✅ |
| 设计规范 | `/ppt-design` 输出 | ✅ |
| 输出目录 | 默认 `./ppt-output/` | 可选 |

如果缺少前置信息，提示用户先执行相应命令，或引导用户快速提供。

## 执行流程

### Step 1: 确认生成配置

```
🚀 准备生成 SVG 文件

📋 生成配置：
- 总页数: [X] 页
- 风格: [风格名称]
- 输出目录: ./ppt-output/
- 文件命名: slide-01-cover.svg, slide-02-intro.svg ...

⚙️ 将应用以下 PPT 兼容性规范：
┌────────────────────────────────────────────────────────────────┐
│ 1️⃣ 圆角矩形: 使用 <path> + 贝塞尔曲线，避免 rx 属性丢失       │
│ 2️⃣ 字体优先: Microsoft YaHei, SimHei, PingFang SC            │
│ 3️⃣ 文字定位: 使用 style 属性，手动计算居中位置                 │
│ 4️⃣ 颜色格式: #RRGGBB + fill-opacity，避免 rgba()             │
│ 5️⃣ 阴影效果: 移除 filter，在 PPT 中手动添加                   │
└────────────────────────────────────────────────────────────────┘

确认开始生成？[Y/n]
```

### Step 2: 创建输出目录

```bash
mkdir -p ./ppt-output
```

### Step 3: 逐页生成 SVG

对于每一页，按以下流程生成：

#### 3.1 确定页面类型

根据页面清单中的类型，加载对应的模板：
- 封面页 → [page-templates.md#封面页](../specs/page-templates.md)
- 观点页 → [page-templates.md#观点页](../specs/page-templates.md)
- 图表页 → [page-templates.md#图表页](../specs/page-templates.md)
- 流程页 → [page-templates.md#流程页](../specs/page-templates.md)
- 总结页 → [page-templates.md#总结页](../specs/page-templates.md)
- 结束页 → [page-templates.md#结束页](../specs/page-templates.md)

#### 3.2 应用设计规范

- 应用配色方案
- 应用字体规范
- 应用间距系统

#### 3.3 填充内容

- 根据页面清单中的内容要点
- 生成标题、正文、要点列表等
- 添加视觉元素（图表、图标、装饰等）

#### 3.4 应用兼容性规范

**必须严格遵循**（参考 [svg-compatibility.md](../specs/svg-compatibility.md)）：

```xml
<!-- ❌ 错误写法 -->
<rect rx="24" fill="rgba(1,107,255,0.1)"/>
<text text-anchor="middle" dominant-baseline="middle">文字</text>

<!-- ✅ 正确写法 -->
<path d="M24,0 L...Z" fill="#016BFF" fill-opacity="0.1"/>
<text style="font-family:Microsoft YaHei,SimHei,sans-serif;">文字</text>
```

#### 3.5 SVG 基础结构

每个 SVG 文件的基础结构：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <!-- 渐变定义 -->
    <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="[主色]" stop-opacity="1"/>
      <stop offset="100%" stop-color="[次色]" stop-opacity="1"/>
    </linearGradient>
  </defs>
  
  <!-- 背景 -->
  <rect width="1920" height="1080" fill="[背景色]"/>
  
  <!-- ========== 页面内容 ========== -->
  
  <!-- [在此生成具体内容] -->
  
  <!-- ========== 页面内容结束 ========== -->
  
  <!-- 页码 -->
  <text x="1840" y="1040" style="font-family:Microsoft YaHei,SimHei,sans-serif;" font-size="18" fill="[次要文字色]" text-anchor="end">
    [当前页]/[总页数]
  </text>
</svg>
```

#### 3.6 保存文件

文件命名规则：
```
slide-[页码两位数]-[页面类型英文].svg

示例：
slide-01-cover.svg
slide-02-intro.svg
slide-03-identity-first.svg
slide-04-behavior-goal.svg
...
```

### Step 4: 生成进度反馈

每生成一页，输出进度：

```
⏳ 正在生成...

✅ [1/14] slide-01-cover.svg - 封面页
✅ [2/14] slide-02-intro.svg - 引言页
✅ [3/14] slide-03-identity-first.svg - 观点页：身份先于行动
🔄 [4/14] slide-04-behavior-goal.svg - 生成中...
```

### Step 5: 生成完成汇总

```
🎉 生成完成！

📁 输出目录: ./ppt-output/

📄 文件列表:
├── slide-01-cover.svg (封面)
├── slide-02-intro.svg (引言)
├── slide-03-identity-first.svg (观点1)
├── slide-04-behavior-goal.svg (观点2)
├── slide-05-identity-cycle.svg (观点3)
├── slide-06-nine-stages.svg (图表)
├── slide-07-cybernetics.svg (观点4)
├── slide-08-protocol-overview.svg (过渡)
├── slide-09-morning-protocol.svg (流程1)
├── slide-10-daytime-protocol.svg (流程2)
├── slide-11-evening-protocol.svg (流程3)
├── slide-12-gamification.svg (观点5)
├── slide-13-conclusion.svg (总结)
└── slide-14-ending.svg (结束)

📌 下一步操作：
1. 打开 PowerPoint
2. 将 SVG 文件拖入幻灯片
3. 右键 → "转换为形状"
4. 微调文字和布局

⚠️ 注意事项：
- 转换后可能需要微调字号和位置
- 阴影效果需要在 PPT 中手动添加
- 建议保留原始 SVG 作为备份
```

### Step 6: 导出提示

生成完成后，询问用户是否需要导出为 PDF 或 PPTX 格式：

```
📤 是否需要导出为演示文档？

请选择导出格式：
1. PDF - 适合打印和分发
2. PPTX - 适合进一步编辑
3. 两者都要
4. 跳过导出

请输入选项 [1/2/3/4]:
```

#### 6.1 导出为 PDF

```bash
python scripts/export_pdf.py ./ppt-output/
```

输出示例：
```
📄 Found 14 SVG file(s)
  [1/14] Converting slide-01-cover.svg... ✅
  [2/14] Converting slide-02-intro.svg... ✅
  ...
✅ PDF exported: ./ppt-output/slides-2024-01-15.pdf (14 pages)
```

#### 6.2 导出为 PPTX

```bash
node scripts/export_pptx.js ./ppt-output/
```

输出示例：
```
📊 Creating presentation with 14 slide(s)...
  ✓ Added: slide-01-cover.svg
  ✓ Added: slide-02-intro.svg
  ...
✅ PPTX exported: ./ppt-output/slides-2024-01-15.pptx (14 slides)
```

#### 6.3 导出完成

```
🎉 导出完成！

📁 生成的文件：
├── ./ppt-output/slides-2024-01-15.pdf
└── ./ppt-output/slides-2024-01-15.pptx

💡 提示：您也可以稍后使用 /ppt-export 命令单独导出
```

> 💡 如果用户选择「跳过」，直接结束流程，提示可稍后使用 `/ppt-export` 命令。

## 输出规范

### 文件结构

```
./ppt-output/
├── slide-01-cover.svg
├── slide-02-intro.svg
├── slide-03-xxx.svg
├── ...
└── slide-[N]-ending.svg
```

### SVG 质量检查

生成后自动检查：

| 检查项 | 要求 |
|--------|------|
| 文件编码 | UTF-8 |
| 尺寸 | 1920 × 1080 |
| 字体 | Microsoft YaHei 优先 |
| 颜色格式 | #RRGGBB |
| 圆角实现 | path + 贝塞尔曲线 |

## 错误处理

### 常见问题

| 问题 | 解决方案 |
|------|---------|
| 缺少页面结构 | 提示先执行 `/ppt-analyze` |
| 缺少设计规范 | 提示先执行 `/ppt-design` |
| 输出目录无权限 | 提示用户指定其他目录 |
| 单页内容过多 | 建议拆分为多页 |

### 重新生成

如果某页效果不理想，用户可以：

```
请重新生成第 3 页，我想要：
- 使用冰山隐喻的视觉表达
- 左右分栏布局
- 加入对比卡片
```

仅重新生成指定页面，不影响其他页面。

## 注意事项

1. **保持一致性**：所有页面风格统一
2. **兼容性优先**：严格遵循 PPT 兼容规范
3. **进度反馈**：让用户知道生成进度
4. **错误容忍**：单页失败不影响其他页面
5. **可追溯**：保留生成记录便于调整
