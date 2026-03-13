import { basename, extname, posix } from 'path'

export interface GithubInstallSource {
  source: string
  owner: string
  repo: string
  ref?: string
  treePath?: string
}

export interface NormalizedRemoteInstallSource {
  type: 'github_repo' | 'archive_url'
  source: string
  github?: GithubInstallSource
  archiveUrl?: string
  sourceNameHint: string
}

export interface RemoteInstallSourceError {
  message: string
  status: number
  code: string
  detail?: string
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
    throw {
      message: 'GitHub 路径不合法',
      status: 400,
      code: 'INVALID_GITHUB_PATH',
    } satisfies RemoteInstallSourceError
  }
  return normalized
}

function validateOwnerRepo(value: string, field: 'owner' | 'repo'): string {
  const normalized = value.replace(/\.git$/i, '').trim()
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw {
      message: `GitHub ${field} 不合法`,
      status: 400,
      code: 'INVALID_GITHUB_SOURCE',
    } satisfies RemoteInstallSourceError
  }
  return normalized
}

export function tryParseGithubRepoSource(inputSource: string): GithubInstallSource | null {
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

function extractHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)\]}]+/i)
  return match ? match[0].replace(/[),.;'"`，。；]+$/, '') : null
}

function isLikelyArchiveUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const pathname = url.pathname.toLowerCase()
    return pathname.endsWith('.zip')
      || pathname.endsWith('.tar')
      || pathname.endsWith('.tar.gz')
      || pathname.endsWith('.tgz')
  } catch {
    return false
  }
}

function stripCodeBlocks(value: string): string {
  return value.replace(/```[\s\S]*?```/g, '\n')
}

export function detectRemoteInstallSourceFromQuery(query: string): string | null {
  const sanitized = stripCodeBlocks(query)
  const url = extractHttpUrl(sanitized)
  if (url) {
    if (tryParseGithubRepoSource(url)) return url
    if (isLikelyArchiveUrl(url)) return url
    return null
  }

  const shortSource = sanitized.match(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:tree\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\-\/]+|[A-Za-z0-9_.\-\/]+))?)\b/)
  const candidate = shortSource?.[1] || ''
  return candidate && tryParseGithubRepoSource(candidate) ? candidate : null
}

export function isSkillInstallIntent(query: string): boolean {
  const text = query.toLowerCase()
  const installLike = /(安装|安裝|install|添加|加入|导入|接入|引入|下载|下載|clone|克隆|装)/
  const createLike = /(创建|建立|生成|新建|create|make)/
  const skillLike = /(skill|技能|能力|worker|助手)/
  const sourceHintLike = /(仓库|repo|repository|链接|連結|地址|来源|來源|url|网址|網址|路径|路徑|目录|目錄|源码|源碼)/
  const githubSourceHintLike = /(?:从|從|from)\s*github|github\s*(仓库|倉庫|repo|repository|链接|連結|地址|路径|路徑|目录|目錄|来源|來源)/
  const hasSourceHint = sourceHintLike.test(text) || githubSourceHintLike.test(text) || Boolean(detectRemoteInstallSourceFromQuery(query))

  return (
    installLike.test(text) && (skillLike.test(text) || hasSourceHint)
  ) || (
    createLike.test(text) && skillLike.test(text) && hasSourceHint
  )
}

export function parseRemoteInstallSource(inputSource: string): {
  ok: true
  value: NormalizedRemoteInstallSource
} | {
  ok: false
  error: RemoteInstallSourceError
} {
  const source = inputSource.trim()
  if (!source) {
    return {
      ok: false,
      error: {
        message: 'source 不能为空',
        status: 400,
        code: 'EMPTY_SOURCE',
      },
    }
  }

  try {
    const githubSource = tryParseGithubRepoSource(source)
    if (githubSource) {
      return {
        ok: true,
        value: {
          type: 'github_repo',
          source,
          github: githubSource,
          sourceNameHint: githubSource.repo,
        },
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error as RemoteInstallSourceError,
    }
  }

  if (!/^https?:\/\//i.test(source)) {
    return {
      ok: false,
      error: {
        message: '仅支持 GitHub 地址或可下载 archive 链接',
        status: 400,
        code: 'UNSUPPORTED_SOURCE',
      },
    }
  }

  let url: URL
  try {
    url = new URL(source)
  } catch {
    return {
      ok: false,
      error: {
        message: '下载地址格式错误',
        status: 400,
        code: 'INVALID_SOURCE_URL',
      },
    }
  }

  if (!/^https?:$/i.test(url.protocol)) {
    return {
      ok: false,
      error: {
        message: '仅支持 http/https 下载地址',
        status: 400,
        code: 'UNSUPPORTED_PROTOCOL',
      },
    }
  }

  const fileName = basename(url.pathname)
  const sourceNameHint = stripArchiveExt(basename(fileName, extname(fileName))) || 'imported-skill'

  return {
    ok: true,
    value: {
      type: 'archive_url',
      source,
      archiveUrl: source,
      sourceNameHint,
    },
  }
}
