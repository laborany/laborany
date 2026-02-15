import JSZip from 'jszip'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import { basename, dirname, extname, join, posix } from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { Readable } from 'stream'
import { gunzipSync } from 'zlib'
import * as tarStream from 'tar-stream'
import {
  loadSkill,
  generateCapabilityId,
  normalizeCapabilityDisplayName,
  pickUniqueCapabilityId,
} from 'laborany-shared'

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024
const DEFAULT_ICON = '🧩'
const DEFAULT_CATEGORY = '工具'

const CATEGORY_RULES: Array<{
  category: string
  icon: string
  keywords: string[]
}> = [
  { category: '开发', icon: '🛠️', keywords: ['开发', 'code', 'coding', 'program', 'api', 'automation', 'browser', 'web'] },
  { category: '写作', icon: '✍️', keywords: ['写作', 'writer', 'copywriting', 'content', 'blog', '文案'] },
  { category: '金融', icon: '📈', keywords: ['金融', '股票', '投资', 'finance', 'stock', 'trading'] },
  { category: '学术', icon: '📚', keywords: ['学术', '论文', 'research', 'paper', 'journal'] },
  { category: '设计', icon: '🎨', keywords: ['设计', 'design', 'ui', 'ux', 'figma'] },
  { category: '办公', icon: '📄', keywords: ['办公', 'word', 'excel', 'ppt', 'document', 'report', 'pdf'] },
  { category: '数据', icon: '📊', keywords: ['数据', '分析', 'analysis', 'analytics', 'dashboard', 'monitor'] },
  { category: '运营', icon: '📣', keywords: ['运营', 'marketing', '社媒', 'social', '增长'] },
]

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

interface GithubSource {
  source: string
  owner: string
  repo: string
  ref?: string
  treePath?: string
}

interface ParsedSkillMetadata {
  name: string
  description: string
  icon?: string
  category?: string
}

interface NormalizedInstallSource {
  type: 'github_repo' | 'archive_url'
  source: string
  github?: GithubSource
  archiveUrl?: string
  sourceNameHint: string
}

function normalizeSegments(value: string): string[] {
  return value
    .split('/')
    .map(item => item.trim())
    .filter(Boolean)
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

function validateOwnerRepo(value: string, field: 'owner' | 'repo'): string {
  const normalized = value.replace(/\.git$/i, '').trim()
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new SkillInstallError(`GitHub ${field} 不合法`, 400, 'INVALID_GITHUB_SOURCE')
  }
  return normalized
}

function tryParseGithubRepoSource(inputSource: string): GithubSource | null {
  const source = inputSource.trim()
  if (!source) return null

  const normalizedInput = source
    .replace(/^git\+/, '')
    .replace(/^github\.com\//i, 'https://github.com/')

  if (!/^https?:\/\//i.test(normalizedInput)) {
    const scpLike = normalizedInput.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i)
    if (scpLike) {
      return {
        source,
        owner: validateOwnerRepo(scpLike[1], 'owner'),
        repo: validateOwnerRepo(scpLike[2], 'repo'),
      }
    }

    const segments = normalizeSegments(normalizedInput)
    if (segments.length < 2) return null
    const owner = validateOwnerRepo(decodeURIComponent(segments[0]), 'owner')
    const repo = validateOwnerRepo(decodeURIComponent(segments[1]), 'repo')

    if (segments[2] === 'tree' && segments[3]) {
      return {
        source,
        owner,
        repo,
        ref: decodeURIComponent(segments[3]),
        treePath: normalizeTreePath(segments.slice(4).map(decodeURIComponent).join('/')),
      }
    }

    return {
      source,
      owner,
      repo,
      treePath: normalizeTreePath(segments.slice(2).map(decodeURIComponent).join('/')),
    }
  }

  let url: URL
  try {
    url = new URL(normalizedInput)
  } catch {
    return null
  }

  if (!/(^|\.)github\.com$/i.test(url.hostname)) return null

  const segments = normalizeSegments(url.pathname).map(item => decodeURIComponent(item))
  if (segments.length < 2) return null
  if (segments.includes('archive') || /\.(zip|tar|tar\.gz|tgz)$/i.test(url.pathname)) return null

  const owner = validateOwnerRepo(segments[0], 'owner')
  const repo = validateOwnerRepo(segments[1], 'repo')

  if (segments[2] === 'tree' && segments[3]) {
    return {
      source,
      owner,
      repo,
      ref: segments[3],
      treePath: normalizeTreePath(segments.slice(4).join('/')),
    }
  }

  return {
    source,
    owner,
    repo,
    treePath: normalizeTreePath(segments.slice(2).join('/')),
  }
}

function stripArchiveExt(fileName: string): string {
  return fileName
    .replace(/\.(tar\.gz|tgz|zip|tar)$/i, '')
    .trim() || fileName
}

function normalizeInstallSource(inputSource: string): NormalizedInstallSource {
  const source = inputSource.trim()
  if (!source) {
    throw new SkillInstallError('source 不能为空', 400, 'EMPTY_SOURCE')
  }

  const githubSource = tryParseGithubRepoSource(source)
  if (githubSource) {
    return {
      type: 'github_repo',
      source,
      github: githubSource,
      sourceNameHint: githubSource.repo,
    }
  }

  if (!/^https?:\/\//i.test(source)) {
    throw new SkillInstallError('仅支持 GitHub 地址或可下载 archive 链接', 400, 'UNSUPPORTED_SOURCE')
  }

  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new SkillInstallError('下载地址格式错误', 400, 'INVALID_SOURCE_URL')
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new SkillInstallError('仅支持 http/https 下载地址', 400, 'UNSUPPORTED_PROTOCOL')
  }

  const fileName = basename(url.pathname)
  const sourceNameHint = stripArchiveExt(basename(fileName, extname(fileName))) || 'imported-skill'

  return {
    type: 'archive_url',
    source,
    archiveUrl: source,
    sourceNameHint,
  }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/)
  if (!match) return null

  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>
    return { frontmatter: frontmatter || {}, body: match[2] || '\n' }
  } catch {
    return null
  }
}

function sanitizeRelativePath(input: string): string | null {
  const normalized = posix.normalize(input.replace(/\\/g, '/')).replace(/^\/+/, '')
  if (!normalized || normalized === '.') return null
  if (normalized.startsWith('../') || normalized === '..') return null
  if (normalized.split('/').some(segment => segment === '..' || !segment)) return null
  return normalized
}

function inferMetadata(rawText: string): { icon: string; category: string } {
  const text = rawText.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      return { icon: rule.icon, category: rule.category }
    }
  }
  return { icon: DEFAULT_ICON, category: DEFAULT_CATEGORY }
}

function normalizeDisplayName(name: string): string {
  return String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fallbackSkillId(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `skill-${Date.now()}`
}

function deriveDescriptionFromText(text: string, fallback = '导入自外部来源的 LaborAny 技能'): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`[\]\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return fallback
  return cleaned.slice(0, 180)
}

function ensureSkillInstallIntent(query: string): boolean {
  const text = query.toLowerCase()
  const installLike = /(安装|安裝|install|添加|加入|导入|接入|引入|下载|下載|clone|克隆)/
  const skillLike = /(skill|技能|能力|worker|助手)/
  const urlLike = /(https?:\/\/[^\s)\]}]+)|\b[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/[a-z0-9_.\-\/]+)?\b/i
  return installLike.test(text) && (skillLike.test(text) || urlLike.test(text))
}

export function isSkillInstallIntent(query: string): boolean {
  return ensureSkillInstallIntent(query)
}

function extractHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)\]}]+/i)
  return match ? match[0].replace(/[),.;，。；]+$/, '') : null
}

export function detectInstallSourceFromQuery(query: string): string | null {
  if (!ensureSkillInstallIntent(query)) return null

  const url = extractHttpUrl(query)
  if (url) return url

  const shortSource = query.match(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:tree\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\-\/]+|[A-Za-z0-9_.\-\/]+))?)\b/)
  return shortSource?.[1] || null
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

async function findReadmePath(stagingDir: string): Promise<string | null> {
  const directCandidates = ['README.md', 'readme.md', 'README.MD']
  for (const candidate of directCandidates) {
    const fullPath = join(stagingDir, candidate)
    if (existsSync(fullPath)) return fullPath
  }

  try {
    const entries = await readdir(stagingDir, { withFileTypes: true })
    const nestedReadmeDir = entries.find(entry => entry.isDirectory() && /^docs?$/i.test(entry.name))
    if (!nestedReadmeDir) return null
    const nestedPath = join(stagingDir, nestedReadmeDir.name, 'README.md')
    return existsSync(nestedPath) ? nestedPath : null
  } catch {
    return null
  }
}

async function ensureSkillTemplateForLaborAny(stagingDir: string, fallbackName: string): Promise<boolean> {
  const skillMdPath = join(stagingDir, 'SKILL.md')
  if (existsSync(skillMdPath)) return false

  const readmePath = await findReadmePath(stagingDir)
  const readmeText = readmePath ? await readFile(readmePath, 'utf-8').catch(() => '') : ''

  const candidateName = normalizeDisplayName(fallbackName || basename(stagingDir) || 'Imported Skill')
  const name = candidateName || 'Imported Skill'
  const description = deriveDescriptionFromText(readmeText, `${name}（外部来源）自动改造为 LaborAny 可安装技能`)
  const inferred = inferMetadata(`${name}\n${description}`)

  const frontmatter = stringifyYaml({
    name,
    description,
    icon: inferred.icon,
    category: inferred.category,
  }).trimEnd()

  const body = [
    '# Skill Overview',
    '',
    'This skill is auto-converted from an external source to match LaborAny skill format.',
    '',
    readmePath
      ? `Primary reference is kept at \`${basename(readmePath)}\`.`
      : 'No README was found in source package; please refine instructions as needed.',
    '',
    '## Usage',
    '',
    '- Read bundled references/scripts in this skill directory when needed.',
    '- Adjust this SKILL.md for your own workflow and execution constraints.',
    '',
  ].join('\n')

  await writeFile(skillMdPath, `---\n${frontmatter}\n---\n\n${body}`, 'utf-8')
  return true
}

async function patchSkillMetadata(stagingDir: string, fallbackName: string): Promise<{
  meta: ParsedSkillMetadata
  metadataPatched: { icon: boolean; category: boolean }
}> {
  const skillMdPath = join(stagingDir, 'SKILL.md')
  const skillYamlPath = join(stagingDir, 'skill.yaml')

  if (!existsSync(skillMdPath)) {
    throw new SkillInstallError('skill 目录缺少 SKILL.md', 422, 'SKILL_MD_MISSING')
  }

  const skillMdRaw = await readFile(skillMdPath, 'utf-8')
  const frontmatterParsed = parseFrontmatter(skillMdRaw)

  if (frontmatterParsed) {
    const frontmatter = frontmatterParsed.frontmatter
    const body = frontmatterParsed.body
    const bodyDescription = deriveDescriptionFromText(body, '')
    const name = (typeof frontmatter.name === 'string' && frontmatter.name.trim()) || normalizeDisplayName(fallbackName)
    const description = (typeof frontmatter.description === 'string' && frontmatter.description.trim()) || bodyDescription || `${name} for LaborAny`
    const existedIcon = typeof frontmatter.icon === 'string' ? frontmatter.icon.trim() : ''
    const existedCategory = typeof frontmatter.category === 'string' ? frontmatter.category.trim() : ''

    const inferred = inferMetadata(`${name}\n${description}`)
    const finalIcon = existedIcon || inferred.icon
    const finalCategory = existedCategory || inferred.category

    const metadataPatched = {
      icon: !existedIcon,
      category: !existedCategory,
    }

    const shouldRewrite = metadataPatched.icon
      || metadataPatched.category
      || !(typeof frontmatter.name === 'string' && frontmatter.name.trim())
      || !(typeof frontmatter.description === 'string' && frontmatter.description.trim())

    if (shouldRewrite) {
      const nextFrontmatter: Record<string, unknown> = {
        ...frontmatter,
        name,
        description,
        icon: finalIcon,
        category: finalCategory,
      }
      const yamlBody = stringifyYaml(nextFrontmatter).trimEnd()
      const nextSkillMd = `---\n${yamlBody}\n---${body.startsWith('\n') ? body : `\n${body}`}`
      await writeFile(skillMdPath, nextSkillMd, 'utf-8')
    }

    return {
      meta: {
        name,
        description,
        icon: finalIcon,
        category: finalCategory,
      },
      metadataPatched,
    }
  }

  if (!existsSync(skillYamlPath)) {
    const name = normalizeDisplayName(fallbackName || 'Imported Skill')
    const description = deriveDescriptionFromText(skillMdRaw, `${name} for LaborAny`)
    const inferred = inferMetadata(`${name}\n${description}`)
    const yamlBody = stringifyYaml({
      name,
      description,
      icon: inferred.icon,
      category: inferred.category,
    }).trimEnd()
    await writeFile(skillMdPath, `---\n${yamlBody}\n---\n\n${skillMdRaw}`, 'utf-8')
    return {
      meta: {
        name,
        description,
        icon: inferred.icon,
        category: inferred.category,
      },
      metadataPatched: {
        icon: true,
        category: true,
      },
    }
  }

  const yamlRaw = await readFile(skillYamlPath, 'utf-8')
  const yamlObject = parseYaml(yamlRaw) as Record<string, unknown> || {}
  const name = (typeof yamlObject.name === 'string' && yamlObject.name.trim()) || normalizeDisplayName(fallbackName)
  const description = (typeof yamlObject.description === 'string' && yamlObject.description.trim()) || deriveDescriptionFromText(skillMdRaw, `${name} for LaborAny`)
  const existedIcon = typeof yamlObject.icon === 'string' ? yamlObject.icon.trim() : ''
  const existedCategory = typeof yamlObject.category === 'string' ? yamlObject.category.trim() : ''

  const inferred = inferMetadata(`${name}\n${description}`)
  const finalIcon = existedIcon || inferred.icon
  const finalCategory = existedCategory || inferred.category

  const metadataPatched = {
    icon: !existedIcon,
    category: !existedCategory,
  }

  if (metadataPatched.icon || metadataPatched.category || !(typeof yamlObject.description === 'string' && yamlObject.description.trim())) {
    const nextYaml: Record<string, unknown> = {
      ...yamlObject,
      name,
      description,
      icon: finalIcon,
      category: finalCategory,
    }
    await writeFile(skillYamlPath, stringifyYaml(nextYaml), 'utf-8')
  }

  return {
    meta: {
      name,
      description,
      icon: finalIcon,
      category: finalCategory,
    },
    metadataPatched,
  }
}

async function createUniqueSkillId(displayName: string): Promise<string> {
  const normalizedName = normalizeCapabilityDisplayName(displayName || 'Imported Skill')
  const baseId = generateCapabilityId(normalizedName, 'skill') || fallbackSkillId(normalizedName)
  const existing = await loadSkill.listAll()
  const idSet = new Set(existing.map(item => item.id))
  return pickUniqueCapabilityId(baseId, idSet)
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
  await emitProgress(params.onProgress, {
    stage: 'validate_source',
    message: '开始解析安装来源...',
  })

  const normalized = normalizeInstallSource(params.source)
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

    if (sourceAdapted) {
      await ensureSkillTemplateForLaborAny(
        stagingDir,
        normalizeDisplayName(basename(selectedDir) || normalized.sourceNameHint || 'Imported Skill'),
      )
    }

    await emitProgress(params.onProgress, {
      stage: 'patch_metadata',
      message: '按 LaborAny 规范检查并补全 icon/category...',
    })

    const defaultName = normalizeDisplayName(basename(selectedDir) || normalized.sourceNameHint || 'Imported Skill')
    const patched = await patchSkillMetadata(stagingDir, defaultName)
    const finalSkillId = await createUniqueSkillId(patched.meta.name)
    const installedPath = join(userSkillsDir, finalSkillId)

    await emitProgress(params.onProgress, {
      stage: 'finalize',
      message: `复制到用户目录: ${installedPath}`,
    })

    if (existsSync(installedPath)) {
      throw new SkillInstallError('目标技能目录已存在，请重试', 409, 'SKILL_ID_CONFLICT')
    }

    await rename(stagingDir, installedPath)
    loadSkill.clearCache()

    const summaryBase = `已安装为「${patched.meta.name}」(ID: ${finalSkillId})，位置：${installedPath}`
    const summary = sourceAdapted
      ? `${summaryBase}。来源已自动改造为 LaborAny 兼容模板。`
      : summaryBase

    return {
      skillId: finalSkillId,
      name: patched.meta.name,
      installedPath,
      source: normalized.source,
      sourceType: normalized.type,
      metadataPatched: patched.metadataPatched,
      metadata: {
        icon: patched.meta.icon || DEFAULT_ICON,
        category: patched.meta.category || DEFAULT_CATEGORY,
      },
      summary,
    }
  } catch (error) {
    await safeCleanup(stagingDir)
    throw error
  }
}
