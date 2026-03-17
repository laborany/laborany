export {
  loadSkill,
  type Skill,
  type SkillMeta,
  type SkillTool,
  type SkillKind,
  type CompositeStep,
} from './skill-loader.js'

export {
  isPackaged,
  BUILTIN_SKILLS_DIR,
  USER_SKILLS_DIR,
  getBuiltinSkillsDir,
  getUserSkillsDir,
  getUserDir,
} from './paths.js'

export {
  getRuntimeHomeDir,
  getRuntimeDataDir,
  getRuntimeUploadsDir,
  getRuntimeTasksDir,
} from './runtime-paths.js'

export {
  normalizeAttachmentIds,
  stripAttachmentMarkers,
  extractAttachmentIdsFromText,
} from './attachment-ids.js'

export {
  sanitizeTaskFileName,
  ensureUniqueTaskFileName,
  resolveUploadedAttachmentPath,
  hydrateAttachmentsToTaskDir,
  type HydrateTaskAttachmentsOptions,
} from './task-attachments.js'

export {
  CAPABILITY_ID_MAX_LENGTH,
  normalizeCapabilityDisplayName,
  normalizeCapabilityId,
  generateCapabilityId,
  validateCapabilityId,
  appendCapabilityIdSuffix,
  pickUniqueCapabilityId,
  type CapabilityType,
} from './capability-naming.js'

export {
  wrapCmdForUtf8,
  withUtf8Env,
  removeEnvKeysCaseInsensitive,
  sanitizeClaudeEnv,
} from './encoding.js'

export {
  normalizeModelInterfaceType,
  encodeOpenAiBridgeApiKey,
  decodeOpenAiBridgeApiKey,
  isOpenAiBridgeApiKey,
  type ModelInterfaceType,
  type OpenAiBridgeCredential,
} from './model-interface.js'

export {
  resolveGenerativeWidgetSupport,
  resolveExecuteGenerativeWidgetSupport,
  supportsGenerativeWidgets,
  supportsExecuteGenerativeWidgets,
  type GenerativeWidgetCapability,
  type GenerativeWidgetRuntime,
  type GenerativeWidgetProvider,
  type GenerativeWidgetDisabledReason,
  type GenerativeWidgetTarget,
  type GenerativeWidgetSupport,
} from './generative-widgets.js'
