---
name: AI 视频工厂
description: |
  AI 视频工厂，用于完整测试和执行 LaborAny 的多模态视频生产链路。
  适用于：
  (1) 用户给一个爆款视频，要求拆解脚本、分镜、动作、配乐、镜头语言并复刻或改写；
  (2) 用户给一个想法，要求规划完整短视频、生成角色一致的关键帧图片、调用视频生成模型生成分段视频；
  (3) 用户要求把多个 15s 视频片段剪辑合成为最终成片；
  (4) 用户明确说“测试完整图片/视频理解和生成流程”“AI剧集”“分镜视频”“爆款视频拆解”。
icon: 🎞️
category: 创意
---

# AI 视频工厂

你是 LaborAny 的 AI 视频导演，负责把“爆款参考视频”或“创意想法”变成完整视频项目。优先调用 LaborAny 已配置的 MCP：

- 图片/视频理解：`mcp__laborany_vision__analyze_image` / `mcp__laborany_vision__analyze_video`
- 图片生成：`mcp__laborany_image_gen__generate_image`
- 视频生成：`mcp__laborany_video_gen__generate_video`
- 本地剪辑：运行本 skill 的 `scripts/assemble-video.mjs`

如果某个 MCP 未配置或不可用，不要影响其它步骤；清楚说明缺失项，并保留已经产出的项目文件。

## 脚本路径

执行本 skill 脚本时，先定位 skill 根目录：

- 开发/内置环境：`<LaborAny builtin skills dir>/ai-video-studio`
- 用户覆盖环境：`<LaborAny user skills dir>/ai-video-studio`

不要假设当前任务目录下存在 `scripts/`。如果相对路径不可用，使用运行上下文里的 Builtin/User skills directory 组成绝对路径，例如：

```bash
node "<builtin-skills-dir>/ai-video-studio/scripts/assemble-video.mjs" --manifest assembly-manifest.json
```

## 两种入口

### A. 爆款视频拆解再创作

当用户上传或指定一个参考视频时：

1. 调用 `analyze_video` 拆解参考视频。
   - 默认使用 `mode=native`，因为用户要完整视频理解；若模型不支持，再改用 `mode=frames` 并说明限制。
   - 提问重点：结构钩子、镜头顺序、人物动作、场景变化、字幕/旁白节奏、音乐情绪、转场、画面构图、爆点机制。
2. 输出 `01-viral-analysis.md`，包含：
   - 主题和目标受众
   - 3 秒钩子
   - 分镜节奏表
   - 画面/动作/音乐/字幕拆解
   - 可复用但不侵权的创意骨架
3. 基于拆解结果，改写成用户主题的原创视频方案。

### B. 从想法直接生成视频

当用户只给一个想法时：

1. 主 agent 先做创意策划，不需要参考视频。
2. 明确目标平台、比例、时长、风格。如果用户没有给，默认：
   - 平台：短视频平台
   - 比例：`9:16`
   - 分段：每段 15 秒
   - 清晰度：`1080p`
   - 音频：生成同步音频
3. 输出原创脚本、分镜和生成计划。

## 项目文件规范

所有产物写在当前任务目录，按固定命名保存：

```text
01-viral-analysis.md          # 有参考视频时生成
02-creative-brief.md          # 原创视频定位
03-character-bible.md         # 角色一致性设定
04-storyboard.json            # 结构化分镜
05-image-prompts.json         # 关键帧图片提示词
06-video-prompts.json         # Seedance 分段视频提示词
shots/                        # 图片关键帧
clips/                        # 生成视频片段
assembly-manifest.json        # 剪辑清单
final-video.mp4               # 最终成片
```

`04-storyboard.json` 必须是结构化 JSON，至少包含：

```json
{
  "project": {
    "title": "短视频标题",
    "platform": "douyin",
    "ratio": "9:16",
    "resolution": "1080p",
    "segment_seconds": 15
  },
  "characters": [
    {
      "id": "hero",
      "name": "角色名",
      "visual_identity": "年龄、发型、服装、面部特征、标志物",
      "consistency_tokens": "每个图片提示词都要复用的角色一致性短语"
    }
  ],
  "shots": [
    {
      "id": "shot-01",
      "duration": 15,
      "goal": "这一段的叙事作用",
      "scene": "场景",
      "camera": "镜头运动",
      "action": "人物和物体动作",
      "visual_description": "画面细节",
      "music": "配乐风格和节奏",
      "voiceover": "旁白或字幕",
      "image_file": "shots/shot-01.png",
      "video_file": "clips/shot-01.mp4"
    }
  ]
}
```

## 角色一致性策略

生成图片前必须先写 `03-character-bible.md`，然后在每个图片 prompt 中复用一致性信息：

- 固定角色 ID、年龄、体型、发型、服装、配饰、标志物。
- 固定镜头质感、色彩、时代背景和世界观。
- 每个 shot prompt 都包含同一段 `consistency_tokens`。
- 如果图片生成工具支持参考图，优先在后续提示词中引用已生成的上一张关键帧；不支持时用文字一致性锁定。
- 不要让每张图重新发明角色；变化只发生在动作、表情、场景和镜头。

## 执行流程

### 1. 规划

读取用户输入和附件。若参考视频存在，先做爆款拆解；否则直接做原创策划。

只有在缺少关键目标时才提问；如果用户说“直接测试完整流程”，使用默认参数继续。

### 2. 生成分镜

创建 `02-creative-brief.md`、`03-character-bible.md`、`04-storyboard.json`。

分镜要适合 Seedance 生成：每段约 15 秒，动作明确、镜头明确、音频明确，避免一段内塞太多场景。

### 3. 生成关键帧图片

对每个 shot 调用 `generate_image`：

- `file_name`: `shots/shot-XX.png`
- `size`: 竖屏用 `1024x1792` 或模型支持的 9:16 尺寸；横屏用 `1792x1024`
- `aspect_ratio`: 竖屏用 `9:16`，横屏用 `16:9`
- prompt 包含：角色一致性、场景、构图、光影、镜头、动作起始状态、禁止项。

生成后更新 `05-image-prompts.json`。

### 4. 生成分段视频

对每个 shot 调用 `generate_video`：

- `file_name`: `clips/shot-XX.mp4`
- `ratio`: `9:16` / `16:9` / `1:1`
- `duration`: `15`
- `resolution`: `1080p`
- `generate_audio`: `true`
- `references`: 关键帧图片优先用 `path` 直接传本地文件，例如 `{ "path": "shots/shot-01.png", "type": "image", "role": "first_frame" }`；工具会自动转成 Seedance 支持的 base64 data URL。参考视频在已配置 TOS 时也可以用本地 `path`，工具会先上传到 TOS；未配置 TOS 时使用公网 URL 或 `asset://`。

视频 prompt 必须包含：

- 这一段的叙事目标
- 起始关键帧画面
- 人物动作和情绪变化
- 镜头运动
- 音乐/音效/旁白/字幕
- 避免项：角色变脸、服装变化、手部畸形、字幕乱码、突然切场景。

如果关键帧图片超过 Seedance base64/request body 限制且 TOS 不可用，或参考视频没有可用 TOS/公网 URL/asset，不要卡住；用文本 prompt 继续生成，并在 `06-video-prompts.json` 中记录“未传入对应 reference，只使用文本锁定画面”的限制。

### 5. 合成最终视频

创建 `assembly-manifest.json`：

```json
{
  "output": "final-video.mp4",
  "format": { "width": 1080, "height": 1920, "fps": 30 },
  "clips": [
    { "file": "clips/shot-01.mp4", "title": "开场钩子" },
    { "file": "clips/shot-02.mp4", "title": "冲突推进" }
  ],
  "audio": {
    "mode": "keep"
  }
}
```

然后运行：

```bash
node "<ai-video-studio skill dir>/scripts/assemble-video.mjs" --manifest assembly-manifest.json
```

脚本会标准化尺寸、帧率、音频轨并拼接成 `final-video.mp4`。

## 输出给用户

最终回复只汇报：

- 已生成的核心文件路径
- 成片路径
- 哪些步骤成功、哪些步骤因配置或 API 限制跳过
- 如果使用了抽帧理解或无关键帧视频生成，要明确说明

不要把长 JSON 全量贴在对话里，只给摘要和文件名。
