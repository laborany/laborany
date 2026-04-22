# LaborAny 设计大师 (`laborany-design`) · 集成说明

本目录是 LaborAny 内置的「设计大师」skill。基于开源 [`huashu-design`](https://github.com/alchaincyf/huashu-design)（作者：alchaincyf / 花叔）改编，原作者授权与署名见 [`CREDITS.md`](./CREDITS.md) 和 [`LICENSE`](./LICENSE)。

完整能力文档见 [`SKILL.md`](./SKILL.md)。这里只讲**集成 / 打包 / 运行时**相关。

## 它和邻居 skill 的分工

| Skill | 适用场景 |
|---|---|
| `frontend-design` | 通用前端品味提示词，无脚本 |
| **`laborany-design`** | **HTML 做高保真原型 / 幻灯片 / 动画 / 视频，重脚本+资产** |
| `video-creator` | 用 Remotion (React + 程序化) 做视频 |
| `ppt-svg-generator` | 纯 SVG 做 PPT |

## 运行时依赖

| 依赖 | 来源 | 说明 |
|---|---|---|
| Node 22+ | LaborAny 内置 cli-bundle | 已就位 |
| `playwright` / `pdf-lib` / `pptxgenjs` / `sharp` | `node_modules/`（已 check-in 到 git） | 安装即用 |
| **Chrome / Chromium** | **复用用户系统** | Playwright 不下载 Chromium，通过 `scripts/resolve-runtime.mjs` 找本地 Chrome |
| ffmpeg | `ffmpeg-bundle-{platform}/` 多平台二进制 | 由 `scripts/fetch-ffmpeg-bundles.mjs` 拉取，由 Electron 主进程注入 `LABORANY_FFMPEG` |
| Python | LaborAny 内置 uv-bundle | `verify.py` 用 |

### 用户没装 Chrome 怎么办？

`scripts/resolve-runtime.mjs#requireChrome()` 找不到时会打印清晰错误 + 官网下载链接（`https://www.google.com/chrome/`），并以非零状态码退出。Edge / Chromium 也可用。

## 打包流程

```bash
# 1. 安装 npm 依赖（仅首次或更新依赖时）
cd skills/laborany-design && npm install

# 2. 拉取 ffmpeg 二进制（CI 打 release 前）
node scripts/fetch-ffmpeg-bundles.mjs --platform=all

# 3. 正常 electron-builder 流程
npm run build:electron:mac     # 或 :linux / :electron (win)
```

`package.json` 的 `extraResources` 已经把以下东西打进各平台包：

- `skills/laborany-design/`（含 `node_modules/`、`assets/` 33MB BGM）
- 对应平台的 `ffmpeg-bundle-*/` （Win → `resources/ffmpeg-bundle/ffmpeg.exe`，Mac → `resources/ffmpeg-bundle-darwin-{arm64,x64}/ffmpeg`，Linux → `resources/ffmpeg-bundle/ffmpeg`）

## 本地开发

```bash
# 在本机直接跑 skill 脚本（需要本地装 Chrome 和 ffmpeg）
cd skills/laborany-design
node scripts/render-video.mjs --html=demos/c3-motion-design.html --duration=10 --out=test.mp4
node scripts/add-music.mjs test.mp4 --mood=tech
node scripts/convert-formats.mjs test-bgm.mp4 960
```

## 改动了哪些上游脚本

为了在 LaborAny 多平台 + 离线场景下跑通，我们做了：

1. 新增 `scripts/resolve-runtime.mjs` — Chrome / ffmpeg 路径解析 helper
2. `export_deck_pdf.mjs` / `export_deck_stage_pdf.mjs` / `render-video.js` / `html2pptx.js` — Playwright `chromium.launch()` 改为 `{ executablePath: requireChrome() }`
3. `render-video.js` — ffmpeg 路径改用 `requireFfmpeg()` 解析
4. 新增 `scripts/add-music.mjs` 和 `scripts/convert-formats.mjs`，原 `.sh` 文件保留为 wrapper，跨 Windows 干净
5. 文案去个人品牌化（"花叔" → "LaborAny 设计大师"），原作者署名集中到 `CREDITS.md`

## 烟雾测试 (TODO)

- [ ] PDF 导出：`node scripts/export_deck_pdf.mjs --slides demos/ --out /tmp/test.pdf`
- [ ] PPTX 导出：`node scripts/export_deck_pptx.mjs --slides demos/ --out /tmp/test.pptx`
- [ ] 视频导出：`node scripts/render-video.js demos/c3-motion-design.html`
- [ ] 加 BGM：`node scripts/add-music.mjs <video.mp4> --mood=tech`
- [ ] 转 60fps + GIF：`node scripts/convert-formats.mjs <video.mp4>`
