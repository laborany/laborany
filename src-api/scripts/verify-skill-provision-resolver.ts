import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSkillProvision } from '../src/core/skills/provision-resolver.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(__dirname, 'fixtures', 'skill-provision')

const CASES = [
  { file: 'eastmoney-inline.md', expected: 'inline_spec' },
  { file: 'github-url.txt', expected: 'remote_install' },
  { file: 'archive-url.txt', expected: 'remote_install' },
  { file: 'create-request.txt', expected: 'create_skill' },
  { file: 'install-without-source.txt', expected: 'missing_source' },
] as const

function summarizeResolution(query: string) {
  const resolution = resolveSkillProvision(query)
  if (resolution.status === 'missing_source') {
    return {
      mode: 'missing_source',
      detail: resolution.request,
    }
  }

  if (resolution.intent.mode === 'remote_install') {
    return {
      mode: resolution.intent.mode,
      detail: resolution.intent.source,
    }
  }

  if (resolution.intent.mode === 'inline_spec') {
    return {
      mode: resolution.intent.mode,
      detail: `${resolution.intent.rawText.slice(0, 36)}...`,
    }
  }

  return {
    mode: resolution.intent.mode,
    detail: resolution.intent.request,
  }
}

let failed = false

for (const testCase of CASES) {
  const fullPath = join(FIXTURE_DIR, testCase.file)
  const query = await readFile(fullPath, 'utf8')
  const summary = summarizeResolution(query)

  console.log(`${testCase.file}: ${summary.mode}`)
  console.log(`  ${summary.detail}`)

  if (summary.mode !== testCase.expected) {
    failed = true
    console.error(`  expected: ${testCase.expected}`)
  }
}

if (failed) {
  process.exitCode = 1
}
