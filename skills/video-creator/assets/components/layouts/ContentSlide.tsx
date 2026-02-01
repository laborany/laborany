/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         ContentSlide 内容页组件                           ║
 * ║  标题 + 要点列表的内容页布局                                               ║
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
type ContentSlideProps = {
  /** 页面标题 */
  title: string;
  /** 要点列表 */
  points: string[];
  /** 背景颜色 */
  backgroundColor?: string;
  /** 标题颜色 */
  titleColor?: string;
  /** 内容颜色 */
  textColor?: string;
  /** 强调色（用于要点符号） */
  accentColor?: string;
  /** 交错延迟（帧），默认 8 */
  staggerDelay?: number;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const ContentSlide: React.FC<ContentSlideProps> = ({
  title,
  points,
  backgroundColor = "#ffffff",
  titleColor = "#1a1a2e",
  textColor = "#333333",
  accentColor = "#4361ee",
  staggerDelay = 8,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 标题动画
  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        padding: 80,
        flexDirection: "column",
      }}
    >
      {/* 标题 */}
      <h2
        style={{
          color: titleColor,
          fontSize: 56,
          fontWeight: 700,
          margin: 0,
          marginBottom: 60,
          opacity: titleProgress,
          transform: `translateX(${-50 * (1 - titleProgress)}px)`,
        }}
      >
        {title}
      </h2>

      {/* 要点列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        {points.map((point, index) => {
          const pointProgress = spring({
            frame,
            fps,
            delay: 0.3 * fps + index * staggerDelay,
            config: { damping: 200 },
          });

          return (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
                opacity: pointProgress,
                transform: `translateX(${-30 * (1 - pointProgress)}px)`,
              }}
            >
              {/* 要点符号 */}
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: accentColor,
                  marginTop: 12,
                  flexShrink: 0,
                  transform: `scale(${pointProgress})`,
                }}
              />

              {/* 要点文字 */}
              <p
                style={{
                  color: textColor,
                  fontSize: 32,
                  fontWeight: 400,
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {point}
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
