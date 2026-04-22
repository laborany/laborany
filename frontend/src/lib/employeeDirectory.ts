import type { Skill } from '../types'

export interface EmployeeDirectoryProfile {
  displayName: string
  roleTitle: string
  summary: string
  tags?: string[]
  priority: number
}

const EMPLOYEE_PROFILE_MAP: Record<string, EmployeeDirectoryProfile> = {
  '__generic__': {
    displayName: '个人助理',
    roleTitle: '通用事务助理',
    summary: '负责接收老板需求、处理通用事务，并把更专业的工作安排给合适的同事。',
    tags: ['助理', '通用事务'],
    priority: 0,
  },
  'skill-creator': {
    displayName: '人力专员 HR',
    roleTitle: '创建技能，提升技能',
    summary: '负责招聘新员工、补齐岗位能力，并帮助现有同事提升技能水平。',
    tags: ['HR', '招聘', '培训'],
    priority: 1,
  },
  'deep-research': {
    displayName: '研究员',
    roleTitle: '深度研究同事',
    summary: '负责多源调研、信息整合与研究报告输出。',
    tags: ['研究', '调研', '报告'],
    priority: 20,
  },
  'three-bullet-summary': {
    displayName: '简报专员',
    roleTitle: '摘要整理同事',
    summary: '负责快速压缩信息，提炼重点结论和简报内容。',
    tags: ['摘要', '简报', '总结'],
    priority: 30,
  },
  'social-operator': {
    displayName: '运营同事',
    roleTitle: '社媒运营同事',
    summary: '负责社交媒体内容策划、文案包装与运营支持。',
    tags: ['运营', '社媒', '文案'],
    priority: 40,
  },
  'stock-analyzer': {
    displayName: '投研分析师',
    roleTitle: '股票研究同事',
    summary: '负责股票数据采集、指标分析与研究结论输出。',
    tags: ['股票', '投研', '分析'],
    priority: 50,
  },
  'financial-report': {
    displayName: '财报分析师',
    roleTitle: '财务研究同事',
    summary: '负责财报拆解、关键指标分析与汇报结论提炼。',
    tags: ['财报', '财务', '报告'],
    priority: 60,
  },
  'wechat-writer': {
    displayName: '公众号写作编辑',
    roleTitle: '公众号内容写作同事',
    summary: '负责公众号选题策划、文章写作与内容整理。',
    tags: ['公众号', '写作', '内容'],
    priority: 70,
  },
  'xhs-note-creator': {
    displayName: '小红书编辑',
    roleTitle: '小红书内容运营同事',
    summary: '负责小红书笔记文案、结构和配图素材准备。',
    tags: ['小红书', '运营', '内容'],
    priority: 80,
  },
  'pptx': {
    displayName: 'PPT 汇报设计师',
    roleTitle: 'PPT 同事',
    summary: '负责把材料整理成清晰、完整的演示文稿。',
    tags: ['PPT', '汇报', '演示'],
    priority: 90,
  },
  'ppt-svg-generator': {
    displayName: 'SVG 演示设计师',
    roleTitle: '演示视觉同事',
    summary: '负责把内容转成适合演示与汇报的 SVG 页面素材。',
    tags: ['SVG', '演示', '设计'],
    priority: 100,
  },
  'pdf': {
    displayName: 'PDF 文档专员',
    roleTitle: '文档处理同事',
    summary: '负责 PDF 提取、整理、合并、拆分与表单处理。',
    tags: ['PDF', '文档', '表单'],
    priority: 110,
  },
  'docx': {
    displayName: 'Word 文档编辑',
    roleTitle: 'Word 同事',
    summary: '负责结构化文档编辑、修改与排版整理。',
    tags: ['Word', '文档', '编辑'],
    priority: 120,
  },
  'xlsx': {
    displayName: 'Excel 表格分析师',
    roleTitle: 'Excel 同事',
    summary: '负责表格整理、公式处理与数据分析。',
    tags: ['Excel', '表格', '分析'],
    priority: 130,
  },
  'diagram': {
    displayName: '图表设计师',
    roleTitle: '图解同事',
    summary: '负责流程图、结构图和说明图的可视化表达。',
    tags: ['图表', '流程图', '可视化'],
    priority: 140,
  },
  'laborany-design': {
    displayName: '设计大师',
    roleTitle: '设计同事',
    summary: '高保真 HTML 原型、幻灯片、动画、视频一体化设计，覆盖从设计方向到导出 MP4/PPTX 全流程。',
    tags: ['设计', '原型', '幻灯片', '动画', 'HTML'],
    priority: 145,
  },
  'video-creator': {
    displayName: '视频策划',
    roleTitle: '视频创作同事',
    summary: '负责视频结构设计、画面组织与内容生成。',
    tags: ['视频', '创作', '脚本'],
    priority: 150,
  },
  'paper-explainer': {
    displayName: '论文研究员',
    roleTitle: '论文解读同事',
    summary: '负责论文拆解、解释和重点内容说明。',
    tags: ['论文', '解读', '学术'],
    priority: 160,
  },
  'paper-editor': {
    displayName: '学术编辑',
    roleTitle: '论文修改同事',
    summary: '负责学术文稿润色、结构修订与编辑支持。',
    tags: ['论文', '编辑', '学术'],
    priority: 170,
  },
  'email-assistant': {
    displayName: '邮件专员',
    roleTitle: '邮件处理同事',
    summary: '负责邮件收集、整理、草拟与发送辅助。',
    tags: ['邮件', '收件箱', '发送'],
    priority: 180,
  },
  'expense-assistant': {
    displayName: '报销专员',
    roleTitle: '费用处理同事',
    summary: '负责报销材料整理、费用审核和流程辅助。',
    tags: ['报销', '费用', '发票'],
    priority: 190,
  },
  'data-monitor': {
    displayName: '数据巡检员',
    roleTitle: '监控同事',
    summary: '负责持续观察关键数据指标并发现异常。',
    tags: ['监控', '巡检', '数据'],
    priority: 200,
  },
  'data-transfer': {
    displayName: '数据整理员',
    roleTitle: '数据搬运同事',
    summary: '负责数据迁移、格式转换和基础清洗。',
    tags: ['数据', '转换', '迁移'],
    priority: 210,
  },
  'rss-news-aggregator': {
    displayName: '资讯情报员',
    roleTitle: '信息收集同事',
    summary: '负责采集资讯、聚合信息并输出摘要报告。',
    tags: ['资讯', 'RSS', '情报'],
    priority: 220,
  },
  'topic-collector': {
    displayName: '选题研究员',
    roleTitle: '内容选题同事',
    summary: '负责收集热点、整理选题和输出内容方向建议。',
    tags: ['选题', '热点', '内容'],
    priority: 230,
  },
  'ai-productivity-column': {
    displayName: '专栏编辑',
    roleTitle: '长期内容同事',
    summary: '负责专栏写作、内容结构和系列化创作支持。',
    tags: ['专栏', '写作', '系列内容'],
    priority: 240,
  },
}

function toFallbackProfile(skill: Skill): EmployeeDirectoryProfile {
  return {
    displayName: skill.name || skill.id,
    roleTitle: skill.category ? `${skill.category}同事` : '数字员工',
    summary: skill.description || '负责完成该岗位相关工作。',
    tags: skill.category ? [skill.category] : undefined,
    priority: 500,
  }
}

export function getEmployeeDirectoryProfile(skill: Skill): EmployeeDirectoryProfile {
  return EMPLOYEE_PROFILE_MAP[skill.id] || toFallbackProfile(skill)
}

export function getEmployeeDirectoryProfileById(
  skillId: string,
  fallbackName?: string,
  fallbackDescription?: string,
): EmployeeDirectoryProfile {
  const mapped = EMPLOYEE_PROFILE_MAP[skillId]
  if (mapped) return mapped

  return {
    displayName: fallbackName || skillId,
    roleTitle: '数字员工',
    summary: fallbackDescription || '负责完成该岗位相关工作。',
    priority: 500,
  }
}
