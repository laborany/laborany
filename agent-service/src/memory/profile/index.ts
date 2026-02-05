/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Profile 模块导出                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export {
  evidenceTracker,
  EvidenceTracker,
  type Evidence,
  type EvidencedValue,
} from './evidence.js'

export {
  profileManager,
  ProfileManager,
  type Profile,
  type ProfileSection,
  type ProfileField,
  PROFILES_DIR,
  PROFILE_PATH,
} from './manager.js'

export {
  profileLLMClassifier,
  ProfileLLMClassifier,
} from './llm-classifier.js'
