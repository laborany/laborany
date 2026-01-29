/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Excel 预览渲染器                                    ║
 * ║                                                                          ║
 * ║  设计哲学：双重解析策略，xlsx 失败后用 jszip 重新压缩再试                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import type { RendererProps } from '../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ExcelSheet {
  name: string
  data: string[][]
}

export function ExcelRenderer({ artifact }: RendererProps) {
  const [sheets, setSheets] = useState<ExcelSheet[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadExcel()
  }, [artifact.url])

  const loadExcel = async () => {
    try {
      const response = await fetch(artifact.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()

      // 尝试直接解析
      let workbook: XLSX.WorkBook | null = null
      try {
        workbook = XLSX.read(buffer, { type: 'array' })
      } catch (xlsxError) {
        // 备用方案：用 JSZip 重新压缩
        console.log('[Excel] 直接解析失败，尝试 JSZip 重压缩')
        const zip = await JSZip.loadAsync(buffer)
        const newZip = new JSZip()
        for (const [name, file] of Object.entries(zip.files)) {
          if (!file.dir) {
            const content = await file.async('uint8array')
            newZip.file(name, content, { compression: 'DEFLATE' })
          }
        }
        const recompressed = await newZip.generateAsync({ type: 'uint8array' })
        workbook = XLSX.read(recompressed, { type: 'array' })
      }

      if (!workbook) throw new Error('无法解析 Excel 文件')

      // 转换为表格数据
      const parsed: ExcelSheet[] = workbook.SheetNames.map(name => ({
        name,
        data: XLSX.utils.sheet_to_json<string[]>(workbook!.Sheets[name], {
          header: 1,
          defval: '',
        }),
      }))

      setSheets(parsed)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">加载 Excel...</p>
        </div>
      </div>
    )
  }

  if (error || sheets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background">
            <span className="text-4xl">📊</span>
          </div>
          <h3 className="mb-2 text-lg font-medium text-foreground">{artifact.name}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{error || '无数据'}</p>
          <a
            href={artifact.url}
            download={artifact.name}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            下载文件
          </a>
        </div>
      </div>
    )
  }

  const current = sheets[activeSheet]

  return (
    <div className="flex h-full flex-col">
      {/* Sheet 标签 */}
      {sheets.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-1">
          {sheets.map((sheet, i) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(i)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                i === activeSheet
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* 表格内容 */}
      <div className="flex-1 overflow-auto bg-background">
        {current && current.data.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              {current.data.length > 0 && (
                <tr>
                  <th className="sticky left-0 z-20 w-10 border border-border bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    #
                  </th>
                  {current.data[0].map((cell, i) => (
                    <th key={i} className="min-w-[100px] border border-border px-3 py-2 text-left font-medium text-foreground">
                      {cell}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {current.data.slice(1).map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/50">
                  <td className="sticky left-0 border border-border bg-muted/50 px-2 py-2 text-center text-xs text-muted-foreground">
                    {rowIdx + 2}
                  </td>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="border border-border px-3 py-2 text-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            空表格
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="shrink-0 border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        {current && (
          <span>
            {current.data.length} 行 × {current.data[0]?.length || 0} 列
          </span>
        )}
      </div>
    </div>
  )
}
