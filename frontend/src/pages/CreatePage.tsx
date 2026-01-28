/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      创建页面 - 招聘新员工                                  ║
 * ║                                                                          ║
 * ║  独立的创建流程页面，从首页"招聘新员工"按钮直接跳转                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'
import { CreateSkillChat } from '../components/create/CreateSkillChat'

export default function CreatePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 页头 */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">招聘新员工</h1>
          <p className="text-sm text-muted-foreground mt-1">
            通过对话描述你的需求，AI 会帮你创建一位专属的数字员工
          </p>
        </div>
      </div>

      {/* 创建对话 */}
      <CreateSkillChat />
    </div>
  )
}
