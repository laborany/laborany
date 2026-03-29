import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { getRuntimeTasksDir } from 'laborany-shared'

const tempHome = mkdtempSync(join(tmpdir(), 'laborany-task-file-manifest-'))
process.env.LABORANY_HOME = tempHome

async function run(): Promise<void> {
  const { default: fileRoutes } = await import('../src/routes/file.js')
  const sessionId = 'manifest-session'
  const taskDir = join(getRuntimeTasksDir(), sessionId)
  mkdirSync(taskDir, { recursive: true })

  writeFileSync(join(taskDir, 'report.md'), '# visible artifact\n', 'utf-8')
  writeFileSync(join(taskDir, '.laborany-input-files.json'), JSON.stringify({
    version: 1,
    inputFiles: ['input.jpg'],
  }, null, 2), 'utf-8')
  writeFileSync(join(taskDir, '.secret.txt'), 'hidden\n', 'utf-8')

  const app = new Hono()
  app.route('/api', fileRoutes)

  const listResponse = await app.request(`/api/task/${sessionId}/files`)
  assert.equal(listResponse.status, 200)
  const listPayload = await listResponse.json() as { files?: Array<{ path?: string }> }
  const listedPaths = Array.isArray(listPayload.files)
    ? listPayload.files.map(item => String(item?.path || ''))
    : []

  assert.ok(listedPaths.includes('report.md'))
  assert.ok(!listedPaths.includes('.laborany-input-files.json'))
  assert.ok(!listedPaths.includes('.secret.txt'))

  const manifestResponse = await app.request(`/api/task/${sessionId}/files/.laborany-input-files.json`)
  assert.equal(manifestResponse.status, 200)
  const manifestPayload = await manifestResponse.json() as { version?: number; inputFiles?: string[] }
  assert.equal(manifestPayload.version, 1)
  assert.deepEqual(manifestPayload.inputFiles, ['input.jpg'])

  const hiddenResponse = await app.request(`/api/task/${sessionId}/files/.secret.txt`)
  assert.equal(hiddenResponse.status, 404)

  console.log('verify-task-file-manifest: PASS')
}

run()
  .catch((error) => {
    console.error('verify-task-file-manifest: FAIL')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tempHome, { recursive: true, force: true })
  })
