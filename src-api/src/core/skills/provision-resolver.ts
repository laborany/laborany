import {
  detectRemoteInstallSourceFromQuery,
  isSkillInstallIntent,
} from './remote-install-source.js'
import type { SkillProvisionResolution } from './provision-types.js'

const INLINE_NAME_LABELS = ['name', 'skill name', '名称', '技能名']
const INLINE_DESCRIPTION_LABELS = ['description', 'skill description', '描述', '简介', '说明']

function normalizeText(value: string): string {
  return String(value || '').replace(/\r\n?/g, '\n').trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripCodeBlocks(value: string): string {
  return value.replace(/```[\s\S]*?```/g, '\n')
}

function hasLabeledField(text: string, labels: string[]): boolean {
  return labels.some((label) => {
    const pattern = new RegExp(`(^|\\n)\\s*(?:#{1,6}\\s*)?${escapeRegex(label)}\\s*[:：]`, 'i')
    return pattern.test(text)
  })
}

function hasFrontmatterSkillMeta(text: string): boolean {
  if (!/^---\s*\n[\s\S]*?\n---/m.test(text)) return false
  return /^\s*name\s*:/mi.test(text) && /^\s*description\s*:/mi.test(text)
}

function looksLikeInlineSkillSpec(query: string): boolean {
  const normalized = normalizeText(query)
  if (normalized.length < 120) return false

  if (hasFrontmatterSkillMeta(normalized)) return true

  const text = stripCodeBlocks(normalized)
  const hasName = hasLabeledField(text, INLINE_NAME_LABELS)
  const hasDescription = hasLabeledField(text, INLINE_DESCRIPTION_LABELS)
  const hasHeading = /^\s*#\s+.+/m.test(text)
  const hasSkillKeyword = /(skill|技能|能力|worker|助手)/i.test(text)
  const detailSignals = [
    /```/.test(normalized),
    /(使用方式|返回说明|问句示例|usage|examples?|api|curl|请求|接口)/i.test(text),
    /^\d+\.\s+/m.test(text),
    /^\|\s*[^|]+\|/m.test(text),
    /^[-*]\s+/m.test(text),
  ]
  const detailCount = detailSignals.filter(Boolean).length

  return (
    (hasName && hasDescription && detailCount >= 1)
    || (hasHeading && hasSkillKeyword && detailCount >= 2)
    || (hasName && hasSkillKeyword && detailCount >= 2)
  )
}

export function resolveSkillProvision(query: string): SkillProvisionResolution {
  const normalized = normalizeText(query)
  if (!normalized) {
    return {
      status: 'resolved',
      intent: {
        mode: 'create_skill',
        request: normalized,
      },
    }
  }

  if (looksLikeInlineSkillSpec(normalized)) {
    return {
      status: 'resolved',
      intent: {
        mode: 'inline_spec',
        rawText: normalized,
      },
    }
  }

  const installSource = detectRemoteInstallSourceFromQuery(normalized)
  if (installSource) {
    return {
      status: 'resolved',
      intent: {
        mode: 'remote_install',
        source: installSource,
      },
    }
  }

  if (isSkillInstallIntent(normalized)) {
    return {
      status: 'missing_source',
      request: normalized,
    }
  }

  return {
    status: 'resolved',
    intent: {
      mode: 'create_skill',
      request: normalized,
    },
  }
}
