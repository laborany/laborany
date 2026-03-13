import type { SkillProvisionIntent } from './provision-types.js'

export function buildSkillCreatorTaskQuery(params: {
  intent: SkillProvisionIntent
  userSkillsDir: string
}): string {
  const { intent, userSkillsDir } = params

  if (intent.mode === 'inline_spec') {
    return [
      '## 任务类型',
      '将用户粘贴的 Skill 规范直接落地为一个新的 LaborAny Skill。',
      '',
      '## 强约束',
      `- 只能在这个用户 skills 目录下创建新 skill：${userSkillsDir}`,
      '- 不要把文中的 API URL、curl 示例、接口地址当作下载来源。',
      '- 不要要求用户再提供 GitHub/zip/tar 链接。',
      '- 直接创建一个新的 skill 目录，并补齐可运行的 `SKILL.md`。',
      '- `SKILL.md` 必须包含 `name`、`description`，并尽量补齐 `icon`、`category`。',
      '- 如果文本里出现示例 apikey，不要把示例值当成真实密钥写死到脚本里；应改为读取环境变量。',
      '- 若有必要，可将较长 API 说明保留在 `SKILL.md` 或 `references/` 中。',
      '',
      '## 用户提供的原始 Skill 规范',
      intent.rawText,
      '',
      '## 执行要求',
      '如果信息已经足够，请直接创建 skill，不要先做无意义追问。',
    ].join('\n')
  }

  if (intent.mode === 'create_skill') {
    return [
      '## 任务类型',
      '根据用户需求创建一个新的 LaborAny Skill。',
      '',
      '## 强约束',
      `- 只能在这个用户 skills 目录下创建新 skill：${userSkillsDir}`,
      '- 输出必须是一个可被 LaborAny 加载的新 skill 目录。',
      '- `SKILL.md` 必须包含 `name`、`description`，并尽量补齐 `icon`、`category`。',
      '',
      '## 用户需求',
      intent.request,
      '',
      '如果需求已经足够清楚，请直接创建 skill；仅在缺少关键执行信息时再追问。',
    ].join('\n')
  }

  return intent.source
}
