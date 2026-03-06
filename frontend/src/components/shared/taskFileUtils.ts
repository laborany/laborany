import type { TaskFile } from '../../types'
import { getExt, isPreviewable } from '../preview'

interface RankedTaskFile {
  file: TaskFile
  index: number
  stepIndex: number | null
  timestamp: number | null
}

interface PreviewIntent {
  preferText: boolean
  preferLog: boolean
  preferReport: boolean
  preferHtml: boolean
  preferTable: boolean
}

interface PreviewSelectionOptions {
  hintText?: string
}

const DELIVERABLE_EXT_BONUS: Record<string, number> = {
  html: 90,
  htm: 90,
  pdf: 80,
  docx: 70,
  pptx: 70,
  xlsx: 70,
  xls: 65,
  md: 60,
  markdown: 60,
  csv: 55,
  json: 50,
  png: 45,
  jpg: 45,
  jpeg: 45,
  svg: 45,
  webp: 45,
  txt: 5,
}

const REPORT_NAME_RE = /(^|[._\-\s])(final|result|report|summary|answer|output|deliverable|presentation|dashboard|overview|readme|成果|结果|总结|报告|输出|产出|最终)([._\-\s]|$)/i
const LOG_NAME_RE = /(^|[._\-\s])(log|logs|trace|debug|stdout|stderr|history|tmp|temp|cache|日志|调试)([._\-\s]|$)/i
const LOG_PATH_RE = /(^|\/)(logs?|\.?tmp|temp|cache|history|调试|日志)(\/|$)/i

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

function resolveTimestamp(file: TaskFile): number | null {
  if (typeof file.mtimeMs === 'number' && Number.isFinite(file.mtimeMs)) {
    return file.mtimeMs
  }
  if (typeof file.updatedAt === 'string' && file.updatedAt) {
    const parsed = Date.parse(file.updatedAt)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toStepIndex(file: TaskFile): number | null {
  return typeof file.stepIndex === 'number' && Number.isFinite(file.stepIndex)
    ? file.stepIndex
    : null
}

function rankTaskFiles(taskFiles: TaskFile[]): RankedTaskFile[] {
  return collectAllTaskFiles(taskFiles).map((file, index) => ({
    file,
    index,
    stepIndex: toStepIndex(file),
    timestamp: resolveTimestamp(file),
  }))
}

function sortRankedTaskFilesByRecency(taskFiles: TaskFile[]): RankedTaskFile[] {
  return rankTaskFiles(taskFiles)
    .sort((a, b) => {
      const aTime = a.timestamp ?? -1
      const bTime = b.timestamp ?? -1
      if (aTime !== bTime) return bTime - aTime

      const aStep = a.stepIndex ?? -1
      const bStep = b.stepIndex ?? -1
      if (aStep !== bStep) return bStep - aStep

      if (a.index !== b.index) return b.index - a.index
      return a.file.path.localeCompare(b.file.path)
    })
}

function parsePreviewIntent(hintText?: string): PreviewIntent {
  const text = (hintText || '').toLowerCase()

  return {
    preferText: /(txt|text|plaintext|raw|纯文本|文本|原文)/i.test(text),
    preferLog: /(log|logs|trace|debug|stdout|stderr|日志|调试)/i.test(text),
    preferReport: /(report|summary|final|result|output|deliverable|报告|总结|结果|产出|最终)/i.test(text),
    preferHtml: /(html|网页|web页面|web page|浏览器)/i.test(text),
    preferTable: /(xlsx|xls|csv|excel|table|表格)/i.test(text),
  }
}

function scorePreviewFile(
  candidate: RankedTaskFile,
  recencyIndex: number,
  totalCandidates: number,
  intent: PreviewIntent,
): number {
  const file = candidate.file
  const ext = (file.ext || getExt(file.name)).toLowerCase()
  const normalizedName = file.name.toLowerCase()
  const normalizedPath = normalizePath(file.path).toLowerCase()
  const isLogLike = LOG_NAME_RE.test(normalizedName) || LOG_PATH_RE.test(normalizedPath)
  const isReportLike = REPORT_NAME_RE.test(normalizedName)

  let score = 0

  score += (totalCandidates - recencyIndex) * 10
  score += DELIVERABLE_EXT_BONUS[ext] || 0

  if (candidate.stepIndex !== null) {
    score += candidate.stepIndex * 6
  }

  if (isReportLike) {
    score += 90
  }

  if (isLogLike) {
    score -= 160
  }

  if (ext === 'txt' && !intent.preferText && !intent.preferLog) {
    score -= 25
  }

  if (intent.preferLog) {
    if (isLogLike) score += 240
  } else if (isLogLike) {
    score -= 60
  }

  if (intent.preferText && ['txt', 'md', 'markdown', 'json', 'csv'].includes(ext)) {
    score += 130
  }

  if (intent.preferReport && (isReportLike || (DELIVERABLE_EXT_BONUS[ext] || 0) > 0)) {
    score += 100
  }

  if (intent.preferHtml && (ext === 'html' || ext === 'htm')) {
    score += 120
  }

  if (intent.preferTable && ['xlsx', 'xls', 'csv'].includes(ext)) {
    score += 110
  }

  return score
}

export function toArtifactPath(path: string, workDir: string | null): string {
  const normalizedPath = normalizePath(path)
  if (!workDir) return normalizedPath
  return normalizePath(`${workDir}/${normalizedPath}`)
}

export function collectAllTaskFiles(taskFiles: TaskFile[]): TaskFile[] {
  const files: TaskFile[] = []

  for (const file of taskFiles) {
    if (file.type === 'file') {
      files.push(file)
    }
    if (file.children && file.children.length > 0) {
      files.push(...collectAllTaskFiles(file.children))
    }
  }

  return files
}

export function sortTaskFilesByRecency(taskFiles: TaskFile[]): TaskFile[] {
  return sortRankedTaskFilesByRecency(taskFiles)
    .map((entry) => entry.file)
}

export function findLatestPreviewableTaskFile(
  taskFiles: TaskFile[],
  options?: PreviewSelectionOptions,
): TaskFile | null {
  const rankedFiles = sortRankedTaskFilesByRecency(taskFiles)
  const previewableCandidates = rankedFiles.filter((entry) => {
    const ext = entry.file.ext || getExt(entry.file.name)
    return isPreviewable(ext)
  })

  if (previewableCandidates.length === 0) return null

  const intent = parsePreviewIntent(options?.hintText)
  let bestFile: TaskFile | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  previewableCandidates.forEach((candidate, index) => {
    const score = scorePreviewFile(candidate, index, previewableCandidates.length, intent)
    if (score > bestScore) {
      bestScore = score
      bestFile = candidate.file
    }
  })

  return bestFile
}

export function findTaskFileByArtifactPath(
  taskFiles: TaskFile[],
  artifactPath: string,
  workDir: string | null,
): TaskFile | null {
  const target = normalizePath(artifactPath)
  if (!target) return null

  for (const file of collectAllTaskFiles(taskFiles)) {
    const relativePath = normalizePath(file.path)
    const fullPath = toArtifactPath(file.path, workDir)
    if (target === relativePath || target === fullPath) {
      return file
    }
  }

  return null
}

export function isSelectedArtifactPath(
  taskFile: TaskFile,
  selectedPath: string | null | undefined,
  workDir: string | null,
): boolean {
  if (!selectedPath) return false
  const normalizedSelected = normalizePath(selectedPath)
  return (
    normalizedSelected === normalizePath(taskFile.path)
    || normalizedSelected === toArtifactPath(taskFile.path, workDir)
  )
}
