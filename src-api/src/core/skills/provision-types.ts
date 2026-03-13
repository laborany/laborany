export type SkillProvisionIntent =
  | { mode: 'remote_install'; source: string }
  | { mode: 'inline_spec'; rawText: string }
  | { mode: 'create_skill'; request: string }

export type SkillProvisionResolution =
  | { status: 'resolved'; intent: SkillProvisionIntent }
  | { status: 'missing_source'; request: string }
