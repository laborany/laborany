import { spawn } from 'child_process'
import { buildClaudeEnvConfig, resolveClaudeCliLaunch } from '../claude-cli.js'

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

export function isClaudeCliAvailable(): boolean {
  const cli = resolveClaudeCliLaunch()
  return Boolean(cli && (process.env.ANTHROPIC_API_KEY || '').trim())
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

  const args = [...cli.argsPrefix, '--print', '--dangerously-skip-permissions']
  if (options.model) {
    args.push('--model', options.model)
  }

  const timeoutMs = options.timeoutMs ?? 20_000

  try {
    const proc = spawn(cli.command, args, {
      env: buildClaudeEnvConfig(),
      shell: cli.shell,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString('utf-8')
    })
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString('utf-8')
    })

    proc.stdin.write(options.prompt, 'utf-8')
    proc.stdin.end()

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
