import { readdir, readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import type {
  SitePattern,
  AccessStrategy,
  PatternSource,
  SiteAutomation,
} from './types.js'
import { matchByUrl, matchByQuery, extractDomain } from './pattern-matcher.js'

const LOG_PREFIX = '[SiteKnowledge]'

/**
 * 解析 Markdown with YAML frontmatter 格式的站点经验文件
 */
function parsePatternFile(
  content: string,
  source: PatternSource,
): SitePattern | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('---')) return null

  const secondDash = trimmed.indexOf('---', 3)
  if (secondDash === -1) return null

  const frontmatter = trimmed.slice(3, secondDash).trim()
  const body = trimmed.slice(secondDash + 3).trim()

  // 解析 YAML frontmatter（简单字符串分割）
  const fields: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    fields[key] = value
  }

  if (!fields['domain']) return null

  // 解析 aliases: [小红书, RED, xhs]
  let aliases: string[] = []
  if (fields['aliases']) {
    const aliasStr = fields['aliases']
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .trim()
    if (aliasStr) {
      aliases = aliasStr.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }

  // 解析 body 中的三个 section
  const characteristics = extractSection(body, '## 平台特征')
  const effectivePatterns = extractSection(body, '## 有效模式')
  const knownPitfalls = extractSection(body, '## 已知陷阱')
  const automation = parseAutomationSection(body)

  return {
    domain: fields['domain'],
    aliases,
    accessStrategy: (fields['access_strategy'] || 'static_ok') as AccessStrategy,
    verifiedAt: fields['verified_at'] || new Date().toISOString().slice(0, 10),
    evidenceCount: parseInt(fields['evidence_count'] || '0', 10) || 0,
    characteristics,
    effectivePatterns,
    knownPitfalls,
    source,
    automation,
  }
}

/**
 * 从 Markdown body 中提取指定 ## 标题下的内容
 */
function extractSection(body: string, heading: string): string {
  const headingIdx = body.indexOf(heading)
  if (headingIdx === -1) return ''

  const contentStart = headingIdx + heading.length
  // 找下一个 ## 标题或文件末尾
  const nextHeading = body.indexOf('\n## ', contentStart)
  const sectionContent =
    nextHeading === -1
      ? body.slice(contentStart)
      : body.slice(contentStart, nextHeading)

  return sectionContent.trim()
}

function parseAutomationSection(body: string): SiteAutomation | null {
  const section = extractSection(body, '## 自动化配置')
  if (!section) return null

  const codeBlockMatch = section.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonCandidate = codeBlockMatch?.[1]?.trim() || section.trim()
  if (!jsonCandidate) return null

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as SiteAutomation
  } catch {
    console.log(`${LOG_PREFIX} Failed to parse automation config section`)
    return null
  }
}

/**
 * 将 SitePattern 序列化为 Markdown with YAML frontmatter 格式
 */
function serializePattern(pattern: SitePattern): string {
  const aliasesStr =
    pattern.aliases.length > 0 ? `[${pattern.aliases.join(', ')}]` : '[]'

  const lines = [
    '---',
    `domain: ${pattern.domain}`,
    `aliases: ${aliasesStr}`,
    `access_strategy: ${pattern.accessStrategy}`,
    `verified_at: ${pattern.verifiedAt}`,
    `evidence_count: ${pattern.evidenceCount}`,
    '---',
    '',
  ]

  if (pattern.characteristics) {
    lines.push('## 平台特征', pattern.characteristics, '')
  }
  if (pattern.effectivePatterns) {
    lines.push('## 有效模式', pattern.effectivePatterns, '')
  }
  if (pattern.knownPitfalls) {
    lines.push('## 已知陷阱', pattern.knownPitfalls, '')
  }
  if (pattern.automation) {
    lines.push(
      '## 自动化配置',
      '```json',
      JSON.stringify(pattern.automation, null, 2),
      '```',
      '',
    )
  }

  return lines.join('\n')
}

/**
 * 站点经验管理类
 * 负责站点经验的加载、查询、更新
 *
 * 双目录架构：
 * - builtinPatternsDir: 内置经验（只读，随 app 分发）
 * - userDataDir: 用户经验（可写，运行时数据）
 *
 * 加载时合并，用户经验优先覆盖同名内置经验。
 * 自动观察先进入 candidate，review 通过后再进入 verified。
 */
export class SiteKnowledge {
  private userDataDir: string
  private builtinPatternsDir: string
  private userVerifiedDir: string
  private userCandidateDir: string
  private patterns: Map<string, SitePattern> = new Map()
  private candidatePatterns: Map<string, SitePattern> = new Map()
  private builtinCount = 0
  private userCount = 0
  private candidateCount = 0

  constructor(
    userDataDir: string,
    builtinPatternsDir: string,
  ) {
    this.userDataDir = userDataDir
    this.builtinPatternsDir = builtinPatternsDir
    this.userVerifiedDir = join(userDataDir, 'verified')
    this.userCandidateDir = join(userDataDir, 'candidate')
  }

  async init(): Promise<void> {
    await mkdir(this.userVerifiedDir, { recursive: true })
    await mkdir(this.userCandidateDir, { recursive: true })
    await this.loadPatterns()
  }

  private async loadPatterns(): Promise<void> {
    this.patterns.clear()
    this.candidatePatterns.clear()

    this.builtinCount = await this.loadFromDir(
      this.builtinPatternsDir,
      'builtin',
    )
    this.userCount = await this.loadFromDir(this.userVerifiedDir, 'user')
    this.candidateCount = await this.loadCandidatePatterns()

    console.log(
      `${LOG_PREFIX} Initialized with ${this.patterns.size} active patterns (${this.builtinCount} builtin, ${this.userCount} user, ${this.candidateCount} candidate)`,
    )
  }

  private async loadCandidatePatterns(): Promise<number> {
    let files: string[]
    try {
      files = await readdir(this.userCandidateDir)
    } catch {
      return 0
    }

    let loaded = 0
    for (const file of files.filter(f => f.endsWith('.md'))) {
      try {
        const content = await readFile(join(this.userCandidateDir, file), 'utf-8')
        const pattern = parsePatternFile(content, 'user')
        if (!pattern) continue
        const merged = mergeUserPattern(this.patterns.get(pattern.domain.toLowerCase()) || null, pattern)
        this.candidatePatterns.set(merged.domain.toLowerCase(), merged)
        loaded++
      } catch (err) {
        console.log(`${LOG_PREFIX} Error reading candidate pattern file ${file}:`, err)
      }
    }

    return loaded
  }

  private async loadFromDir(
    dir: string,
    source: PatternSource,
  ): Promise<number> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      if (source === 'builtin') {
        console.log(`${LOG_PREFIX} Builtin patterns directory not found: ${dir}`)
      }
      return 0
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'))
    let loaded = 0

    for (const file of mdFiles) {
      try {
        const content = await readFile(join(dir, file), 'utf-8')
        const parsedPattern = parsePatternFile(content, source)
        const pattern = source === 'user' && parsedPattern
          ? mergeUserPattern(this.patterns.get(parsedPattern.domain.toLowerCase()) || null, parsedPattern)
          : parsedPattern
        if (pattern) {
          this.patterns.set(pattern.domain.toLowerCase(), pattern)
          loaded++
        } else {
          console.log(`${LOG_PREFIX} Failed to parse pattern file: ${file}`)
        }
      } catch (err) {
        console.log(`${LOG_PREFIX} Error reading pattern file ${file}:`, err)
      }
    }

    return loaded
  }

  matchUrl(url: string): SitePattern | null {
    const result = matchByUrl(url, Array.from(this.patterns.values()))
    return result ? result.pattern : null
  }

  matchQuery(query: string): SitePattern | null {
    const result = matchByQuery(query, Array.from(this.patterns.values()))
    return result ? result.pattern : null
  }

  matchUrlHint(url: string): SitePattern | null {
    const result = matchByUrl(url, this.getDecisionPatterns())
    return result ? result.pattern : null
  }

  matchQueryHint(query: string): SitePattern | null {
    const result = matchByQuery(query, this.getDecisionPatterns())
    return result ? result.pattern : null
  }

  getPattern(domain: string): SitePattern | null {
    return this.patterns.get(domain.toLowerCase()) || null
  }

  getDecisionPattern(domain: string): SitePattern | null {
    const normalizedDomain = domain.toLowerCase()
    const verified = this.patterns.get(normalizedDomain) || null
    const candidate = this.candidatePatterns.get(normalizedDomain) || null
    if (verified && candidate) {
      return mergeUserPattern(verified, candidate)
    }
    return candidate || verified
  }

  getCandidatePattern(domain: string): SitePattern | null {
    return this.candidatePatterns.get(domain.toLowerCase()) || null
  }

  getAllPatterns(): SitePattern[] {
    return Array.from(this.patterns.values())
  }

  getAllCandidatePatterns(): SitePattern[] {
    return Array.from(this.candidatePatterns.values())
  }

  async recordSuccess(
    domain: string,
    evidence: {
      method: string
      url?: string
      observations?: string[]
      accessStrategy?: AccessStrategy
      aliases?: string[]
      automation?: SitePattern['automation']
      characteristics?: string
      knownPitfalls?: string
    },
  ): Promise<void> {
    const normalizedDomain = domain.toLowerCase()
    const existing = this.patterns.get(normalizedDomain)
    const existingCandidate = this.candidatePatterns.get(normalizedDomain)
    const observationLines = resolveObservationLines(evidence)

    if (existing || existingCandidate) {
      const candidate = existingCandidate
        ? { ...existingCandidate }
        : buildObservedCandidate(existing!, evidence, normalizedDomain)
      candidate.evidenceCount += 1
      candidate.verifiedAt = new Date().toISOString().slice(0, 10)
      candidate.source = 'user'
      candidate.aliases = mergeAliases(candidate.aliases, evidence.aliases)
      candidate.accessStrategy = mergeAccessStrategy(candidate.accessStrategy, evidence.accessStrategy)
      candidate.automation = mergeAutomationConfig(candidate.automation || null, evidence.automation || null)
      if (evidence.characteristics) {
        candidate.characteristics = appendKnowledgeLine(candidate.characteristics, evidence.characteristics)
      }
      if (evidence.knownPitfalls) {
        candidate.knownPitfalls = appendKnowledgeLine(candidate.knownPitfalls, evidence.knownPitfalls)
      }
      for (const line of observationLines) {
        candidate.effectivePatterns = appendObservationLine(candidate.effectivePatterns, line)
      }
      this.candidatePatterns.set(normalizedDomain, candidate)
      await this.saveCandidatePattern(candidate)
      console.log(`${LOG_PREFIX} Updated candidate evidence for ${normalizedDomain}: count=${candidate.evidenceCount}`)
    } else if (shouldAutoCreateCandidate(evidence)) {
      const newPattern: SitePattern = {
        domain: normalizedDomain,
        aliases: mergeAliases([], evidence.aliases),
        accessStrategy: evidence.accessStrategy || inferAccessStrategyFromMethod(evidence.method),
        verifiedAt: new Date().toISOString().slice(0, 10),
        evidenceCount: 1,
        characteristics: evidence.characteristics || inferCharacteristicsFromMethod(evidence.method),
        effectivePatterns: observationLines.join('\n').trim() || formatObservationLine(evidence),
        knownPitfalls: evidence.knownPitfalls || '',
        source: 'user',
        automation: evidence.automation || null,
      }
      this.candidatePatterns.set(normalizedDomain, newPattern)
      await this.saveCandidatePattern(newPattern)
      console.log(`${LOG_PREFIX} Auto-created candidate pattern for ${normalizedDomain} (${newPattern.accessStrategy})`)
    }
  }

  private async savePattern(pattern: SitePattern): Promise<void> {
    const filePath = join(this.userVerifiedDir, `${pattern.domain}.md`)
    await writeFile(filePath, serializePattern(pattern), 'utf-8')
    this.userCount = await this.countMarkdownFiles(this.userVerifiedDir)
  }

  private async saveCandidatePattern(pattern: SitePattern): Promise<void> {
    const filePath = join(this.userCandidateDir, `${pattern.domain}.md`)
    await writeFile(filePath, serializePattern(pattern), 'utf-8')
    this.candidateCount = await this.countMarkdownFiles(this.userCandidateDir)
  }

  private async removeCandidatePattern(domain: string): Promise<void> {
    try {
      await unlink(join(this.userCandidateDir, `${domain}.md`))
    } catch {
      // ignore if already gone
    }
    this.candidatePatterns.delete(domain.toLowerCase())
    this.candidateCount = await this.countMarkdownFiles(this.userCandidateDir)
  }

  getFormattedInfo(domain: string): string {
    const pattern = this.getPattern(domain)
    if (!pattern) {
      return `未找到 ${domain} 的站点经验记录。`
    }

    const sourceLabel = pattern.source === 'builtin' ? '内置' : '用户自定义'
    const lines: string[] = [
      `# ${pattern.domain} 站点经验`,
      '',
      `- 来源: ${sourceLabel}`,
      `- 访问策略: ${formatAccessStrategy(pattern.accessStrategy)}`,
      `- 别名: ${pattern.aliases.length > 0 ? pattern.aliases.join(', ') : '无'}`,
      `- 验证时间: ${pattern.verifiedAt}`,
      `- 成功操作次数: ${pattern.evidenceCount}`,
    ]

    if (pattern.characteristics) {
      lines.push('', '## 平台特征', pattern.characteristics)
    }
    if (pattern.effectivePatterns) {
      lines.push('', '## 有效模式', pattern.effectivePatterns)
    }
    if (pattern.knownPitfalls) {
      lines.push('', '## 已知陷阱', pattern.knownPitfalls)
    }

    return lines.join('\n')
  }

  getPatternMarkdown(domain: string): string | null {
    const pattern = this.getPattern(domain)
    if (!pattern) return null
    return serializePattern(pattern)
  }

  getCandidatePatternMarkdown(domain: string): string | null {
    const pattern = this.getCandidatePattern(domain)
    if (!pattern) return null
    return serializePattern(pattern)
  }

  getStats(): {
    totalCount: number
    builtinCount: number
    userCount: number
    candidateCount: number
  } {
    return {
      totalCount: this.patterns.size,
      builtinCount: this.builtinCount,
      userCount: this.userCount,
      candidateCount: this.candidateCount,
    }
  }

  getPaths(): {
    rootDir: string
    verifiedDir: string
    candidateDir: string
    builtinDir: string
  } {
    return {
      rootDir: this.userDataDir,
      verifiedDir: this.userVerifiedDir,
      candidateDir: this.userCandidateDir,
      builtinDir: this.builtinPatternsDir,
    }
  }

  async importPattern(
    content: string,
    options?: { filename?: string; scope?: 'verified' | 'candidate' },
  ): Promise<SitePattern> {
    const parsedPattern = parsePatternFile(content, 'user')
    if (!parsedPattern) {
      throw new Error('站点经验内容格式无效，必须是带 frontmatter 的 Markdown。')
    }
    const pattern = mergeUserPattern(
      this.patterns.get(parsedPattern.domain.toLowerCase()) || null,
      parsedPattern,
    )

    const scope = options?.scope === 'verified' ? 'verified' : 'candidate'
    const fileName = sanitizePatternFileName(options?.filename || `${pattern.domain}.md`)
    const targetDir = scope === 'candidate' ? this.userCandidateDir : this.userVerifiedDir
    await writeFile(join(targetDir, fileName), serializePattern(pattern), 'utf-8')

    if (scope === 'verified') {
      this.patterns.set(pattern.domain.toLowerCase(), pattern)
      this.userCount = await this.countMarkdownFiles(this.userVerifiedDir)
      if (this.candidatePatterns.has(pattern.domain.toLowerCase())) {
        await this.removeCandidatePattern(pattern.domain.toLowerCase())
      }
    } else {
      this.candidatePatterns.set(pattern.domain.toLowerCase(), pattern)
      this.candidateCount = await this.countMarkdownFiles(this.userCandidateDir)
    }

    console.log(`${LOG_PREFIX} Imported pattern for ${pattern.domain} into ${scope}`)
    return pattern
  }

  async reviewCandidate(
    domain: string,
    action: 'approve' | 'reject',
  ): Promise<SitePattern | null> {
    const normalizedDomain = domain.toLowerCase()
    const candidate = this.candidatePatterns.get(normalizedDomain)
    if (!candidate) {
      throw new Error(`未找到 ${domain} 的 candidate pattern`)
    }

    if (action === 'reject') {
      await this.removeCandidatePattern(normalizedDomain)
      console.log(`${LOG_PREFIX} Rejected candidate pattern for ${normalizedDomain}`)
      return null
    }

    const merged = mergeUserPattern(this.patterns.get(normalizedDomain) || null, candidate)
    merged.source = 'user'
    await this.savePattern(merged)
    this.patterns.set(normalizedDomain, merged)
    await this.removeCandidatePattern(normalizedDomain)
    console.log(`${LOG_PREFIX} Approved candidate pattern for ${normalizedDomain}`)
    return merged
  }

  private async countMarkdownFiles(dir: string): Promise<number> {
    try {
      const files = await readdir(dir)
      return files.filter(file => file.endsWith('.md')).length
    } catch {
      return 0
    }
  }

  private getDecisionPatterns(): SitePattern[] {
    const merged = new Map<string, SitePattern>()

    for (const [domain, pattern] of this.patterns.entries()) {
      merged.set(domain, pattern)
    }

    for (const [domain, candidate] of this.candidatePatterns.entries()) {
      const existing = merged.get(domain)
      merged.set(domain, existing ? mergeUserPattern(existing, candidate) : candidate)
    }

    return Array.from(merged.values())
  }
}

function formatAccessStrategy(strategy: AccessStrategy): string {
  switch (strategy) {
    case 'cdp_only':
      return 'CDP 专用（必须使用浏览器）'
    case 'cdp_preferred':
      return 'CDP 优先（优先浏览器，可降级）'
    case 'static_ok':
      return '静态可用（普通 HTTP 请求即可）'
  }
}

function mergeUserPattern(
  builtinPattern: SitePattern | null,
  userPattern: SitePattern,
): SitePattern {
  if (!builtinPattern) {
    return userPattern
  }

  return {
    ...builtinPattern,
    ...userPattern,
    aliases: userPattern.aliases.length > 0 ? userPattern.aliases : builtinPattern.aliases,
    characteristics: userPattern.characteristics || builtinPattern.characteristics,
    effectivePatterns: userPattern.effectivePatterns || builtinPattern.effectivePatterns,
    knownPitfalls: userPattern.knownPitfalls || builtinPattern.knownPitfalls,
    verifiedAt: userPattern.verifiedAt || builtinPattern.verifiedAt,
    evidenceCount: userPattern.evidenceCount > 0 ? userPattern.evidenceCount : builtinPattern.evidenceCount,
    automation: mergeAutomationConfig(builtinPattern.automation || null, userPattern.automation || null),
    source: 'user',
  }
}

function buildObservedCandidate(
  basePattern: SitePattern,
  evidence: { method: string; url?: string; observations?: string[] },
  normalizedDomain: string,
): SitePattern {
  return {
    ...basePattern,
    domain: normalizedDomain,
    source: 'user',
    verifiedAt: new Date().toISOString().slice(0, 10),
    evidenceCount: 0,
    effectivePatterns: resolveObservationLines(evidence).reduce(
      (section, line) => appendObservationLine(section, line),
      basePattern.effectivePatterns,
    ),
  }
}

function appendObservationLine(section: string, line: string): string {
  const normalized = section.trim()
  if (!normalized) return line
  if (normalized.includes(line)) return normalized

  const combined = `${normalized}\n${line}`.trim()
  const maxAutoObservations = 10
  const lines = combined.split('\n')
  const manualLines: string[] = []
  const autoLines: string[] = []

  for (const currentLine of lines) {
    if (currentLine.includes('[auto-observation]')) {
      autoLines.push(currentLine)
    } else {
      manualLines.push(currentLine)
    }
  }

  const trimmedAutoLines = autoLines.length > maxAutoObservations
    ? autoLines
      .map(currentLine => ({ line: currentLine, score: scoreObservation(currentLine) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxAutoObservations)
      .map(item => item.line)
    : autoLines

  return [...manualLines, ...trimmedAutoLines].join('\n').trim()
}

function scoreObservation(line: string): number {
  if (!line) return 0
  if (line.includes('fallback')) return 100
  if (line.includes('站内搜索自动化')) return 80

  if (line.includes('?')) {
    let score = 50
    if (line.includes('search') || line.includes('query') || line.includes('page') || line.includes('keyword') || line.includes('q=')) {
      score += 10
    }
    const slashCount = (line.match(/\//g) || []).length
    if (slashCount > 4) {
      score += 5
    }
    return score
  }

  const urlMatch = line.match(/https?:\/\/[^\s]+/)
  if (urlMatch) {
    const url = urlMatch[0]
    const pathPart = url.replace(/https?:\/\//, '')
    if (pathPart.length > 20) return 30
    if (pathPart.includes('/')) return 20
  }

  return 10
}

function appendKnowledgeLine(section: string, line: string): string {
  const normalizedLine = line.trim()
  if (!normalizedLine) return section.trim()
  const normalizedSection = section.trim()
  if (!normalizedSection) return normalizedLine
  if (normalizedSection.includes(normalizedLine)) return normalizedSection
  return `${normalizedSection}\n${normalizedLine}`.trim()
}

function resolveObservationLines(evidence: {
  method: string
  url?: string
  observations?: string[]
}): string[] {
  const explicit = (evidence.observations || [])
    .map(line => line.trim())
    .filter(Boolean)

  if (explicit.length > 0) {
    return explicit
  }

  return [formatObservationLine(evidence)]
}

function formatObservationLine(evidence: { method: string; url?: string }): string {
  const urlSuffix = evidence.url ? `: ${evidence.url}` : ''

  switch (evidence.method) {
    case 'cdp':
      return `- [auto-observation] 通过 CDP 浏览器成功读取页面${urlSuffix}`
    case 'cdp_search':
      return `- [auto-observation] 通过站内搜索自动化成功找到结果${urlSuffix}`
    case 'search_fallback':
      return `- [auto-observation] 站内搜索失败后，搜索引擎 fallback 成功${urlSuffix}`
    default:
      return evidence.url
        ? `- [auto-observation] 成功使用 ${evidence.method}: ${evidence.url}`
        : `- [auto-observation] 成功使用 ${evidence.method}`
  }
}

function mergeAliases(currentAliases: string[], nextAliases?: string[]): string[] {
  const merged = new Set<string>()
  for (const alias of currentAliases) {
    const trimmed = alias.trim()
    if (trimmed) merged.add(trimmed)
  }
  for (const alias of nextAliases || []) {
    const trimmed = alias.trim()
    if (trimmed) merged.add(trimmed)
  }
  return Array.from(merged)
}

function mergeAccessStrategy(
  current: AccessStrategy,
  next?: AccessStrategy,
): AccessStrategy {
  if (!next) return current

  const rank: Record<AccessStrategy, number> = {
    static_ok: 1,
    cdp_preferred: 2,
    cdp_only: 3,
  }

  return rank[next] > rank[current] ? next : current
}

function shouldAutoCreateCandidate(evidence: {
  method: string
  accessStrategy?: AccessStrategy
  automation?: SitePattern['automation']
}): boolean {
  if (evidence.automation) return true
  if (evidence.accessStrategy) return true

  return [
    'cdp',
    'cdp_search',
    'search_fallback',
    'structured_read',
    'browser_fallback',
  ].includes(evidence.method)
}

function inferAccessStrategyFromMethod(method: string): AccessStrategy {
  switch (method) {
    case 'search_fallback':
      return 'static_ok'
    case 'cdp':
    case 'cdp_search':
    case 'structured_read':
    case 'browser_fallback':
    default:
      return 'cdp_preferred'
  }
}

function inferCharacteristicsFromMethod(method: string): string {
  switch (method) {
    case 'search_fallback':
      return '- 已验证可通过搜索引擎稳定发现该站点结果'
    case 'cdp_search':
      return '- 已验证浏览器站内搜索或浏览器定向搜索可稳定获取该站点结果'
    case 'structured_read':
      return '- 已验证需要结构化浏览器提取才能稳定获取完整内容'
    case 'browser_fallback':
      return '- 静态读取不稳定，浏览器兜底可成功获取内容'
    case 'cdp':
    default:
      return '- 需要浏览器动态渲染才能获取完整内容'
  }
}

function mergeAutomationConfig(
  builtinAutomation: SitePattern['automation'],
  userAutomation: SitePattern['automation'],
): SitePattern['automation'] {
  if (!builtinAutomation && !userAutomation) return null

  const search = builtinAutomation?.search || userAutomation?.search
    ? {
      ...(builtinAutomation?.search || {}),
      ...(userAutomation?.search || {}),
    } as NonNullable<SitePattern['automation']>['search']
    : undefined

  const read = builtinAutomation?.read || userAutomation?.read
    ? {
      ...(builtinAutomation?.read || {}),
      ...(userAutomation?.read || {}),
    } as NonNullable<SitePattern['automation']>['read']
    : undefined

  return {
    ...(builtinAutomation || {}),
    ...(userAutomation || {}),
    search,
    read,
  }
}

export { parsePatternFile, serializePattern, extractDomain }

function sanitizePatternFileName(fileName: string): string {
  const trimmed = fileName.trim() || 'site-pattern.md'
  const normalized = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
  return normalized.replace(/[^a-zA-Z0-9._-]/g, '-')
}
