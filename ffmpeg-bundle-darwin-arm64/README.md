# ffmpeg bundles · LaborAny 设计大师 skill

`laborany-design` skill 在做 **HTML→MP4/GIF 视频导出** 和 **音频混音 (BGM)** 时依赖 ffmpeg。
为了让安装包真正"开箱即用"，我们在每个平台的 electron-builder 包里塞了一份对应平台的 ffmpeg 静态二进制。

## 目录约定

```
ffmpeg-bundle-darwin-arm64/ffmpeg
ffmpeg-bundle-darwin-x64/ffmpeg
ffmpeg-bundle-linux-x64/ffmpeg
ffmpeg-bundle-win-x64/ffmpeg.exe
```

> 二进制本身不入 git（每个 ~70-100MB，4 个加起来太大）。CI/打包前必须先跑 fetch 脚本。

## 准备本地 / CI 环境

```bash
# 只下当前平台（开发/调试用）
node scripts/fetch-ffmpeg-bundles.mjs

# 下全部 4 个平台（CI 打 release 前用）
node scripts/fetch-ffmpeg-bundles.mjs --platform=all
```

下载源：[`eugeneware/ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) v6.1.1（基于官方 BtbN LGPL 静态构建）。

## 运行时如何被找到

主进程启动时把对应平台的 ffmpeg 路径注入环境变量 `LABORANY_FFMPEG`，
skill 脚本通过 `scripts/resolve-runtime.mjs` 读取，找不到就 fallback 到 PATH 里的 `ffmpeg`。

## License

ffmpeg 本体遵循 LGPL/GPL，详见各 `ffmpeg-bundle-*/` 内随包附带的 LICENSE 文件，
或 https://ffmpeg.org/legal.html
