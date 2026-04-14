const DISPLAY_NAME_MAP: Record<string, string> = {
  '__generic__': '个人助理',
  '__converse__': '个人助理',
  'skill-creator': '人力专员 HR',
  'deep-research': '研究员',
  'three-bullet-summary': '简报专员',
  'social-operator': '运营同事',
  'stock-analyzer': '投研分析师',
  'financial-report': '财报分析师',
  'wechat-writer': '公众号写作编辑',
  'xhs-note-creator': '小红书编辑',
  'pptx': 'PPT 汇报设计师',
  'ppt-svg-generator': 'SVG 演示设计师',
  'pdf': 'PDF 文档专员',
  'docx': 'Word 文档编辑',
  'xlsx': 'Excel 表格分析师',
  'diagram': '图表设计师',
  'video-creator': '视频策划',
  'paper-explainer': '论文研究员',
  'paper-editor': '学术编辑',
  'email-assistant': '邮件专员',
  'expense-assistant': '报销专员',
  'data-monitor': '数据巡检员',
  'data-transfer': '数据整理员',
  'rss-news-aggregator': '资讯情报员',
  'topic-collector': '选题研究员',
  'ai-productivity-column': '专栏编辑',
}

export function getCapabilityDisplayName(skillId?: string, fallbackName?: string): string {
  const normalizedId = (skillId || '').trim()
  if (!normalizedId) return (fallbackName || '').trim()
  return DISPLAY_NAME_MAP[normalizedId] || (fallbackName || '').trim() || normalizedId
}
