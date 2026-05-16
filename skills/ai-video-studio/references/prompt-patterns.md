# 提示词模式

## 图片关键帧 Prompt

使用结构：

```text
[角色一致性短语]
Scene: ...
Composition: ...
Camera/lens: ...
Lighting/color: ...
Action starting state: ...
Style: cinematic, coherent character design, high detail
Negative: different face, different outfit, deformed hands, extra fingers, unreadable text, watermark, logo
```

## Seedance 视频 Prompt

使用结构：

```text
Create a 15-second vertical cinematic video.
Starting frame: [关键帧描述]
Character consistency: [角色一致性短语]
Scene and atmosphere: ...
Action timeline:
0-3s: ...
3-8s: ...
8-15s: ...
Camera: ...
Music/audio: ...
Voice/subtitles: ...
Avoid: face changes, outfit changes, malformed hands, text artifacts, sudden scene cuts.
```

## 爆款拆解问题

给 `analyze_video` 的 query 可使用：

```text
请完整拆解这个短视频，重点分析：
1. 前 3 秒钩子如何建立注意力；
2. 每个镜头的画面、人物动作、机位、景别、运镜、转场；
3. 配乐、音效、节奏点、旁白和字幕如何配合；
4. 情绪曲线和信息释放顺序；
5. 可以迁移到新主题的创意骨架，避免逐字逐镜头抄袭。
请按时间轴输出，并给出可复用的原创改写建议。
```
