/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         BarChart 柱状图组件                               ║
 * ║  带动画的柱状图，支持交错入场                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 类型                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type DataItem = {
  label: string;
  value: number;
  color?: string;
};

type BarChartProps = {
  /** 数据项 */
  data: DataItem[];
  /** 图表宽度，默认 800 */
  width?: number;
  /** 图表高度，默认 400 */
  height?: number;
  /** 柱子间距，默认 20 */
  gap?: number;
  /** 默认柱子颜色 */
  defaultColor?: string;
  /** 交错延迟（帧），默认 5 */
  staggerDelay?: number;
  /** 是否显示数值，默认 true */
  showValues?: boolean;
  /** 延迟时间（秒），默认 0 */
  delay?: number;
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const BarChart: React.FC<BarChartProps> = ({
  data,
  width = 800,
  height = 400,
  gap = 20,
  defaultColor = "#4361ee",
  staggerDelay = 5,
  showValues = true,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const maxValue = Math.max(...data.map((d) => d.value));
  const barWidth = (width - gap * (data.length + 1)) / data.length;
  const chartHeight = height - 60; // 留出标签空间

  return (
    <div style={{ width, height, position: "relative" }}>
      {/* 柱子 */}
      {data.map((item, index) => {
        const barDelay = delay * fps + index * staggerDelay;
        const progress = spring({
          frame,
          fps,
          delay: barDelay,
          config: { damping: 200 },
        });

        const barHeight = (item.value / maxValue) * chartHeight * progress;
        const x = gap + index * (barWidth + gap);
        const y = chartHeight - barHeight;

        return (
          <div key={item.label}>
            {/* 柱子 */}
            <div
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: barWidth,
                height: barHeight,
                backgroundColor: item.color || defaultColor,
                borderRadius: "4px 4px 0 0",
              }}
            />

            {/* 数值 */}
            {showValues && (
              <div
                style={{
                  position: "absolute",
                  left: x,
                  top: y - 30,
                  width: barWidth,
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: progress,
                }}
              >
                {Math.round(item.value * progress)}
              </div>
            )}

            {/* 标签 */}
            <div
              style={{
                position: "absolute",
                left: x,
                top: chartHeight + 10,
                width: barWidth,
                textAlign: "center",
                fontSize: 12,
                opacity: progress,
              }}
            >
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
