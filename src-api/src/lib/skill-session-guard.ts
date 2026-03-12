export type ExistingSkillRuntimeStatus =
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'aborted'
  | string

/**
 * 同一个 skill session 只有在仍然“执行中”时才应拒绝新的 execute 请求。
 * `waiting_input` 表示上一轮已经停在等用户回复，允许复用同一个 sessionId 继续执行。
 */
export function isExistingSkillSessionBusy(status?: ExistingSkillRuntimeStatus | null): boolean {
  return status === 'running'
}
