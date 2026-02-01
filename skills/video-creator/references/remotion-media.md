# Remotion 媒体处理

## 图片

### 使用 `<Img>` 组件

**必须**使用 `remotion` 的 `<Img>` 组件显示图片：

```tsx
import { Img, staticFile } from "remotion";

export const MyComposition = () => {
  return <Img src={staticFile("photo.png")} />;
};
```

### 禁止使用

- ❌ 原生 HTML `<img>` 元素
- ❌ Next.js `<Image>` 组件
- ❌ CSS `background-image`

`<Img>` 组件确保图片在渲染前完全加载，防止闪烁和空白帧。

### 本地图片

将图片放在 `public/` 文件夹，使用 `staticFile()` 引用：

```
my-video/
├─ public/
│  ├─ logo.png
│  ├─ avatar.jpg
│  └─ icon.svg
├─ src/
```

```tsx
<Img src={staticFile("logo.png")} />
```

### 远程图片

```tsx
<Img src="https://example.com/image.png" />
```

### 尺寸和定位

```tsx
<Img
  src={staticFile("photo.png")}
  style={{
    width: 500,
    height: 300,
    position: "absolute",
    top: 100,
    left: 50,
    objectFit: "cover",
  }}
/>
```

### 动态图片路径

```tsx
const frame = useCurrentFrame();

// 图片序列
<Img src={staticFile(`frames/frame${frame}.png`)} />

// 基于 props
<Img src={staticFile(`avatars/${props.userId}.png`)} />
```

---

## 视频

### 前置条件

安装 `@remotion/media`：

```bash
npx remotion add @remotion/media
```

### 基本用法

```tsx
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

<Video src={staticFile("video.mp4")} />

// 远程 URL
<Video src="https://example.com/video.mp4" />
```

### 裁剪

使用 `trimBefore` 和 `trimAfter`（单位：帧）：

```tsx
const { fps } = useVideoConfig();

<Video
  src={staticFile("video.mp4")}
  trimBefore={2 * fps}   // 跳过前 2 秒
  trimAfter={10 * fps}   // 在第 10 秒结束
/>
```

### 延迟播放

```tsx
<Sequence from={1 * fps}>
  <Video src={staticFile("video.mp4")} />
</Sequence>
```

### 音量控制

```tsx
// 静态音量
<Video src={staticFile("video.mp4")} volume={0.5} />

// 动态音量（淡入）
<Video
  src={staticFile("video.mp4")}
  volume={(f) =>
    interpolate(f, [0, 1 * fps], [0, 1], { extrapolateRight: "clamp" })
  }
/>

// 静音
<Video src={staticFile("video.mp4")} muted />
```

### 播放速度

```tsx
<Video src={staticFile("video.mp4")} playbackRate={2} />   {/* 2 倍速 */}
<Video src={staticFile("video.mp4")} playbackRate={0.5} /> {/* 半速 */}
```

### 循环播放

```tsx
<Video src={staticFile("video.mp4")} loop />
```

---

## 字体

### Google Fonts

安装 `@remotion/google-fonts`：

```bash
npx remotion add @remotion/google-fonts
```

```tsx
import { loadFont } from "@remotion/google-fonts/Roboto";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

<div style={{ fontFamily }}>Hello World</div>
```

### 本地字体

安装 `@remotion/fonts`：

```bash
npx remotion add @remotion/fonts
```

```tsx
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

await loadFont({
  family: "MyFont",
  url: staticFile("MyFont-Regular.woff2"),
});

<div style={{ fontFamily: "MyFont" }}>Hello World</div>
```

### 多字重

```tsx
await Promise.all([
  loadFont({
    family: "Inter",
    url: staticFile("Inter-Regular.woff2"),
    weight: "400",
  }),
  loadFont({
    family: "Inter",
    url: staticFile("Inter-Bold.woff2"),
    weight: "700",
  }),
]);
```

---

## GIF

安装 `@remotion/gif`：

```bash
npx remotion add @remotion/gif
```

```tsx
import { Gif } from "@remotion/gif";
import { staticFile } from "remotion";

<Gif src={staticFile("animation.gif")} />
```

---

## 获取媒体信息

### 图片尺寸

```tsx
import { getImageDimensions, staticFile } from "remotion";

const { width, height } = await getImageDimensions(staticFile("photo.png"));
```

### 视频时长

需要 `@remotion/media-utils`：

```tsx
import { getVideoMetadata } from "@remotion/media-utils";

const { durationInSeconds, width, height } = await getVideoMetadata(
  staticFile("video.mp4")
);
```

### 音频时长

```tsx
import { getAudioDurationInSeconds } from "@remotion/media-utils";

const duration = await getAudioDurationInSeconds(staticFile("audio.mp3"));
```
