/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Typewriter 打字机效果组件                         ║
 * ║  逐字符显示文字，带可选光标                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type TypewriterProps = {
  /** 要显示的文字 */
  text: string;
  /** 每秒显示的字符数，默认 15 */
  charsPerSecond?: number;
  /** 延迟时间（秒），默认 0 */
  delay?: number;
  /** 是否显示光标，默认 true */
  showCursor?: boolean;
  /** 光标字符，默认 "|" */
  cursorChar?: string;
  /** 文字样式 */
  style?: React.CSSProperties;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const Typewriter: React.FC<TypewriterProps> = ({
  text,
  charsPerSecond = 15,
  delay = 0,
  showCursor = true,
  cursorChar = "|",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 计算当前应显示的字符数
  const delayFrames = delay * fps;
  const effectiveFrame = Math.max(0, frame - delayFrames);
  const charsToShow = Math.floor((effectiveFrame / fps) * charsPerSecond);

  // 截取文字
  const displayText = text.slice(0, Math.min(charsToShow, text.length));

  // 光标闪烁（每 0.5 秒切换）
  const cursorVisible = showCursor && Math.floor(frame / (fps * 0.5)) % 2 === 0;

  // 判断是否打字完成
  const isComplete = charsToShow >= text.length;

  return (
    <span style={style}>
      {displayText}
      {showCursor && (!isComplete || cursorVisible) && (
        <span style={{ opacity: cursorVisible ? 1 : 0 }}>{cursorChar}</span>
      )}
    </span>
  );
};
