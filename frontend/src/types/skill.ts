/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      Skill 类型定义                                       ║
 * ║                                                                          ║
 * ║  统一管理所有 Skill/Worker 相关的类型定义                                   ║
 * ║  消除重复定义，确保类型一致性                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           基础类型                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** Skill 类型：区分普通 Skill 和元类型（如 skill-creator） */
export type SkillType = 'worker' | 'meta' | 'tool'

/** Skill 基础信息 */
export interface Skill {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
  type?: SkillType
}

/** 数字员工（人格化的 Skill） */
export interface DigitalWorker extends Skill {
  lastUsed?: string
  usageCount?: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件结构                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** Skill 文件信息 */
export interface SkillFile {
  name: string
  path: string
  type: string
  description: string
  content?: string
  children?: Array<{ name: string; path: string; type: string }>
}

/** Skill 详细配置 */
export interface SkillDetail {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
  files: SkillFile[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           对话消息                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 创建/优化对话消息 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           官方市场                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 官方技能 */
export interface OfficialSkill {
  id: string
  name: string
  description: string
  source: string
}

/** 安装状态 */
export interface InstallState {
  installing: string | null
  customUrl: string
  error: string | null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           元类型 ID 列表                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 元类型 Skill ID（不应在首页员工列表中显示） */
export const META_SKILL_IDS = new Set(['skill-creator', 'skill-optimizer'])

/** 判断是否为元类型 Skill */
export function isMetaSkill(skill: Skill): boolean {
  return skill.type === 'meta' || META_SKILL_IDS.has(skill.id)
}

/** 过滤出可展示的员工（排除元类型） */
export function filterDisplayWorkers(skills: Skill[]): DigitalWorker[] {
  return skills.filter(s => !isMetaSkill(s)) as DigitalWorker[]
}
