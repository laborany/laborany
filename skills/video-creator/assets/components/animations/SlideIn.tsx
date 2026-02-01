/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         SlideIn 滑入动画组件                              ║
 * ║  支持四个方向的滑入效果                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type Direction = "left" | "right" | "up" | "down";

type SlideInProps = {
  children: React.ReactNode;
  /** 滑入方向，默认 "left" */
  direction?: Direction;
  /** 滑动距离（像素），默认 100 */
  distance?: number;
  /** 延迟时间（秒），默认 0 */
  delay?: number;
  /** 是否使用绝对定位填充，默认 true */
  fill?: boolean;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const getTransform = (direction: Direction, distance: number, progress: number): string => {
  const offset = distance * (1 - progress);

  const transforms: Record<Direction, string> = {
    left: `translateX(${-offset}px)`,
    right: `translateX(${offset}px)`,
    up: `translateY(${-offset}px)`,
    down: `translateY(${offset}px)`,
  };

  return transforms[direction];
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const SlideIn: React.FC<SlideInProps> = ({
  children,
  direction = "left",
  distance = 100,
  delay = 0,
  fill = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    delay: delay * fps,
    config: { damping: 200 },
  });

  const transform = getTransform(direction, distance, progress);
  const Wrapper = fill ? AbsoluteFill : "div";

  return (
    <Wrapper style={{ opacity: progress, transform }}>
      {children}
    </Wrapper>
  );
};
