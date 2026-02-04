/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         FadeTransition 淡入淡出转场                       ║
 * ║  场景之间的淡入淡出过渡效果                                                ║
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
type FadeTransitionProps = {
  /** 当前场景 */
  currentScene: React.ReactNode;
  /** 下一个场景 */
  nextScene: React.ReactNode;
  /** 转场时长（秒），默认 0.5 */
  duration?: number;
  /** 转场开始时间（秒） */
  transitionAt: number;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const FadeTransition: React.FC<FadeTransitionProps> = ({
  currentScene,
  nextScene,
  duration = 0.5,
  transitionAt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const transitionStart = transitionAt * fps;
  const transitionEnd = transitionStart + duration * fps;

  const progress = interpolate(frame, [transitionStart, transitionEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 转场前显示当前场景，转场后显示下一场景
  const showNext = frame >= transitionStart;

  return (
    <AbsoluteFill>
      {/* 当前场景 */}
      <AbsoluteFill style={{ opacity: 1 - progress }}>
        {currentScene}
      </AbsoluteFill>

      {/* 下一场景 */}
      {showNext && (
        <AbsoluteFill style={{ opacity: progress }}>
          {nextScene}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
