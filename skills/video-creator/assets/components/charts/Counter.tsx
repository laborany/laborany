/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Counter 数字计数器组件                            ║
 * ║  数字滚动效果，从 0 增长到目标值                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type CounterProps = {
  /** 目标数值 */
  value: number;
  /** 动画时长（秒），默认 1.5 */
  duration?: number;
  /** 延迟时间（秒），默认 0 */
  delay?: number;
  /** 小数位数，默认 0 */
  decimals?: number;
  /** 前缀，如 "$" */
  prefix?: string;
  /** 后缀，如 "%" */
  suffix?: string;
  /** 千分位分隔符，默认 "," */
  separator?: string;
  /** 文字样式 */
  style?: React.CSSProperties;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const formatNumber = (
  num: number,
  decimals: number,
  separator: string
): string => {
  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");

  // 添加千分位分隔符
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);

  return decPart ? `${formatted}.${decPart}` : formatted;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const Counter: React.FC<CounterProps> = ({
  value,
  duration = 1.5,
  delay = 0,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = ",",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = delay * fps;
  const endFrame = startFrame + duration * fps;

  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 使用缓动函数让数字增长更自然
  const easedProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
  const currentValue = value * easedProgress;

  const displayValue = formatNumber(currentValue, decimals, separator);

  return (
    <span style={style}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
};
