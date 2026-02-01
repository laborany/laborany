/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         FadeIn 淡入动画组件                               ║
 * ║  通用的淡入效果，支持自定义时长和延迟                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type FadeInProps = {
  children: React.ReactNode;
  /** 动画时长（秒），默认 0.5 */
  duration?: number;
  /** 延迟时间（秒），默认 0 */
  delay?: number;
  /** 是否使用绝对定位填充，默认 true */
  fill?: boolean;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const FadeIn: React.FC<FadeInProps> = ({
  children,
  duration = 0.5,
  delay = 0,
  fill = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = delay * fps;
  const endFrame = startFrame + duration * fps;

  const opacity = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const Wrapper = fill ? AbsoluteFill : "div";

  return <Wrapper style={{ opacity }}>{children}</Wrapper>;
};
