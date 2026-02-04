/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         SlideTransition 滑动转场                          ║
 * ║  场景之间的滑动过渡效果                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type Direction = "left" | "right" | "up" | "down";

type SlideTransitionProps = {
  /** 当前场景 */
  currentScene: React.ReactNode;
  /** 下一个场景 */
  nextScene: React.ReactNode;
  /** 滑动方向，默认 "left" */
  direction?: Direction;
  /** 转场时长（秒），默认 0.5 */
  duration?: number;
  /** 转场开始时间（秒） */
  transitionAt: number;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const getTransforms = (
  direction: Direction,
  progress: number,
  width: number,
  height: number
): { current: string; next: string } => {
  const transforms: Record<Direction, { current: string; next: string }> = {
    left: {
      current: `translateX(${-progress * width}px)`,
      next: `translateX(${(1 - progress) * width}px)`,
    },
    right: {
      current: `translateX(${progress * width}px)`,
      next: `translateX(${-(1 - progress) * width}px)`,
    },
    up: {
      current: `translateY(${-progress * height}px)`,
      next: `translateY(${(1 - progress) * height}px)`,
    },
    down: {
      current: `translateY(${progress * height}px)`,
      next: `translateY(${-(1 - progress) * height}px)`,
    },
  };

  return transforms[direction];
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const SlideTransition: React.FC<SlideTransitionProps> = ({
  currentScene,
  nextScene,
  direction = "left",
  duration = 0.5,
  transitionAt,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const transitionStart = transitionAt * fps;
  const transitionEnd = transitionStart + duration * fps;

  const progress = interpolate(frame, [transitionStart, transitionEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const transforms = getTransforms(direction, progress, width, height);
  const showNext = frame >= transitionStart;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* 当前场景 */}
      <AbsoluteFill style={{ transform: transforms.current }}>
        {currentScene}
      </AbsoluteFill>

      {/* 下一场景 */}
      {showNext && (
        <AbsoluteFill style={{ transform: transforms.next }}>
          {nextScene}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
