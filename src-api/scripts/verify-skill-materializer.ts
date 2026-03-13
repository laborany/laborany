import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadSkill } from 'laborany-shared'
import { materializeExistingSkillDirectory } from '../src/core/skills/materializer.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const userSkillsDir = loadSkill.getUserSkillsDir()

async function createReadmeOnlySkill(): Promise<string> {
  const skillId = 'tmp-readme-finance'
  const skillDir = join(userSkillsDir, skillId)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'README.md'), [
    '# Finance Search Agent',
    '',
    '用于金融新闻、公告和研报的统一搜索。',
    '',
    '通过环境变量读取 API key，不应写死密钥。',
  ].join('\n'))
  return skillId
}

async function createIncompleteSkill(): Promise<string> {
  const skillId = 'tmp-incomplete-meta'
  const skillDir = join(userSkillsDir, skillId)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), [
    '---',
    'name: Financial Search Agent',
    'description: 金融资讯聚合与检索',
    '---',
    '',
    '# Skill',
    '',
    '读取外部金融资讯并进行整理。',
  ].join('\n'))
  return skillId
}

const readmeOnlyId = await createReadmeOnlySkill()
const incompleteId = await createIncompleteSkill()

const readmeResult = await materializeExistingSkillDirectory({
  existingSkillId: readmeOnlyId,
})
const incompleteResult = await materializeExistingSkillDirectory({
  existingSkillId: incompleteId,
})

const readmeSkillMd = await readFile(join(readmeResult.installedPath, 'SKILL.md'), 'utf8')
const incompleteSkillMd = await readFile(join(incompleteResult.installedPath, 'SKILL.md'), 'utf8')

assert(readmeResult.sourceAdapted, 'README only skill should be adapted')
assert(readmeSkillMd.includes('name:'), 'README only skill should gain frontmatter name')
assert(readmeSkillMd.includes('category:'), 'README only skill should gain category')
assert(incompleteResult.skillId !== incompleteId, 'Incomplete skill should be normalized to display-name-based id')
assert(incompleteSkillMd.includes('icon:'), 'Incomplete skill should gain icon')
assert(incompleteSkillMd.includes('category:'), 'Incomplete skill should gain category')

console.log(JSON.stringify({
  readmeResult,
  incompleteResult,
}, null, 2))
