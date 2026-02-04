/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         主视频 Composition                               ║
 * ║  这是视频的主入口组件，包含所有场景的编排                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props Schema                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const mainSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  backgroundColor: z.string(),
  textColor: z.string(),
  accentColor: z.string(),
});

export type MainProps = z.infer<typeof mainSchema>;

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const Main: React.FC<MainProps> = ({
  title,
  subtitle,
  backgroundColor,
  textColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  /* ────────────────────────────── 动画计算 ────────────────────────────── */

  // 标题入场动画（0-1秒）
  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  // 副标题入场动画（延迟 0.5 秒）
  const subtitleProgress = spring({
    frame,
    fps,
    delay: 0.5 * fps,
    config: { damping: 200 },
  });

  // 退场动画（最后 1 秒）
  const exitProgress = spring({
    frame,
    fps,
    delay: durationInFrames - 1 * fps,
    config: { damping: 200 },
  });

  // 组合入场和退场
  const titleOpacity = titleProgress * (1 - exitProgress);
  const subtitleOpacity = subtitleProgress * (1 - exitProgress);

  // 标题 Y 轴位移
  const titleY = interpolate(titleProgress, [0, 1], [50, 0]);
  const subtitleY = interpolate(subtitleProgress, [0, 1], [30, 0]);

  /* ────────────────────────────── 渲染 ────────────────────────────── */

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* 标题 */}
      <h1
        style={{
          color: textColor,
          fontSize: 80,
          fontFamily: "Inter, sans-serif",
          fontWeight: 700,
          margin: 0,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </h1>

      {/* 副标题 */}
      <p
        style={{
          color: accentColor,
          fontSize: 36,
          fontFamily: "Inter, sans-serif",
          fontWeight: 400,
          marginTop: 20,
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
        }}
      >
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};
