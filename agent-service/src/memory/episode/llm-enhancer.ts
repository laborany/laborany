import type { Episode } from './cluster.js'
import type { MemCell } from '../memcell/index.js'
import { isClaudeCliAvailable, runClaudePrompt } from '../cli-runner.js'

interface EnhanceResult {
  subject: string
  summary: string
}

interface EnhancePayload {
  subject?: string
  summary?: string
}

const ENHANCE_PROMPT = `You are refining memory episode metadata.
Given an episode and related memory cells, output strict JSON only:
{"subject":"...","summary":"..."}

Rules:
- subject: 8-40 chars, concise topic name.
- summary: 30-160 chars, objective, no greetings.
- Keep language consistent with input.
- Do not include markdown or extra keys.`

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function parseJsonPayload(raw: string): EnhancePayload | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as EnhancePayload
  } catch {
    return null
  }
}

function normalizeEnhanceResult(input: EnhancePayload | null, fallback: EnhanceResult): EnhanceResult {
  const subject = (input?.subject || '').trim()
  const summary = (input?.summary || '').trim()

  return {
    subject: clip(subject || fallback.subject, 60),
    summary: clip(summary || fallback.summary, 320),
  }
}

function buildEnhanceInput(episode: Episode, cells: MemCell[]): string {
  const uniqueFacts = new Set<string>()
  for (const cell of cells) {
    for (const fact of cell.facts) {
      const content = fact.content.trim()
      if (!content) continue
      uniqueFacts.add(content)
      if (uniqueFacts.size >= 20) break
    }
    if (uniqueFacts.size >= 20) break
  }

  const cellSamples = cells.slice(0, 8).map(cell => ({
    summary: clip(cell.summary || '', 180),
    facts: cell.facts.slice(0, 4).map(item => clip(item.content, 120)),
  }))

  return JSON.stringify({
    episode: {
      subject: episode.subject,
      summary: episode.summary,
      centroid: episode.centroid.slice(0, 8),
      keyFacts: episode.keyFacts.slice(0, 10).map(item => clip(item.fact, 120)),
    },
    cells: cellSamples,
    factPool: Array.from(uniqueFacts).slice(0, 20).map(item => clip(item, 120)),
  })
}

export class EpisodeLLMEnhancer {
  async enhance(episode: Episode, cells: MemCell[]): Promise<EnhanceResult> {
    const fallback: EnhanceResult = {
      subject: episode.subject,
      summary: episode.summary,
    }

    const payload = buildEnhanceInput(episode, cells)
    const model = (process.env.ANTHROPIC_CLASSIFY_MODEL || process.env.ANTHROPIC_MODEL || '').trim()
    const result = await runClaudePrompt({
      prompt: `${ENHANCE_PROMPT}\n\nInput JSON:\n${payload}`,
      timeoutMs: 18_000,
      model: model || undefined,
    })

    if (!result.ok) {
      console.warn(
        `[MemoryEpisodeEnhancer] CLI enhance fallback: source=${result.source || 'unknown'} reason=${result.reason || 'unknown'} stderr=${(result.stderr || '').slice(0, 180)}`,
      )
      return fallback
    }

    return normalizeEnhanceResult(parseJsonPayload(result.stdout), fallback)
  }

  isAvailable(): boolean {
    return isClaudeCliAvailable()
  }
}

export const episodeLLMEnhancer = new EpisodeLLMEnhancer()
