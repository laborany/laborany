import { existsSync, readdirSync } from 'fs'
import { copyFile, mkdir } from 'fs/promises'
import { basename, extname, join } from 'path'

export function sanitizeTaskFileName(fileName: string): string {
  const normalized = (fileName || '').replace(/\\/g, '/').split('/').pop()?.trim() || ''
  const safe = normalized.replace(/[<>:"|?*\x00-\x1f]/g, '_')
  return safe || `upload-${Date.now()}`
}

export function ensureUniqueTaskFileName(taskDir: string, preferredName: string): string {
  const safeName = sanitizeTaskFileName(preferredName)
  const extension = extname(safeName)
  const baseName = safeName.slice(0, safeName.length - extension.length) || 'upload'

  let counter = 0
  while (true) {
    const suffix = counter === 0 ? '' : `-${counter}`
    const candidateName = `${baseName}${suffix}${extension}`
    if (!existsSync(join(taskDir, candidateName))) {
      return candidateName
    }
    counter += 1
  }
}

export function resolveUploadedAttachmentPath(attachmentId: string, uploadsDir: string): string | null {
  if (!existsSync(uploadsDir)) return null
  const files = readdirSync(uploadsDir)
  const matched = files.find((fileName) => fileName.startsWith(attachmentId))
  return matched ? join(uploadsDir, matched) : null
}

export interface HydrateTaskAttachmentsOptions {
  attachmentIds: string[]
  taskDir: string
  uploadsDir: string
  onResolveFailure?: (attachmentId: string) => void
  onCopyFailure?: (attachmentId: string, error: unknown) => void
}

export async function hydrateAttachmentsToTaskDir(
  options: HydrateTaskAttachmentsOptions,
): Promise<string[]> {
  const {
    attachmentIds,
    taskDir,
    uploadsDir,
    onResolveFailure,
    onCopyFailure,
  } = options

  if (attachmentIds.length === 0) return []

  const copiedFiles: string[] = []
  await mkdir(taskDir, { recursive: true })

  for (const attachmentId of attachmentIds) {
    const sourcePath = resolveUploadedAttachmentPath(attachmentId, uploadsDir)
    if (!sourcePath) {
      onResolveFailure?.(attachmentId)
      continue
    }

    try {
      const sourceName = basename(sourcePath) || `${attachmentId}.bin`
      const targetName = ensureUniqueTaskFileName(taskDir, sourceName)
      await copyFile(sourcePath, join(taskDir, targetName))
      copiedFiles.push(targetName)
    } catch (error) {
      onCopyFailure?.(attachmentId, error)
    }
  }

  return copiedFiles
}
