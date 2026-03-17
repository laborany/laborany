#!/usr/bin/env node
/**
 * Generative UI Spike — CLI Runner
 *
 * Spawns Claude Code CLI with:
 *   --output-format stream-json
 *   --verbose
 *   --include-partial-messages
 *   --mcp-config mcp-config.json
 *   --dangerously-skip-permissions
 *
 * Verifies:
 *   1. MCP tools (load_guidelines, show_widget) are available to the model
 *   2. Partial messages expose tool argument deltas (input_json_delta)
 *   3. Event frequency is sufficient for streaming widget rendering
 *   4. --mcp-config works for per-session tool injection
 *
 * Outputs:
 *   - spike-raw.jsonl  — every line from stdout
 *   - spike-events.jsonl — parsed events with timestamps
 *   - Console summary of findings
 */

import { spawn } from 'child_process'
import { writeFileSync, appendFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_LOG = join(__dirname, 'spike-raw.jsonl')
const EVENTS_LOG = join(__dirname, 'spike-events.jsonl')

// Clear previous logs
writeFileSync(RAW_LOG, '')
writeFileSync(EVENTS_LOG, '')

// ── Find claude CLI ──

function findClaude() {
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    join(process.env.HOME || '', '.local/bin/claude'),
    join(process.env.HOME || '', '.npm-global/bin/claude'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Fallback: assume it's on PATH
  return 'claude'
}

const claudePath = process.env.CLAUDE_CODE_PATH || findClaude()
const mcpConfigPath = join(__dirname, 'mcp-config.json')

console.log(`[Spike] Claude CLI: ${claudePath}`)
console.log(`[Spike] MCP config: ${mcpConfigPath}`)
console.log(`[Spike] Raw log: ${RAW_LOG}`)
console.log(`[Spike] Events log: ${EVENTS_LOG}`)
console.log('')

// ── Prompt ──

const PROMPT = `请用 show_widget 工具画一个简单的复利计算器。
要求：
- 有本金、年利率、年数三个输入框
- 有一个计算按钮
- 显示最终金额
- 使用简洁的 HTML/CSS/JS

注意：先调用 load_guidelines 加载设计规范，再调用 show_widget。`

// ── Spawn CLI ──

const args = [
  '--print',
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  '--mcp-config', mcpConfigPath,
]

// Try adding --include-partial-messages
// This flag may or may not exist — we test both scenarios
const usePartialMessages = !process.argv.includes('--no-partial')
if (usePartialMessages) {
  args.push('--include-partial-messages')
}

console.log(`[Spike] Args: ${args.join(' ')}`)
console.log(`[Spike] Partial messages: ${usePartialMessages}`)
console.log(`[Spike] Starting...\n`)

const proc = spawn(claudePath, args, {
  cwd: __dirname,
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'pipe'],
})

proc.stdin.write(PROMPT)
proc.stdin.end()

// ── Stats ──

const stats = {
  totalLines: 0,
  assistantMessages: 0,
  userMessages: 0,
  streamEvents: 0,
  toolCallStarts: 0,
  toolCallDeltas: 0,
  toolCallEnds: 0,
  partialMessages: 0,
  unknownTypes: 0,
  toolNames: new Set(),
  firstEventAt: null,
  lastEventAt: null,
  deltaTimestamps: [],  // for frequency analysis
}

function logEvent(type, data) {
  const entry = { ts: Date.now(), type, data }
  appendFileSync(EVENTS_LOG, JSON.stringify(entry) + '\n')
}

// ── Parse stdout ──

let lineBuffer = ''

proc.stdout.on('data', (chunk) => {
  lineBuffer += chunk.toString('utf-8')
  const lines = lineBuffer.split('\n')
  lineBuffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue

    stats.totalLines++
    appendFileSync(RAW_LOG, line + '\n')

    const now = Date.now()
    if (!stats.firstEventAt) stats.firstEventAt = now
    stats.lastEventAt = now

    try {
      const msg = JSON.parse(line)
      const type = msg.type

      if (type === 'assistant') {
        stats.assistantMessages++
        logEvent('assistant', { contentTypes: (msg.message?.content || []).map(b => b.type) })

        // Check for tool_use blocks
        for (const block of (msg.message?.content || [])) {
          if (block.type === 'tool_use') {
            stats.toolNames.add(block.name)
            logEvent('tool_use_final', { name: block.name, inputKeys: Object.keys(block.input || {}) })
          }
        }
      }
      else if (type === 'user') {
        stats.userMessages++
        logEvent('user', { contentTypes: (msg.message?.content || []).map(b => b.type) })
      }
      else if (type === 'stream_event') {
        stats.streamEvents++
        const eventType = msg.event?.type

        if (eventType === 'content_block_start') {
          const block = msg.event?.content_block
          if (block?.type === 'tool_use') {
            stats.toolCallStarts++
            stats.toolNames.add(block.name)
            logEvent('tool_start', { name: block.name, id: block.id })
            console.log(`  [tool_start] ${block.name} (id: ${block.id})`)
          }
        }
        else if (eventType === 'content_block_delta') {
          const delta = msg.event?.delta
          if (delta?.type === 'input_json_delta') {
            stats.toolCallDeltas++
            stats.deltaTimestamps.push(now)
            const partial = delta.partial_json || ''
            logEvent('input_json_delta', { length: partial.length, preview: partial.slice(0, 100) })

            // Print progress every 10 deltas
            if (stats.toolCallDeltas % 10 === 0) {
              console.log(`  [delta] #${stats.toolCallDeltas} (+${partial.length} chars)`)
            }
          }
        }
        else if (eventType === 'content_block_stop') {
          stats.toolCallEnds++
          logEvent('tool_end', { index: msg.event?.index })
          console.log(`  [tool_end] block index ${msg.event?.index}`)
        }
        else if (eventType === 'message_start' || eventType === 'message_delta' || eventType === 'message_stop') {
          logEvent(eventType, {})
        }
        else {
          logEvent('stream_event_other', { eventType })
        }
      }
      else if (type === 'partial') {
        stats.partialMessages++
        logEvent('partial', { contentTypes: (msg.message?.content || []).map(b => b.type) })
      }
      else {
        stats.unknownTypes++
        logEvent('unknown', { type })
      }
    } catch {
      logEvent('parse_error', { line: line.slice(0, 200) })
    }
  }
})

// ── stderr ──

proc.stderr.on('data', (chunk) => {
  const text = chunk.toString('utf-8').trim()
  if (text) {
    console.log(`  [stderr] ${text}`)
  }
})

// ── Done ──

proc.on('close', (code) => {
  // Flush remaining buffer
  if (lineBuffer.trim()) {
    stats.totalLines++
    appendFileSync(RAW_LOG, lineBuffer + '\n')
  }

  console.log('\n' + '='.repeat(60))
  console.log('SPIKE RESULTS')
  console.log('='.repeat(60))
  console.log(`Exit code: ${code}`)
  console.log(`Total JSON lines: ${stats.totalLines}`)
  console.log(`Assistant messages: ${stats.assistantMessages}`)
  console.log(`User messages: ${stats.userMessages}`)
  console.log(`Stream events: ${stats.streamEvents}`)
  console.log(`Partial messages: ${stats.partialMessages}`)
  console.log(`Unknown types: ${stats.unknownTypes}`)
  console.log('')
  console.log(`Tool call starts: ${stats.toolCallStarts}`)
  console.log(`Tool call deltas (input_json_delta): ${stats.toolCallDeltas}`)
  console.log(`Tool call ends: ${stats.toolCallEnds}`)
  console.log(`Tool names seen: ${[...stats.toolNames].join(', ') || '(none)'}`)

  // Delta frequency analysis
  if (stats.deltaTimestamps.length > 1) {
    const intervals = []
    for (let i = 1; i < stats.deltaTimestamps.length; i++) {
      intervals.push(stats.deltaTimestamps[i] - stats.deltaTimestamps[i - 1])
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const min = Math.min(...intervals)
    const max = Math.max(...intervals)
    console.log('')
    console.log(`Delta intervals (ms): avg=${avg.toFixed(1)} min=${min} max=${max}`)
    console.log(`Estimated updates/sec: ${(1000 / avg).toFixed(1)}`)
  }

  const durationMs = (stats.lastEventAt || 0) - (stats.firstEventAt || 0)
  console.log(`\nTotal duration: ${(durationMs / 1000).toFixed(1)}s`)

  // ── Go/No-Go verdict ──
  console.log('\n' + '='.repeat(60))
  console.log('GO / NO-GO ASSESSMENT')
  console.log('='.repeat(60))

  const mcpWorked = stats.toolNames.size > 0
  const hasDeltas = stats.toolCallDeltas > 0
  const hasPartials = stats.partialMessages > 0
  const sufficientFrequency = stats.deltaTimestamps.length > 1 &&
    ((stats.deltaTimestamps[stats.deltaTimestamps.length - 1] - stats.deltaTimestamps[0]) / stats.deltaTimestamps.length) < 500

  console.log(`[${mcpWorked ? 'GO' : 'NO-GO'}] MCP tool injection: ${mcpWorked ? 'Tools registered and called' : 'No tools detected'}`)
  console.log(`[${hasDeltas ? 'GO' : hasPartials ? 'PARTIAL' : 'NO-GO'}] Partial tool arguments: ${hasDeltas ? `${stats.toolCallDeltas} deltas captured` : hasPartials ? 'Partial messages seen but no deltas' : 'No partial data'}`)
  console.log(`[${sufficientFrequency ? 'GO' : 'WARN'}] Update frequency: ${sufficientFrequency ? 'Sufficient for streaming' : 'May need fallback strategy'}`)

  const overallGo = mcpWorked && (hasDeltas || hasPartials)
  console.log(`\nOverall: ${overallGo ? 'GO — CLI-first path viable' : 'NO-GO — Consider Direct API fallback'}`)
  console.log('')
  console.log(`Raw log: ${RAW_LOG}`)
  console.log(`Events log: ${EVENTS_LOG}`)
})

proc.on('error', (err) => {
  console.error(`[Spike] Failed to spawn CLI: ${err.message}`)
  process.exit(1)
})
