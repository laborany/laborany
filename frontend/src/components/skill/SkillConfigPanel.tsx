/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      Skill 配置面板                                       ║
 * ║                                                                          ║
 * ║  展示完整的物料结构：SKILL.md, FORMS.md, skill.yaml, scripts/             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import type { SkillDetail } from '../../types'
import { useSkillNameMap } from '../../hooks/useSkillNameMap'
import { FileIcon } from '../shared/FileIcon'
import { CodeRenderer, MarkdownRenderer, getExt, type FileArtifact } from '../preview'

interface SkillConfigPanelProps {
  skillId: string
  onBack: () => void
}

export function SkillConfigPanel({ skillId, onBack }: SkillConfigPanelProps) {
  const { getSkillName } = useSkillNameMap()
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchSkillDetail()
  }, [skillId, getSkillName])

  async function fetchSkillDetail() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/skill/${skillId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setDetail(data)
    } catch {
      // 模拟数据
      setDetail({
        id: skillId,
        name: getSkillName(skillId) || '技能配置',
        description: '分析财报数据，生成专业的金融研究报告',
        icon: '📊',
        category: '金融',
        files: [
          { name: 'SKILL.md', path: 'SKILL.md', type: 'md', description: '主指令（触发时加载）' },
          { name: 'FORMS.md', path: 'FORMS.md', type: 'md', description: '表单指南（按需加载）' },
          { name: 'reference.md', path: 'reference.md', type: 'md', description: 'API 参考（按需加载）' },
          { name: 'examples.md', path: 'examples.md', type: 'md', description: '使用示例（按需加载）' },
          { name: 'skill.yaml', path: 'skill.yaml', type: 'yaml', description: '元信息和能力配置' },
          { name: 'scripts/', path: 'scripts', type: 'folder', description: '工具脚本目录' },
        ],
      })
    } finally {
      setLoading(false)
    }
  }

  async function loadFileContent(path: string) {
    setSelectedFile(path)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(
        `/api/skill/${skillId}/file?path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      setFileContent(data.content || '')
    } catch {
      // 模拟内容
      setFileContent(getMockContent(path))
    }
    setEditing(false)
  }

  async function saveFileContent() {
    if (!selectedFile) return
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/skill/${skillId}/file`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path: selectedFile, content: fileContent }),
      })
      setEditing(false)
    } catch (err) {
      console.error('保存失败:', err)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 页头 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{detail?.icon}</span>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{detail?.name}</h2>
            <p className="text-sm text-muted-foreground">{detail?.description}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 文件列表 */}
        <div className="col-span-4 card p-4">
          <h3 className="font-semibold text-foreground mb-4">物料结构</h3>
          <div className="space-y-1">
            {detail?.files.map((file) => (
              <FileTreeItem
                key={file.path}
                file={file}
                selectedFile={selectedFile}
                onSelect={loadFileContent}
              />
            ))}
          </div>
        </div>

        {/* 文件内容 */}
        <div className="col-span-8 card">
          {selectedFile ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-medium text-foreground">{selectedFile}</span>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveFileContent}
                        className="btn-primary px-3 py-1 text-sm"
                      >
                        保存
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {editing ? (
                  <div className="p-4">
                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="input w-full h-full min-h-[400px] font-mono text-sm"
                    />
                  </div>
                ) : (
                  <FileContentRenderer path={selectedFile} content={fileContent} />
                )}
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              选择左侧文件查看内容
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件树项                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface FileTreeItemProps {
  file: {
    name: string
    path: string
    type: string
    description?: string
    children?: Array<{ name: string; path: string; type: string }>
  }
  selectedFile: string | null
  onSelect: (path: string) => void
}

function FileTreeItem({ file, selectedFile, onSelect }: FileTreeItemProps) {
  const isFolder = file.type === 'folder'
  const isSelected = selectedFile === file.path

  return (
    <div>
      <button
        onClick={() => !isFolder && onSelect(file.path)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-accent'
        } ${isFolder ? 'cursor-default font-medium' : ''}`}
      >
        <FileIcon type={file.type} />
        <div className="flex-1 min-w-0">
          <div className="truncate text-foreground">{file.name}</div>
          {file.description && (
            <div className="text-xs text-muted-foreground truncate">
              {file.description}
            </div>
          )}
        </div>
      </button>
      {/* 子目录文件 */}
      {isFolder && file.children && file.children.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {file.children.map((child) => (
            <button
              key={child.path}
              onClick={() => onSelect(child.path)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                selectedFile === child.path
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-accent'
              }`}
            >
              <FileIcon type={child.type} />
              <span className="truncate">{child.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       文件内容渲染器                                       │
 * │                                                                          │
 * │  根据文件类型选择合适的渲染器：Markdown 或 Code                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function FileContentRenderer({ path, content }: { path: string; content: string }) {
  const ext = getExt(path)

  /* ── 构造 artifact 对象供渲染器使用 ── */
  const artifact: FileArtifact = {
    name: path,
    path,
    ext,
    category: ext === 'md' ? 'markdown' : 'code',
    url: '',
    content,
  }

  /* ── Markdown 文件使用 MarkdownRenderer ── */
  if (ext === 'md') {
    return <MarkdownRenderer artifact={artifact} />
  }

  /* ── 其他文件使用 CodeRenderer（带语法高亮） ── */
  return <CodeRenderer artifact={artifact} />
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           模拟内容                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getMockContent(path: string): string {
  if (path === 'SKILL.md') {
    return `# 金融研报助手

## 角色定义
你是一位专业的金融分析师，擅长分析财务报表和生成研究报告。

## 工作流程
1. 接收用户的分析需求
2. 获取相关财务数据
3. 进行深度分析
4. 生成专业研报

## 输出格式
- 公司概况
- 财务分析
- 行业对比
- 风险提示
- 投资建议`
  }
  if (path === 'skill.yaml') {
    return `name: 金融研报助手
description: 分析财报数据，生成专业的金融研究报告
icon: "📊"
category: 金融

price_per_run: 0.5

features:
  - 财务报表分析
  - 关键指标计算
  - 行业对比分析

tools:
  - name: fetch_stock_data
    script: scripts/fetch_data.py
  - name: analyze_financial
    script: scripts/analyze.py`
  }
  return '// 文件内容加载中...'
}
