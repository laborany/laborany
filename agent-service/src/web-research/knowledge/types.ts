export type AccessStrategy = 'cdp_only' | 'cdp_preferred' | 'static_ok'

export type PatternSource = 'builtin' | 'user'

export interface SiteSnippetField {
  selector: string
  prefix?: string
}

export interface SiteSearchEngineAutomation {
  mode: 'search_engine'
  entryUrl: string
  dismissSelectors?: string[]
  queryParam?: string
  languageParam?: string
  languageMap?: Record<string, string>
  recencyParam?: string
  recencyMap?: Record<string, string>
  waitSelector?: string
  resultSelector: string
  titleSelectors?: string[]
  linkSelector?: string
  snippetSelectors?: string[]
  blockedPatterns?: string[]
}

export interface SiteSearchFormAutomation {
  mode: 'site_form'
  entryUrl: string
  keywordAliases?: string[]
  dismissSelectors?: string[]
  openSelector?: string
  inputSelector: string
  submitSelector?: string
  submitMethod?: 'click' | 'enter' | 'form' | 'typeahead'
  waitUrlIncludes?: string
  waitSelector?: string
  postSubmitDelayMs?: number
  resultSelector: string
  titleSelectors?: string[]
  linkSelector?: string
  snippetFields?: SiteSnippetField[]
}

export type SiteSearchAutomation =
  | SiteSearchEngineAutomation
  | SiteSearchFormAutomation

export interface SiteReadGenericAutomation {
  mode: 'generic'
  waitUrlIncludes?: string
  readySelector?: string
  rootSelectors?: string[]
  removeSelectors?: string[]
}

export interface SiteReadStructuredStats {
  like?: string[]
  collect?: string[]
  comment?: string[]
}

export interface SiteReadStructuredAutomation {
  mode: 'structured_note'
  waitUrlIncludes?: string
  readySelector?: string
  rootSelector: string
  titleSelectors?: string[]
  authorSelectors?: string[]
  publishedAtSelectors?: string[]
  bodySelectors?: string[]
  tagSelectors?: string[]
  statSelectors?: SiteReadStructuredStats
  imageSelector?: string
  commentSelector?: string
  commentAuthorSelectors?: string[]
  commentBodySelectors?: string[]
  commentMetaSelectors?: string[]
  replyCommentClass?: string
  commentLimit?: number
}

export interface SiteReadStructuredVideoAutomation {
  mode: 'structured_video'
  waitUrlIncludes?: string
  readySelector?: string
  rootSelector?: string
  titleSelectors?: string[]
  authorSelectors?: string[]
  publishedAtSelectors?: string[]
  viewCountSelectors?: string[]
  descriptionSelectors?: string[]
  tagSelectors?: string[]
  transcriptContainerSelectors?: string[]
  transcriptSegmentSelectors?: string[]
}

export type SiteReadAutomation =
  | SiteReadGenericAutomation
  | SiteReadStructuredAutomation
  | SiteReadStructuredVideoAutomation

export interface SiteAutomation {
  search?: SiteSearchAutomation
  read?: SiteReadAutomation
}

export interface SitePattern {
  domain: string
  aliases: string[]
  accessStrategy: AccessStrategy
  verifiedAt: string          // ISO date string
  evidenceCount: number
  characteristics: string     // 平台特征描述
  effectivePatterns: string   // 有效模式描述
  knownPitfalls: string       // 已知陷阱描述
  source: PatternSource       // 来源：内置 or 用户自定义
  automation?: SiteAutomation | null
}

export interface SiteMatchResult {
  pattern: SitePattern
  matchedBy: 'domain' | 'alias'
  matchedTerm: string
}
