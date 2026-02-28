import type { TaskFile } from '../../types'
import { getExt, isPreviewable } from '../preview'

interface RankedTaskFile {
  file: TaskFile
  index: number
  stepIndex: number | null
  timestamp: number | null
}

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
    .map((entry) => entry.file)
}

export function findLatestPreviewableTaskFile(taskFiles: TaskFile[]): TaskFile | null {
  const sortedFiles = sortTaskFilesByRecency(taskFiles)
  return sortedFiles.find((file) => isPreviewable(file.ext || getExt(file.name))) || null
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
