/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       PowerPoint 预览渲染器                               ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 使用 JSZip 解析 PPTX 文件结构                                         ║
 * ║  2. 提取幻灯片文本和图片                                                   ║
 * ║  3. 实现幻灯片导航和缩略图条                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import type { RendererProps, PptxSlide } from '../../types'

export function PptxRenderer({ artifact }: RendererProps) {
  const [slides, setSlides] = useState<PptxSlide[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const blobUrls: string[] = []
    loadPptx()

    async function loadPptx() {
      try {
        const response = await fetch(artifact.url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await response.arrayBuffer()

        const zip = await JSZip.loadAsync(buffer)
        const imageUrls = await extractImages(zip, blobUrls)
        const parsedSlides = await parseSlides(zip, imageUrls)

        if (parsedSlides.length === 0) throw new Error('未找到幻灯片')

        setSlides(parsedSlides)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    return () => blobUrls.forEach(url => URL.revokeObjectURL(url))
  }, [artifact.url])

  if (loading) return <LoadingState />
  if (error || slides.length === 0) return <ErrorState name={artifact.name} error={error} url={artifact.url} />

  const slide = slides[currentSlide]

  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        <NavButton dir="prev" disabled={currentSlide === 0} onClick={() => setCurrentSlide(i => i - 1)} />
        <NavButton dir="next" disabled={currentSlide === slides.length - 1} onClick={() => setCurrentSlide(i => i + 1)} />
        <SlideContent slide={slide} total={slides.length} current={currentSlide} />
      </div>
      <ThumbnailStrip slides={slides} current={currentSlide} onSelect={setCurrentSlide} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function extractImages(zip: JSZip, blobUrls: string[]): Promise<Map<string, string>> {
  const imageUrls = new Map<string, string>()
  const mediaFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'))

  for (const mediaPath of mediaFiles) {
    const file = zip.files[mediaPath]
    if (!file.dir) {
      const blob = await file.async('blob')
      const url = URL.createObjectURL(blob)
      blobUrls.push(url)
      const fileName = mediaPath.split('/').pop() || ''
      imageUrls.set(fileName, url)
    }
  }
  return imageUrls
}

async function parseSlides(zip: JSZip, imageUrls: Map<string, string>): Promise<PptxSlide[]> {
  const slides: PptxSlide[] = []
  let index = 1

  while (true) {
    const slideFile = zip.file(`ppt/slides/slide${index}.xml`)
    if (!slideFile) break

    const slideXml = await slideFile.async('string')
    const { title, content } = parseSlideText(slideXml)
    const imageUrl = await findSlideImage(zip, index, imageUrls)

    slides.push({ index, title: title || `幻灯片 ${index}`, content, imageUrl })
    index++
  }
  return slides
}

function parseSlideText(xml: string): { title: string; content: string[] } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const textElements = doc.querySelectorAll('a\\:t, t')

  let title = ''
  const content: string[] = []

  textElements.forEach((el, idx) => {
    const text = el.textContent?.trim()
    if (text) {
      if (idx === 0 && !title) title = text
      else content.push(text)
    }
  })
  return { title, content }
}

async function findSlideImage(zip: JSZip, index: number, imageUrls: Map<string, string>): Promise<string | undefined> {
  const relsFile = zip.file(`ppt/slides/_rels/slide${index}.xml.rels`)
  if (!relsFile) return undefined

  const relsXml = await relsFile.async('string')
  const parser = new DOMParser()
  const doc = parser.parseFromString(relsXml, 'text/xml')
  const relationships = doc.querySelectorAll('Relationship')

  for (const rel of relationships) {
    const type = rel.getAttribute('Type') || ''
    const target = rel.getAttribute('Target') || ''
    if (type.includes('image') && target.includes('media/')) {
      const imageName = target.split('/').pop() || ''
      if (imageUrls.has(imageName)) return imageUrls.get(imageName)
    }
  }
  return undefined
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           子组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/20 p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">加载演示文稿...</p>
      </div>
    </div>
  )
}

function ErrorState({ name, error, url }: { name: string; error: string | null; url: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-muted/20 p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background">
          <span className="text-4xl">📙</span>
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">{name}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{error || '无幻灯片'}</p>
        <a href={url} download={name} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          下载文件
        </a>
      </div>
    </div>
  )
}

function NavButton({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const isLeft = dir === 'prev'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`absolute ${isLeft ? 'left-4' : 'right-4'} z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 shadow-lg transition-all hover:bg-background disabled:cursor-not-allowed disabled:opacity-30`}
    >
      <span className="text-foreground">{isLeft ? '◀' : '▶'}</span>
    </button>
  )
}

function SlideContent({ slide, total, current }: { slide: PptxSlide; total: number; current: number }) {
  return (
    <div className="relative aspect-[16/9] w-full max-w-4xl overflow-hidden rounded-lg bg-background shadow-xl">
      {slide.imageUrl ? (
        <div className="relative h-full w-full">
          <img src={slide.imageUrl} alt={slide.title} className="h-full w-full object-contain" />
          {(slide.title || slide.content.length > 0) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-6">
              {slide.title && <h2 className="mb-2 text-xl font-bold text-white">{slide.title}</h2>}
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full w-full flex-col p-8">
          {slide.title && <h2 className="mb-6 text-2xl font-bold text-foreground">{slide.title}</h2>}
          <div className="flex-1 overflow-auto">
            {slide.content.map((text, idx) => (
              <p key={idx} className="mb-3 text-base text-foreground/80">{text}</p>
            ))}
          </div>
        </div>
      )}
      <div className="absolute right-4 bottom-4 rounded-md bg-muted/80 px-3 py-1.5 text-xs text-muted-foreground">
        {current + 1} / {total}
      </div>
    </div>
  )
}

function ThumbnailStrip({ slides, current, onSelect }: { slides: PptxSlide[]; current: number; onSelect: (i: number) => void }) {
  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="flex gap-2 overflow-x-auto p-3">
        {slides.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`aspect-[16/9] w-24 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition-all ${
              i === current ? 'border-primary shadow-md' : 'border-border hover:border-primary/50'
            }`}
          >
            {s.imageUrl ? (
              <img src={s.imageUrl} alt={s.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-start justify-start bg-muted/50 p-1.5">
                <span className="line-clamp-2 text-[8px] font-medium text-foreground">{s.title}</span>
                {s.content.length > 0 && (
                  <span className="mt-0.5 line-clamp-2 text-[6px] text-muted-foreground">{s.content[0]}</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
