/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       音频预览渲染器                                      ║
 * ║                                                                          ║
 * ║  设计哲学：自定义播放器 UI，提供优雅的音频播放体验                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useRef, useState } from 'react'
import type { RendererProps } from '../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           时间格式化                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const formatTime = (time: number): string => {
  if (isNaN(time) || !isFinite(time)) return '0:00'
  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function AudioRenderer({ artifact }: RendererProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const togglePlay = async () => {
    if (!audioRef.current) return
    try {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        await audioRef.current.play()
      }
    } catch (err) {
      setError(`播放失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = percent * duration
  }

  const skip = (seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <span className="text-2xl">🎵</span>
          </div>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-muted/20 p-8">
      {/* 专辑封面占位 */}
      <div className="relative mb-8">
        <div className={`flex h-36 w-36 items-center justify-center rounded-2xl bg-primary shadow-xl transition-transform duration-300 ${isPlaying ? 'scale-105' : ''}`}>
          <span className="text-5xl opacity-80">🎵</span>
        </div>
        {isPlaying && (
          <div className="absolute -inset-2 -z-10 animate-pulse rounded-2xl bg-primary/20 blur-xl" />
        )}
      </div>

      {/* 文件名 */}
      <h3 className="mb-1 max-w-md truncate text-center text-lg font-semibold text-foreground">
        {artifact.name.replace(/\.[^/.]+$/, '')}
      </h3>
      <p className="mb-6 text-xs text-muted-foreground">
        {artifact.ext.toUpperCase()} 音频
      </p>

      {/* 隐藏的 audio 元素 */}
      <audio
        ref={audioRef}
        src={artifact.url}
        preload="metadata"
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError('无法加载音频文件')}
      />

      {/* 播放控制 */}
      <div className="w-full max-w-sm">
        {/* 进度条 */}
        <div className="mb-6">
          <div
            className="relative h-1.5 w-full cursor-pointer rounded-full bg-muted"
            onClick={seek}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-foreground shadow-lg transition-all duration-150"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => skip(-10)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="后退 10 秒"
          >
            ⏪
          </button>
          <button
            onClick={togglePlay}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 active:scale-95"
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button
            onClick={() => skip(10)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="前进 10 秒"
          >
            ⏩
          </button>
        </div>
      </div>
    </div>
  )
}
