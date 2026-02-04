# Remotion 核心概念

## 概述

Remotion 是一个基于 React 的视频创作框架，允许使用 React 组件来创建视频。

---

## 核心原则

### 1. 帧驱动动画

所有动画**必须**由 `useCurrentFrame()` 驱动。

```tsx
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const FadeIn = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 2 秒内从 0 淡入到 1
  const opacity = interpolate(frame, [0, 2 * fps], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return <div style={{ opacity }}>Hello World!</div>;
};
```

### 2. 禁止使用 CSS 动画

- ❌ CSS transitions
- ❌ CSS animations
- ❌ Tailwind 动画类名

这些在渲染时**不会正确工作**。

---

## Composition 定义

`<Composition>` 定义可渲染视频的组件、尺寸、帧率和时长。

```tsx
import { Composition } from 'remotion';
import { MyVideo } from './MyVideo';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyVideo"
      component={MyVideo}
      durationInFrames={300}  // 10 秒 @ 30fps
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
```

### 默认 Props

```tsx
<Composition
  id="MyVideo"
  component={MyVideo}
  durationInFrames={300}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{
    title: 'Hello World',
    color: '#ff0000',
  }}
/>
```

### 动态元数据

使用 `calculateMetadata` 动态设置尺寸、时长或 props：

```tsx
const calculateMetadata = async ({ props }) => {
  const data = await fetch(`/api/video/${props.videoId}`).then(r => r.json());
  return {
    durationInFrames: Math.ceil(data.duration * 30),
    props: { ...props, videoUrl: data.url },
  };
};

<Composition
  id="MyVideo"
  component={MyVideo}
  calculateMetadata={calculateMetadata}
  // ...
/>
```

---

## Sequence 序列

使用 `<Sequence>` 控制元素在时间线上的出现时机。

```tsx
import { Sequence, useVideoConfig } from "remotion";

const { fps } = useVideoConfig();

// 标题在 1 秒后出现，持续 2 秒
<Sequence from={1 * fps} durationInFrames={2 * fps}>
  <Title />
</Sequence>

// 副标题在 2 秒后出现
<Sequence from={2 * fps} durationInFrames={2 * fps}>
  <Subtitle />
</Sequence>
```

### 预挂载

**始终预挂载 Sequence**，确保组件提前加载：

```tsx
<Sequence from={1 * fps} premountFor={1 * fps}>
  <Title />
</Sequence>
```

### 布局控制

默认情况下，Sequence 会将子组件包装在绝对定位容器中。使用 `layout="none"` 禁用：

```tsx
<Sequence layout="none">
  <Title />
</Sequence>
```

---

## Series 系列

使用 `<Series>` 让元素依次播放，无重叠：

```tsx
import { Series } from 'remotion';

<Series>
  <Series.Sequence durationInFrames={45}>
    <Intro />
  </Series.Sequence>
  <Series.Sequence durationInFrames={60}>
    <MainContent />
  </Series.Sequence>
  <Series.Sequence durationInFrames={30}>
    <Outro />
  </Series.Sequence>
</Series>
```

### 重叠序列

使用负偏移实现重叠：

```tsx
<Series>
  <Series.Sequence durationInFrames={60}>
    <SceneA />
  </Series.Sequence>
  <Series.Sequence offset={-15} durationInFrames={60}>
    {/* 在 SceneA 结束前 15 帧开始 */}
    <SceneB />
  </Series.Sequence>
</Series>
```

---

## 帧引用

在 Sequence 内部，`useCurrentFrame()` 返回**局部帧**（从 0 开始）：

```tsx
<Sequence from={60} durationInFrames={30}>
  <MyComponent />
  {/* MyComponent 内 useCurrentFrame() 返回 0-29，而非 60-89 */}
</Sequence>
```

---

## 文件夹组织

使用 `<Folder>` 在侧边栏组织 compositions：

```tsx
import { Composition, Folder } from 'remotion';

<Folder name="Marketing">
  <Composition id="Promo" /* ... */ />
  <Composition id="Ad" /* ... */ />
</Folder>
<Folder name="Social">
  <Folder name="Instagram">
    <Composition id="Story" /* ... */ />
    <Composition id="Reel" /* ... */ />
  </Folder>
</Folder>
```

---

## 静态图片

使用 `<Still>` 创建单帧图片，无需 `durationInFrames` 或 `fps`：

```tsx
import { Still } from 'remotion';
import { Thumbnail } from './Thumbnail';

<Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
```
