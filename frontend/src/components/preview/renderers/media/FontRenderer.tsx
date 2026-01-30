/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         字体预览渲染器                                    ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 通过 @font-face 动态加载字体                                          ║
 * ║  2. 显示字母表、数字和示例文本                                             ║
 * ║  3. 支持调整预览字号                                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState, useId } from 'react'
import type { RendererProps } from '../../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           预览文本常量                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const PREVIEW_TEXTS = {
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  alphabetLower: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:\'",.<>?/',
  pangram: 'The quick brown fox jumps over the lazy dog.',
  pangramCn: '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。',
}

const FONT_SIZES = [12, 16, 24, 32, 48, 64, 96]

export function FontRenderer({ artifact }: RendererProps) {
  const fontId = useId().replace(/:/g, '')
  const fontFamily = `preview-font-${fontId}`
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState(32)

  useEffect(() => {
    loadFont()

    async function loadFont() {
      try {
        const font = new FontFace(fontFamily, `url(${artifact.url})`)
        await font.load()
        document.fonts.add(font)
        setLoaded(true)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : '字体加载失败')
      }
    }

    return () => {
      document.fonts.forEach(font => {
        if (font.family === fontFamily) document.fonts.delete(font)
      })
    }
  }, [artifact.url, fontFamily])

  if (error) return <ErrorState name={artifact.name} error={error} url={artifact.url} />

  return (
    <div className="flex h-full flex-col bg-background">
      <Toolbar name={artifact.name} fontSize={fontSize} onFontSizeChange={setFontSize} />
      <PreviewContent loaded={loaded} fontFamily={fontFamily} fontSize={fontSize} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           子组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function Toolbar({ name, fontSize, onFontSizeChange }: { name: string; fontSize: number; onFontSizeChange: (size: number) => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
      <h3 className="text-sm font-medium text-foreground">{name}</h3>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">字号:</span>
        <select
          value={fontSize}
          onChange={e => onFontSizeChange(Number(e.target.value))}
          className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
        >
          {FONT_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}
        </select>
      </div>
    </div>
  )
}

function PreviewContent({ loaded, fontFamily, fontSize }: { loaded: boolean; fontFamily: string; fontSize: number }) {
  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">加载字体...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="space-y-8" style={{ fontFamily }}>
        <PreviewSection title="大写字母" text={PREVIEW_TEXTS.alphabet} fontSize={fontSize} />
        <PreviewSection title="小写字母" text={PREVIEW_TEXTS.alphabetLower} fontSize={fontSize} />
        <PreviewSection title="数字" text={PREVIEW_TEXTS.numbers} fontSize={fontSize} />
        <PreviewSection title="符号" text={PREVIEW_TEXTS.symbols} fontSize={fontSize} />
        <PreviewSection title="英文示例" text={PREVIEW_TEXTS.pangram} fontSize={fontSize} />
        <PreviewSection title="中文示例" text={PREVIEW_TEXTS.pangramCn} fontSize={fontSize} />
      </div>
    </div>
  )
}

function PreviewSection({ title, text, fontSize }: { title: string; text: string; fontSize: number }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h4>
      <p className="break-all text-foreground" style={{ fontSize }}>{text}</p>
    </div>
  )
}

function ErrorState({ name, error, url }: { name: string; error: string; url: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-muted/20 p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background">
          <span className="text-4xl">🔤</span>
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">{name}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{error}</p>
        <a href={url} download={name} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          下载文件
        </a>
      </div>
    </div>
  )
}
