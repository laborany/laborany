import { mkdtemp, mkdir, readdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import assert from 'assert'
import { hydrateAttachmentsToTaskDir } from 'laborany-shared'

async function main() {
  const rootDir = await mkdtemp(join(tmpdir(), 'laborany-attachments-'))
  const uploadsDir = join(rootDir, 'uploads')
  const taskDir = join(rootDir, 'tasks', 'session-1')
  const missingIds: string[] = []

  await mkdir(uploadsDir, { recursive: true })
  await mkdir(taskDir, { recursive: true })

  await writeFile(join(uploadsDir, 'att-image.png'), 'image-data')
  await writeFile(join(uploadsDir, 'att-doc.pdf'), 'pdf-data')
  await writeFile(join(taskDir, 'att-image.png'), 'existing')

  const copied = await hydrateAttachmentsToTaskDir({
    attachmentIds: ['att-image', 'missing-id', 'att-doc'],
    taskDir,
    uploadsDir,
    onResolveFailure: (attachmentId) => {
      missingIds.push(attachmentId)
    },
  })

  const taskFiles = (await readdir(taskDir)).sort()

  assert.deepStrictEqual(copied.sort(), ['att-doc.pdf', 'att-image-1.png'])
  assert.deepStrictEqual(taskFiles, ['att-doc.pdf', 'att-image-1.png', 'att-image.png'])
  assert.deepStrictEqual(missingIds, ['missing-id'])

  console.log(JSON.stringify({
    copied,
    missingIds,
    taskFiles,
  }, null, 2))
}

void main()
