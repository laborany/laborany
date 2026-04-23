import { spawn } from 'child_process'
import {
  buildClaudeCliPromptDelivery,
  buildClaudeEnvConfig,
  checkRuntimeDependencies,
  resolveClaudeCliLaunch,
} from '../claude-cli.js'

interface ClaudePromptOptions {
  prompt: string
  timeoutMs?: number
  model?: string
}

export interface ClaudePromptResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  source?: string
  reason?: string
}

const PLACEHOLDER_API_KEYS = new Set([
  'your-api-key-here',
  'your-api-key',
  'sk-ant-test-key',
  'test-key',
  'placeholder',
])

function isPlaceholderApiKey(rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase()
  if (!normalized) return true
  if (PLACEHOLDER_API_KEYS.has(normalized)) return true
  return normalized.includes('your-api-key')
    || normalized.includes('placeholder')
    || normalized.endsWith('-test-key')
}

export function hasUsableClaudeCredentials(): boolean {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  return Boolean(apiKey) && !isPlaceholderApiKey(apiKey)
}

export function isClaudeCliAvailable(): boolean {
  const cli = resolveClaudeCliLaunch()
  return Boolean(cli && !checkRuntimeDependencies() && hasUsableClaudeCredentials())
}

export async function runClaudePrompt(options: ClaudePromptOptions): Promise<ClaudePromptResult> {
  const cli = resolveClaudeCliLaunch()
  if (!cli) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      reason: 'Claude CLI not found',
    }
  }

  if (!hasUsableClaudeCredentials()) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      source: cli.source,
      reason: 'Claude API key missing or placeholder',
    }
  }

  const dependencyIssue = checkRuntimeDependencies()
  if (dependencyIssue) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      source: cli.source,
      reason: `[${dependencyIssue.code}] ${dependencyIssue.message} ${dependencyIssue.installHint}`,
    }
  }

  const args = ['--print', '--dangerously-skip-permissions']
  if (options.model) {
    args.push('--model', options.model)
  }
  const promptDelivery = buildClaudeCliPromptDelivery(cli, args, options.prompt)
  const spawnArgs = [...cli.argsPrefix, ...promptDelivery.args]

  const timeoutMs = options.timeoutMs ?? 20_000

  try {
    const proc = spawn(cli.command, spawnArgs, {
      env: buildClaudeEnvConfig(undefined, cli.nodePath),
      shell: cli.shell,
      stdio: [promptDelivery.useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    if (!proc.stdout || !proc.stderr) {
      throw new Error('Claude CLI stdio is unavailable')
    }

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString('utf-8')
    })
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString('utf-8')
    })

    if (promptDelivery.useStdin) {
      if (!proc.stdin) {
        throw new Error('Claude CLI stdin is unavailable')
      }
      proc.stdin.write(options.prompt, 'utf-8')
      proc.stdin.end()
    }

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
    }, timeoutMs)

    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.on('close', code => resolve(code ?? 1))
      proc.on('error', reject)
    })
    clearTimeout(timer)

    return {
      ok: exitCode === 0,
      stdout,
      stderr,
      exitCode,
      source: cli.source,
      reason: exitCode === 0 ? undefined : `exit code ${exitCode}`,
    }
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      source: cli.source,
      reason: error instanceof Error ? error.message : 'unknown error',
    }
  }
}
