/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Profile 管理器                                        ║
 * ║                                                                          ║
 * ║  职责：管理用户画像（长期稳定的用户特征）                                   ║
 * ║  设计：证据链追踪 + 冲突解决 + 增量更新                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { DATA_DIR } from '../../paths.js'
import { evidenceTracker, type Evidence, type EvidencedValue } from './evidence.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface ProfileField {
  key: string
  value: string
  description: string
  evidences: string[]   // 证据来源列表
}

export interface ProfileSection {
  name: string
  fields: ProfileField[]
}

export interface Profile {
  version: number
  updatedAt: Date
  sections: ProfileSection[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const PROFILES_DIR = join(DATA_DIR, 'memory', 'profiles')
const PROFILE_PATH = join(PROFILES_DIR, 'PROFILE.md')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Profile 管理器类                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class ProfileManager {
  private profile: Profile | null = null

  private createDefaultProfile(): Profile {
    return {
      version: 0,
      updatedAt: new Date(),
      sections: [
        { name: '工作偏好', fields: [] },
        { name: '沟通风格', fields: [] },
        { name: '技术栈', fields: [] },
        { name: '个人信息', fields: [] },
      ],
    }
  }

  constructor() {
    ensureDir(PROFILES_DIR)
    this.load()
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  将 Profile 转换为 Markdown
   * ──────────────────────────────────────────────────────────────────────── */
  private toMarkdown(profile: Profile): string {
    const lines: string[] = []

    // YAML frontmatter
    lines.push('---')
    lines.push(`version: ${profile.version}`)
    lines.push(`updated: ${profile.updatedAt.toISOString()}`)
    lines.push('---')
    lines.push('')

    // 各个章节
    for (const section of profile.sections) {
      lines.push(`## ${section.name}`)
      lines.push('')

      if (section.fields.length > 0) {
        lines.push('| 偏好 | 描述 | 证据 |')
        lines.push('|------|------|------|')
        for (const field of section.fields) {
          const evidences = field.evidences.join(', ')
          lines.push(`| ${field.key} | ${field.description} | ${evidences} |`)
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  从 Markdown 解析 Profile
   * ──────────────────────────────────────────────────────────────────────── */
  private fromMarkdown(content: string): Profile {
    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    let version = 1
    let updatedAt = new Date()

    if (frontmatterMatch) {
      const lines = frontmatterMatch[1].split('\n')
      for (const line of lines) {
        if (line.startsWith('version:')) {
          version = parseInt(line.split(':')[1].trim()) || 1
        } else if (line.startsWith('updated:')) {
          updatedAt = new Date(line.split(':').slice(1).join(':').trim())
        }
      }
    }

    // 解析章节
    const sections: ProfileSection[] = []
    const sectionRegex = /## ([^\n]+)\n\n([\s\S]*?)(?=\n## |$)/g
    let match

    while ((match = sectionRegex.exec(content)) !== null) {
      const name = match[1].trim()
      const body = match[2]
      const fields: ProfileField[] = []

      // 解析表格
      const tableMatch = body.match(/\|[\s\S]*?\|[\s\S]*?\|\n\|[-\s|]+\|\n([\s\S]*?)(?=\n\n|$)/)
      if (tableMatch) {
        const rows = tableMatch[1].trim().split('\n')
        for (const row of rows) {
          const cells = row.split('|').map(s => s.trim()).filter(Boolean)
          if (cells.length >= 3) {
            fields.push({
              key: cells[0],
              value: cells[0],
              description: cells[1],
              evidences: cells[2].split(',').map(s => s.trim()).filter(Boolean),
            })
          }
        }
      }

      sections.push({ name, fields })
    }

    return { version, updatedAt, sections }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  加载 Profile
   * ──────────────────────────────────────────────────────────────────────── */
  load(): Profile {
    if (existsSync(PROFILE_PATH)) {
      const content = readFileSync(PROFILE_PATH, 'utf-8')
      this.profile = this.fromMarkdown(content)
    } else {
      // 创建默认 Profile
      this.profile = this.createDefaultProfile()
      this.save()
    }
    return this.profile
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  保存 Profile
   * ──────────────────────────────────────────────────────────────────────── */
  save(): void {
    if (!this.profile) return
    this.profile.updatedAt = new Date()
    this.profile.version++
    const content = this.toMarkdown(this.profile)
    writeFileSync(PROFILE_PATH, content, 'utf-8')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取当前 Profile
   * ──────────────────────────────────────────────────────────────────────── */
  get(): Profile {
    if (!this.profile) this.load()
    return this.profile!
  }

  reset(): Profile {
    this.profile = this.createDefaultProfile()
    this.save()
    return this.profile
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  更新字段（带冲突解决）
   *
   *  冲突解决策略：
   *  1. 如果新证据置信度更高，更新值
   *  2. 否则只添加证据，不更新值
   * ──────────────────────────────────────────────────────────────────────── */
  updateField(
    sectionName: string,
    key: string,
    description: string,
    evidence: string,
    confidence = 0.8
  ): void {
    if (!this.profile) this.load()

    // 找到或创建章节
    let section = this.profile!.sections.find(s => s.name === sectionName)
    if (!section) {
      section = { name: sectionName, fields: [] }
      this.profile!.sections.push(section)
    }

    // 找到或创建字段
    let field = section.fields.find(f => f.key === key)
    if (!field) {
      field = { key, value: key, description, evidences: [evidence] }
      section.fields.push(field)
    } else {
      // 冲突解决：新证据总是添加，描述可能更新
      if (!field.evidences.includes(evidence)) {
        field.evidences.push(evidence)
      }
      // 如果描述不同且有新证据，更新描述
      if (field.description !== description) {
        field.description = description
      }
    }

    this.save()
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取指定章节的所有字段
   * ──────────────────────────────────────────────────────────────────────── */
  getSection(sectionName: string): ProfileField[] {
    if (!this.profile) this.load()
    const section = this.profile!.sections.find(s => s.name === sectionName)
    return section?.fields || []
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取 Profile 的纯文本摘要（用于注入）
   * ──────────────────────────────────────────────────────────────────────── */
  getSummary(): string {
    if (!this.profile) this.load()

    const lines: string[] = ['# 用户画像', '']
    for (const section of this.profile!.sections) {
      if (section.fields.length === 0) continue
      lines.push(`## ${section.name}`)
      for (const field of section.fields) {
        lines.push(`- **${field.key}**: ${field.description}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const profileManager = new ProfileManager()
export { PROFILES_DIR, PROFILE_PATH }
