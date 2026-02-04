# Remotion 动画与特效

## 插值动画

### 基本插值

```tsx
import { interpolate, useCurrentFrame } from 'remotion';

const frame = useCurrentFrame();

// 100 帧内从 0 到 1
const opacity = interpolate(frame, [0, 100], [0, 1]);
```

### 钳制值

默认情况下，值不会被钳制。使用 `extrapolate` 选项：

```tsx
const opacity = interpolate(frame, [0, 100], [0, 1], {
  extrapolateRight: 'clamp',
  extrapolateLeft: 'clamp',
});
```

---

## Spring 弹簧动画

Spring 动画具有更自然的运动效果，从 0 到 1。

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const scale = spring({
  frame,
  fps,
});
```

### 物理属性

默认配置：`mass: 1, damping: 10, stiffness: 100`（有轻微弹跳）

常用配置：

```tsx
// 平滑无弹跳（适合微妙的显示效果）
const smooth = { damping: 200 };

// 快速响应，最小弹跳（适合 UI 元素）
const snappy = { damping: 20, stiffness: 200 };

// 弹跳入场（适合活泼动画）
const bouncy = { damping: 8 };

// 厚重缓慢，小幅弹跳
const heavy = { damping: 15, stiffness: 80, mass: 2 };
```

### 延迟

```tsx
const entrance = spring({
  frame,
  fps,
  delay: 20,  // 延迟 20 帧
});
```

### 指定时长

```tsx
const anim = spring({
  frame,
  fps,
  durationInFrames: 40,  // 拉伸到 40 帧
});
```

### 组合 spring 和 interpolate

```tsx
const springProgress = spring({ frame, fps });

// 映射到旋转
const rotation = interpolate(springProgress, [0, 1], [0, 360]);

<div style={{ rotate: rotation + 'deg' }} />
```

### 叠加 spring

```tsx
const { fps, durationInFrames } = useVideoConfig();

const inAnimation = spring({ frame, fps });
const outAnimation = spring({
  frame,
  fps,
  durationInFrames: 1 * fps,
  delay: durationInFrames - 1 * fps,
});

const scale = inAnimation - outAnimation;
```

---

## Easing 缓动

```tsx
import { interpolate, Easing } from 'remotion';

const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.inOut(Easing.quad),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

### 缓动类型

**凸度**：
- `Easing.in` - 慢启动，加速
- `Easing.out` - 快启动，减速
- `Easing.inOut` - 两端慢，中间快

**曲线**（从最线性到最弯曲）：
- `Easing.quad`
- `Easing.sin`
- `Easing.exp`
- `Easing.circle`

### 贝塞尔曲线

```tsx
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.bezier(0.8, 0.22, 0.96, 0.65),
});
```

---

## 场景转场

### 前置条件

安装 `@remotion/transitions`：

```bash
npx remotion add @remotion/transitions
```

### 基本用法

```tsx
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneA />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: 15 })}
  />
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneB />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

### 可用转场类型

```tsx
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { clockWipe } from '@remotion/transitions/clock-wipe';
```

### 滑动方向

```tsx
<TransitionSeries.Transition
  presentation={slide({ direction: 'from-left' })}
  timing={linearTiming({ durationInFrames: 20 })}
/>
```

方向选项：`"from-left"`, `"from-right"`, `"from-top"`, `"from-bottom"`

### 时间选项

```tsx
import { linearTiming, springTiming } from '@remotion/transitions';

// 线性时间 - 恒定速度
linearTiming({ durationInFrames: 20 });

// 弹簧时间 - 有机运动
springTiming({ config: { damping: 200 }, durationInFrames: 25 });
```

### 时长计算

转场会重叠相邻场景，总时长**短于**所有序列时长之和。

例如，两个 60 帧序列 + 15 帧转场：
- 无转场：`60 + 60 = 120` 帧
- 有转场：`60 + 60 - 15 = 105` 帧

---

## 文字动画

### 打字机效果

基于 `useCurrentFrame()` 逐字符截取字符串：

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const text = "Hello World";
const charsPerSecond = 10;
const charsToShow = Math.floor(frame / fps * charsPerSecond);
const displayText = text.slice(0, charsToShow);

<div>{displayText}</div>
```

**始终使用字符串切片**，不要使用逐字符透明度。

### 文字高亮

使用 `background` 和 `background-size` 实现荧光笔效果：

```tsx
const progress = spring({ frame, fps, config: { damping: 200 } });

<span
  style={{
    background: 'linear-gradient(to right, yellow 50%, transparent 50%)',
    backgroundSize: `${200 * progress}% 100%`,
    backgroundPosition: 'left',
  }}
>
  重要文字
</span>
```

---

## 图表动画

### 柱状图

```tsx
const STAGGER_DELAY = 5;
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const bars = data.map((item, i) => {
  const delay = i * STAGGER_DELAY;
  const height = spring({
    frame,
    fps,
    delay,
    config: { damping: 200 },
  });
  return <div style={{ height: height * item.value }} />;
});
```

### 饼图

使用 `stroke-dashoffset` 动画：

```tsx
const progress = interpolate(frame, [0, 100], [0, 1]);
const circumference = 2 * Math.PI * radius;
const segmentLength = (value / total) * circumference;
const offset = interpolate(progress, [0, 1], [segmentLength, 0]);

<circle
  r={radius}
  cx={center}
  cy={center}
  fill="none"
  stroke={color}
  strokeWidth={strokeWidth}
  strokeDasharray={`${segmentLength} ${circumference}`}
  strokeDashoffset={offset}
  transform={`rotate(-90 ${center} ${center})`}
/>
```

### 重要提示

- ❌ 禁用第三方库的动画
- ✅ 所有动画必须由 `useCurrentFrame()` 驱动
- 第三方库动画会在渲染时导致闪烁
