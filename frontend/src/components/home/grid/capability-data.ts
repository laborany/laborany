/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     能力网格数据源                                       ║
 * ║                                                                          ║
 * ║  统一的 ShowcaseItem 数组，供 CapabilityGrid 消费                        ║
 * ║  2 行 x 4 列 = 8 张卡片                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { ShowcaseItem } from '../chat/ChatState'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           能力项数据                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const CAPABILITY_ITEMS: ShowcaseItem[] = [
  { id: 'stock-analyzer',       type: 'skill',    icon: '📈', name: '股票分析', description: '实时股票数据采集与分析', category: '金融' },
  { id: 'topic-collector',      type: 'skill',    icon: '📰', name: '热点采集', description: '聚合今日 AI 热点与选题',  category: '内容' },
  { id: 'rss-news-aggregator',  type: 'skill',    icon: '📡', name: '优质资讯', description: 'RSS 资讯聚合与智能过滤', category: '内容' },
  { id: 'financial-report',     type: 'skill',    icon: '💹', name: '财务报告', description: '专业财务分析报告',       category: '金融' },
  { id: 'ppt-svg-generator',    type: 'skill',    icon: '🖼️', name: 'PPT生成', description: '专栏内容转 SVG 幻灯片',   category: '办公' },
  { id: 'social-operator',      type: 'skill',    icon: '📱', name: '社媒运营', description: '多平台内容创作',         category: '内容' },
  { id: 'deep-research',        type: 'skill',    icon: '🔍', name: '深度研究', description: '多源调研与报告生成',     category: '数据' },
  { id: 'expense-assistant',    type: 'skill',    icon: '💰', name: '费用助手', description: '智能费用管理与汇总',     category: '金融' },
  { id: 'data-monitor',         type: 'skill',    icon: '📉', name: '数据监控', description: '监控指标并生成分析结论',  category: '数据' },
]

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据获取                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function getCapabilityItems(): ShowcaseItem[] {
  return CAPABILITY_ITEMS
}
