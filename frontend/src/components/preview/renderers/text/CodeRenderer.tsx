/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         代码预览渲染器                                     ║
 * ║                                                                          ║
 * ║  使用 react-syntax-highlighter 实现语法高亮                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'

import type { RendererProps } from '../../types'
import { getLang } from '../../utils'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('c', c)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('yaml', yaml)

const LANGUAGE_ALIASES: Record<string, string | undefined> = {
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  scss: 'css',
  less: 'css',
  yml: 'yaml',
  txt: undefined,
  csv: undefined,
  plaintext: undefined,
  toml: undefined,
}

function resolveHighlightLanguage(lang: string): string | undefined {
  if (!lang) return undefined
  if (Object.prototype.hasOwnProperty.call(LANGUAGE_ALIASES, lang)) {
    return LANGUAGE_ALIASES[lang]
  }
  return lang
}

const MAX_HIGHLIGHT_CHAR_COUNT = 400_000
const MAX_HIGHLIGHT_LINE_LENGTH = 4_000

function getLongestLineLength(text: string): number {
  let maxLength = 0
  let currentLength = 0

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    if (charCode === 10 || charCode === 13) {
      if (currentLength > maxLength) maxLength = currentLength
      currentLength = 0
      continue
    }
    currentLength += 1
  }

  return currentLength > maxLength ? currentLength : maxLength
}

export function CodeRenderer({ artifact }: RendererProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)

    if (artifact.content) {
      setContent(artifact.content)
      setLoading(false)
      return
    }

    fetch(artifact.url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then(text => {
        if (!cancelled) {
          setContent(text)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [artifact.url, artifact.content])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-muted-foreground">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-destructive">加载失败: {error}</span>
      </div>
    )
  }

  const lang = getLang(artifact.ext)
  const highlightLang = resolveHighlightLanguage(lang)
  const shouldSkipHighlight = content.length > MAX_HIGHLIGHT_CHAR_COUNT || getLongestLineLength(content) > MAX_HIGHLIGHT_LINE_LENGTH

  if (shouldSkipHighlight) {
    return (
      <div className="h-full min-w-0 overflow-auto bg-[#282c34] text-[#abb2bf]">
        <div className="border-b border-white/10 px-4 py-2 text-xs text-[#8f97a3]">
          文件内容较大或存在超长单行，已切换到纯文本模式以避免预览卡顿。
        </div>
        <pre className="m-0 whitespace-pre-wrap break-words p-4 text-[13px] leading-6 [overflow-wrap:anywhere]">
          {content}
        </pre>
      </div>
    )
  }

  return (
    <div className="h-full min-w-0 overflow-auto">
      <SyntaxHighlighter
        language={highlightLang}
        style={oneDark}
        showLineNumbers
        wrapLongLines
        codeTagProps={{
          style: {
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          },
        }}
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '13px',
          lineHeight: '1.5',
          minHeight: '100%',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  )
}
