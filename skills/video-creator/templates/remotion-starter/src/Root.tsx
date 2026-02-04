/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Remotion 入口文件                                ║
 * ║  定义所有可渲染的 Composition，在 Remotion Studio 中显示                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Composition } from "remotion";
import { Main, MainProps, mainSchema } from "./compositions/Main";

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           默认配置                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const FPS = 30;
const DURATION_IN_SECONDS = 10;

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Root 组件                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 主视频 Composition */}
      <Composition<MainProps>
        id="Main"
        component={Main}
        durationInFrames={DURATION_IN_SECONDS * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        schema={mainSchema}
        defaultProps={{
          title: "Hello Remotion",
          subtitle: "使用 React 创建视频",
          backgroundColor: "#1a1a2e",
          textColor: "#ffffff",
          accentColor: "#4361ee",
        }}
      />
    </>
  );
};
