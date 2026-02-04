/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         TitleSlide 标题页组件                             ║
 * ║  全屏标题页，支持主标题、副标题和 Logo                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import {
  AbsoluteFill,
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type TitleSlideProps = {
  /** 主标题 */
  title: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** Logo 文件名（放在 public 目录） */
  logo?: string;
  /** 背景颜色 */
  backgroundColor?: string;
  /** 标题颜色 */
  titleColor?: string;
  /** 副标题颜色 */
  subtitleColor?: string;
  /** 标题字体大小，默认 72 */
  titleSize?: number;
  /** 副标题字体大小，默认 32 */
  subtitleSize?: number;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const TitleSlide: React.FC<TitleSlideProps> = ({
  title,
  subtitle,
  logo,
  backgroundColor = "#1a1a2e",
  titleColor = "#ffffff",
  subtitleColor = "#a0a0a0",
  titleSize = 72,
  subtitleSize = 32,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo 动画
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  // 标题动画（延迟 0.3 秒）
  const titleProgress = spring({
    frame,
    fps,
    delay: 0.3 * fps,
    config: { damping: 200 },
  });

  // 副标题动画（延迟 0.5 秒）
  const subtitleProgress = spring({
    frame,
    fps,
    delay: 0.5 * fps,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Logo */}
      {logo && (
        <Img
          src={staticFile(logo)}
          style={{
            width: 120,
            height: 120,
            marginBottom: 40,
            opacity: logoProgress,
            transform: `scale(${logoProgress})`,
          }}
        />
      )}

      {/* 主标题 */}
      <h1
        style={{
          color: titleColor,
          fontSize: titleSize,
          fontWeight: 700,
          margin: 0,
          textAlign: "center",
          opacity: titleProgress,
          transform: `translateY(${30 * (1 - titleProgress)}px)`,
        }}
      >
        {title}
      </h1>

      {/* 副标题 */}
      {subtitle && (
        <p
          style={{
            color: subtitleColor,
            fontSize: subtitleSize,
            fontWeight: 400,
            margin: 0,
            textAlign: "center",
            opacity: subtitleProgress,
            transform: `translateY(${20 * (1 - subtitleProgress)}px)`,
          }}
        >
          {subtitle}
        </p>
      )}
    </AbsoluteFill>
  );
};
