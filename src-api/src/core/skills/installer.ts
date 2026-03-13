import JSZip from 'jszip'
import { mkdir, rm, writeFile } from 'fs/promises'
import { basename, dirname, join, posix } from 'path'
import { Readable } from 'stream'
import { gunzipSync } from 'zlib'
import * as tarStream from 'tar-stream'
import { loadSkill } from 'laborany-shared'
import {
  parseRemoteInstallSource,
  type NormalizedRemoteInstallSource,
} from './remote-install-source.js'
import {
  DEFAULT_SKILL_CATEGORY,
  DEFAULT_SKILL_ICON,
  materializeStagedSkillDirectory,
  normalizeSkillDisplayName,
} from './materializer.js'

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024

type ArchiveFormat = 'zip' | 'tar' | 'tar.gz'

export interface InstallProgressEvent {
  stage:
    | 'validate_source'
    | 'resolve_repo'
    | 'download_archive'
    | 'extract_skill'
    | 'patch_metadata'
    | 'finalize'
  message: string
}

export interface SkillInstallResult {
  skillId: string
  name: string
  installedPath: string
  source: string
  sourceType: 'github_repo' | 'archive_url'
  metadataPatched: {
    icon: boolean
    category: boolean
  }
  metadata: {
    icon: string
    category: string
  }
  summary: string
}

export class SkillInstallError extends Error {
  status: number
  code: string
  detail?: string

  constructor(message: string, status = 400, code = 'SKILL_INSTALL_ERROR', detail?: string) {
    super(message)
    this.name = 'SkillInstallError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

function normalizeTreePath(input?: string): string | undefined {
  if (!input) return undefined
  const normalized = posix.normalize(input.replace(/\\/g, '/').trim()).replace(/^\/+/, '')
  if (!normalized || normalized === '.') return undefined
  if (normalized.startsWith('../') || normalized === '..') {
    throw new SkillInstallError('GitHub 路径不合法', 400, 'INVALID_GITHUB_PATH')
  }
  return normalized
}

function sanitizeRelativePath(input: string): string | null {
  const normalized = posix.normalize(input.replace(/\\/g, '/')).replace(/^\/+/, '')
  if (!normalized || normalized === '.') return null
  if (normalized.startsWith('../') || normalized === '..') return null
  if (normalized.split('/').some(segment => segment === '..' || !segment)) return null
  return normalized
}

async function fetchDefaultBranch(owner: string, repo: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      'User-Agent': 'LaborAny-SkillInstaller',
      'Accept': 'application/vnd.github+json',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new SkillInstallError('GitHub 仓库不存在或不可访问', 404, 'GITHUB_REPO_NOT_FOUND')
    }
    throw new SkillInstallError('无法读取 GitHub 仓库信息', 502, 'GITHUB_API_ERROR')
  }

  const payload = await response.json() as { default_branch?: string }
  return payload.default_branch || 'main'
}

async function readArchiveBuffer(response: Response, label: string): Promise<Buffer> {
  if (!response.ok) {
    throw new SkillInstallError(`无法下载压缩包：${label}`, 502, 'ARCHIVE_DOWNLOAD_FAILED')
  }

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > MAX_ARCHIVE_SIZE) {
    throw new SkillInstallError('压缩包过大，超过 100MB 限制', 413, 'ARCHIVE_TOO_LARGE')
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (buffer.length > MAX_ARCHIVE_SIZE) {
    throw new SkillInstallError('压缩包过大，超过 100MB 限制', 413, 'ARCHIVE_TOO_LARGE')
  }
  return buffer
}

function guessArchiveFormat(urlPath: string, contentType?: string | null): ArchiveFormat | 'unknown' {
  const path = urlPath.toLowerCase()
  const ctype = (contentType || '').toLowerCase()

  if (path.endsWith('.tar.gz') || path.endsWith('.tgz')) return 'tar.gz'
  if (path.endsWith('.tar')) return 'tar'
  if (path.endsWith('.zip')) return 'zip'
  if (ctype.includes('gzip')) return 'tar.gz'
  if (ctype.includes('x-tar') || ctype.includes('application/tar')) return 'tar'
  if (ctype.includes('zip')) return 'zip'
  return 'unknown'
}

function looksLikeTar(buffer: Buffer): boolean {
  if (buffer.length < 265) return false
  const magic = buffer.subarray(257, 262).toString('utf-8')
  return magic === 'ustar'
}

async function parseZipBuffer(buffer: Buffer): Promise<JSZip> {
  return JSZip.loadAsync(buffer)
}

async function parseTarBuffer(buffer: Buffer, gzipped: boolean): Promise<JSZip> {
  const tarBuffer = gzipped ? gunzipSync(buffer) : buffer
  if (!looksLikeTar(tarBuffer)) {
    throw new Error('not tar archive')
  }

  const zip = new JSZip()
  const extract = tarStream.extract()

  await new Promise<void>((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      const normalized = sanitizeRelativePath(String(header.name || ''))
      const closeEntry = () => {
        stream.resume()
        stream.on('end', next)
      }

      if (!normalized) {
        closeEntry()
        return
      }

      const tarType = String(header.type || 'file')
      if (tarType !== 'file' && tarType !== 'directory') {
        closeEntry()
        return
      }

      if (tarType === 'directory') {
        zip.folder(normalized.replace(/\/+$/, ''))
        closeEntry()
        return
      }

      const chunks: Buffer[] = []
      stream.on('data', chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      stream.on('end', () => {
        zip.file(normalized, Buffer.concat(chunks))
        next()
      })
      stream.on('error', reject)
    })

    extract.on('finish', resolve)
    extract.on('error', reject)
    Readable.from(tarBuffer).pipe(extract)
  })

  return zip
}

async function decodeArchiveToZip(params: {
  buffer: Buffer
  label: string
  preferred: ArchiveFormat | 'unknown'
}): Promise<JSZip> {
  const attempts: ArchiveFormat[] = params.preferred === 'unknown'
    ? ['zip', 'tar.gz', 'tar']
    : params.preferred === 'zip'
      ? ['zip', 'tar.gz', 'tar']
      : params.preferred === 'tar.gz'
        ? ['tar.gz', 'tar', 'zip']
        : ['tar', 'tar.gz', 'zip']

  let lastError: unknown
  for (const format of attempts) {
    try {
      if (format === 'zip') return await parseZipBuffer(params.buffer)
      if (format === 'tar.gz') return await parseTarBuffer(params.buffer, true)
      return await parseTarBuffer(params.buffer, false)
    } catch (error) {
      lastError = error
    }
  }

  throw new SkillInstallError(
    `下载内容不是有效 archive（支持 zip / tar / tar.gz）：${params.label}`,
    422,
    'INVALID_ARCHIVE',
    lastError instanceof Error ? lastError.message : undefined,
  )
}

async function downloadGithubZip(owner: string, repo: string, ref: string): Promise<JSZip> {
  const encodedRef = encodeURIComponent(ref)
  const archiveUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodedRef}`
  const response = await fetch(archiveUrl, {
    headers: {
      'User-Agent': 'LaborAny-SkillInstaller',
      'Accept': 'application/zip',
    },
  })

  const buffer = await readArchiveBuffer(response, `${owner}/${repo}@${ref}`)
  return decodeArchiveToZip({
    buffer,
    label: `${owner}/${repo}@${ref}`,
    preferred: 'zip',
  })
}

async function downloadArchiveFromUrl(url: string): Promise<JSZip> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'LaborAny-SkillInstaller',
      'Accept': 'application/zip,application/x-tar,application/gzip,application/octet-stream,*/*',
    },
  })

  const buffer = await readArchiveBuffer(response, url)
  const preferred = guessArchiveFormat(new URL(url).pathname, response.headers.get('content-type'))
  return decodeArchiveToZip({
    buffer,
    label: url,
    preferred,
  })
}

function listSkillDirectories(zip: JSZip): string[] {
  const entries = Object.values(zip.files)
  const skillMdFiles = entries.filter(item => !item.dir && /(^|\/)SKILL\.md$/i.test(item.name))
  return Array.from(new Set(skillMdFiles.map(item => item.name.replace(/\/SKILL\.md$/i, '')))).sort()
}

function selectSkillDirectory(params: {
  skillDirs: string[]
  treePath?: string
  sourceNameHint?: string
}): string {
  const { skillDirs } = params
  if (skillDirs.length === 1) {
    return skillDirs[0]
  }

  const normalizedTreePath = normalizeTreePath(params.treePath)
  if (normalizedTreePath) {
    const treeMatched = skillDirs.filter(dir => dir.endsWith(`/${normalizedTreePath}`) || dir === normalizedTreePath)
    if (treeMatched.length === 1) {
      return treeMatched[0]
    }
    throw new SkillInstallError(
      '指定路径中未找到唯一 SKILL.md，请确认是 skill 目录',
      422,
      'SKILL_PATH_NOT_FOUND',
      normalizedTreePath,
    )
  }

  const underSkills = skillDirs.filter(dir => /(^|\/)skills\//i.test(dir))
  if (underSkills.length === 1) {
    return underSkills[0]
  }

  const hint = (params.sourceNameHint || '').toLowerCase()
  if (hint) {
    const hintMatched = skillDirs.filter(dir => basename(dir).toLowerCase() === hint)
    if (hintMatched.length === 1) {
      return hintMatched[0]
    }
  }

  throw new SkillInstallError(
    `压缩包包含多个 skill 目录，请提供更精确的来源：${skillDirs.join(', ')}`,
    422,
    'SKILL_AMBIGUOUS',
  )
}

function selectProjectDirectoryForAdaptation(params: {
  zip: JSZip
  treePath?: string
  sourceNameHint?: string
}): string {
  const files = Object.values(params.zip.files)
    .filter(entry => !entry.dir)
    .map(entry => sanitizeRelativePath(entry.name))
    .filter((entry): entry is string => Boolean(entry))

  if (files.length === 0) {
    throw new SkillInstallError('压缩包内没有可用文件', 422, 'EMPTY_ARCHIVE')
  }

  const treePath = normalizeTreePath(params.treePath)
  if (treePath) {
    const matched = files.filter(file => file.includes(`/${treePath}/`) || file.endsWith(`/${treePath}`) || file.startsWith(`${treePath}/`))
    if (matched.length > 0) {
      const first = matched[0]
      const idx = first.indexOf(treePath)
      return idx >= 0 ? first.slice(0, idx + treePath.length) : treePath
    }
  }

  const topLevels = Array.from(new Set(files.map(file => file.split('/')[0])))
  if (topLevels.length === 1) {
    return topLevels[0]
  }

  const hint = (params.sourceNameHint || '').toLowerCase()
  if (hint) {
    const hit = topLevels.find(item => item.toLowerCase().includes(hint))
    if (hit) return hit
  }

  const skillLike = files.find(file => /(^|\/)skills\/[^/]+\//i.test(file))
  if (skillLike) {
    const match = skillLike.match(/^(.*?skills\/[^/]+)/i)
    if (match?.[1]) return match[1]
  }

  return topLevels.sort()[0]
}

async function writeSelectedSkill(params: {
  zip: JSZip
  selectedDir: string
  stagingDir: string
}): Promise<void> {
  const prefix = params.selectedDir ? `${params.selectedDir.replace(/\/+$/, '')}/` : ''
  const entries = Object.values(params.zip.files)

  for (const entry of entries) {
    if (prefix && !entry.name.startsWith(prefix)) continue
    if (!prefix && entry.name.startsWith('__MACOSX/')) continue

    const relativeRaw = prefix ? entry.name.slice(prefix.length) : entry.name
    const relativePath = sanitizeRelativePath(relativeRaw)
    if (!relativePath) continue

    const targetPath = join(params.stagingDir, ...relativePath.split('/'))

    if (entry.dir) {
      await mkdir(targetPath, { recursive: true })
      continue
    }

    await mkdir(dirname(targetPath), { recursive: true })
    const buffer = await entry.async('nodebuffer')
    await writeFile(targetPath, buffer)
  }
}

async function safeCleanup(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true }).catch(() => {})
}

function emitProgress(
  onProgress: ((event: InstallProgressEvent) => void | Promise<void>) | undefined,
  event: InstallProgressEvent,
): Promise<void> {
  if (!onProgress) return Promise.resolve()
  return Promise.resolve(onProgress(event))
}

export async function installSkillFromSource(params: {
  source: string
  onProgress?: (event: InstallProgressEvent) => void | Promise<void>
}): Promise<SkillInstallResult> {
  const parsed = parseRemoteInstallSource(params.source)
  if (!parsed.ok) {
    throw new SkillInstallError(
      parsed.error.message,
      parsed.error.status,
      parsed.error.code,
      parsed.error.detail,
    )
  }

  return installSkillFromNormalizedSource({
    source: parsed.value,
    onProgress: params.onProgress,
  })
}

export async function installSkillFromNormalizedSource(params: {
  source: NormalizedRemoteInstallSource
  onProgress?: (event: InstallProgressEvent) => void | Promise<void>
}): Promise<SkillInstallResult> {
  await emitProgress(params.onProgress, {
    stage: 'validate_source',
    message: '开始解析安装来源...',
  })

  const normalized = params.source
  let zip: JSZip
  let treePath: string | undefined

  if (normalized.type === 'github_repo' && normalized.github) {
    await emitProgress(params.onProgress, {
      stage: 'resolve_repo',
      message: `确认仓库: ${normalized.github.owner}/${normalized.github.repo}`,
    })
    const ref = normalized.github.ref || await fetchDefaultBranch(normalized.github.owner, normalized.github.repo)
    treePath = normalized.github.treePath

    await emitProgress(params.onProgress, {
      stage: 'download_archive',
      message: `下载 GitHub 仓库压缩包（分支: ${ref}）...`,
    })
    zip = await downloadGithubZip(normalized.github.owner, normalized.github.repo, ref)
  } else if (normalized.type === 'archive_url' && normalized.archiveUrl) {
    await emitProgress(params.onProgress, {
      stage: 'download_archive',
      message: '下载并解析 archive（zip/tar/tar.gz）...',
    })
    zip = await downloadArchiveFromUrl(normalized.archiveUrl)
  } else {
    throw new SkillInstallError('未知安装来源', 400, 'UNSUPPORTED_SOURCE')
  }

  await emitProgress(params.onProgress, {
    stage: 'extract_skill',
    message: '定位并提取 skill 目录...',
  })

  const skillDirs = listSkillDirectories(zip)
  let selectedDir = ''
  let sourceAdapted = false

  if (skillDirs.length > 0) {
    selectedDir = selectSkillDirectory({
      skillDirs,
      treePath,
      sourceNameHint: normalized.sourceNameHint,
    })
  } else {
    sourceAdapted = true
    selectedDir = selectProjectDirectoryForAdaptation({
      zip,
      treePath,
      sourceNameHint: normalized.sourceNameHint,
    })
    await emitProgress(params.onProgress, {
      stage: 'extract_skill',
      message: '来源不完全符合 LaborAny skill 结构，正在自动改造模板...',
    })
  }

  const userSkillsDir = loadSkill.getUserSkillsDir()
  const stagingDir = join(userSkillsDir, `.install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await mkdir(stagingDir, { recursive: true })

  try {
    await writeSelectedSkill({
      zip,
      selectedDir,
      stagingDir,
    })

    await emitProgress(params.onProgress, {
      stage: 'patch_metadata',
      message: '按 LaborAny 规范检查并补全 icon/category...',
    })

    const defaultName = normalizeSkillDisplayName(basename(selectedDir) || normalized.sourceNameHint || 'Imported Skill')
    const materialized = await materializeStagedSkillDirectory({
      stagingDir,
      fallbackName: defaultName,
      userSkillsDir,
    })

    await emitProgress(params.onProgress, {
      stage: 'finalize',
      message: `复制到用户目录: ${materialized.installedPath}`,
    })

    const summaryBase = `已安装为「${materialized.metadata.name}」(ID: ${materialized.skillId})，位置：${materialized.installedPath}`
    const summary = sourceAdapted || materialized.sourceAdapted
      ? `${summaryBase}。来源已自动改造为 LaborAny 兼容模板。`
      : summaryBase

    return {
      skillId: materialized.skillId,
      name: materialized.metadata.name,
      installedPath: materialized.installedPath,
      source: normalized.source,
      sourceType: normalized.type,
      metadataPatched: materialized.metadataPatched,
      metadata: {
        icon: materialized.metadata.icon || DEFAULT_SKILL_ICON,
        category: materialized.metadata.category || DEFAULT_SKILL_CATEGORY,
      },
      summary,
    }
  } catch (error) {
    await safeCleanup(stagingDir)
    throw error
  }
}
