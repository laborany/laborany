/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         ScaleIn 缩放动画组件                              ║
 * ║  从小到大的缩放入场效果                                                    ║
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
type ScaleInProps = {
  children: React.ReactNode;
  /** 初始缩放比例，默认 0.8 */
  initialScale?: number;
  /** 延迟时间（秒），默认 0 */
  delay?: number;
  /** 是否有弹跳效果，默认 false */
  bounce?: boolean;
  /** 是否使用绝对定位填充，默认 true */
  fill?: boolean;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const ScaleIn: React.FC<ScaleInProps> = ({
  children,
  initialScale = 0.8,
  delay = 0,
  bounce = false,
  fill = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    delay: delay * fps,
    config: bounce ? { damping: 8 } : { damping: 200 },
  });

  const scale = initialScale + (1 - initialScale) * progress;
  const Wrapper = fill ? AbsoluteFill : "div";

  return (
    <Wrapper
      style={{
        opacity: progress,
        transform: `scale(${scale})`,
      }}
    >
      {children}
    </Wrapper>
  );
};
