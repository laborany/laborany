/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         LineChart 折线图组件                              ║
 * ║  带动画的折线图，线条逐渐绘制                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type DataPoint = {
  x: number;
  y: number;
  label?: string;
};

type LineChartProps = {
  /** 数据点 */
  data: DataPoint[];
  /** 图表宽度，默认 800 */
  width?: number;
  /** 图表高度，默认 400 */
  height?: number;
  /** 线条颜色，默认 "#4361ee" */
  lineColor?: string;
  /** 线条宽度，默认 3 */
  lineWidth?: number;
  /** 是否显示数据点，默认 true */
  showDots?: boolean;
  /** 数据点半径，默认 6 */
  dotRadius?: number;
  /** 动画时长（秒），默认 2 */
  duration?: number;
  /** 延迟时间（秒），默认 0 */
  delay?: number;
  /** 内边距 */
  padding?: number;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const LineChart: React.FC<LineChartProps> = ({
  data,
  width = 800,
  height = 400,
  lineColor = "#4361ee",
  lineWidth = 3,
  showDots = true,
  dotRadius = 6,
  duration = 2,
  delay = 0,
  padding = 40,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 计算动画进度
  const startFrame = delay * fps;
  const endFrame = startFrame + duration * fps;
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 计算坐标范围
  const xValues = data.map((d) => d.x);
  const yValues = data.map((d) => d.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  // 坐标转换函数
  const toScreenX = (x: number) =>
    padding + ((x - xMin) / (xMax - xMin)) * (width - 2 * padding);
  const toScreenY = (y: number) =>
    height - padding - ((y - yMin) / (yMax - yMin)) * (height - 2 * padding);

  // 生成路径
  const points = data.map((d) => ({ x: toScreenX(d.x), y: toScreenY(d.y) }));
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // 计算路径总长度（近似）
  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    pathLength += Math.sqrt(dx * dx + dy * dy);
  }

  const dashOffset = pathLength * (1 - progress);

  return (
    <svg width={width} height={height}>
      {/* 折线 */}
      <path
        d={pathD}
        fill="none"
        stroke={lineColor}
        strokeWidth={lineWidth}
        strokeDasharray={pathLength}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 数据点 */}
      {showDots &&
        points.map((p, i) => {
          const pointProgress = interpolate(
            progress,
            [i / points.length, (i + 1) / points.length],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={dotRadius * pointProgress}
              fill={lineColor}
            />
          );
        })}
    </svg>
  );
};
