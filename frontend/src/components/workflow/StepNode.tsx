/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流步骤节点                                     ║
 * ║                                                                          ║
 * ║  画布上的 Skill 卡片，支持连线、选中、编辑                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface StepNodeData {
  stepIndex: number
  name: string
  skill: string
  skillName?: string
  icon?: string
  prompt: string
  onEdit?: (stepIndex: number) => void
  onDelete?: (stepIndex: number) => void
  [key: string]: unknown  // 索引签名，满足 React Flow 类型要求
}

interface StepNodeProps {
  data: StepNodeData
  selected?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           节点组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StepNode({ data, selected }: StepNodeProps) {
  const { stepIndex, name, skillName, icon, onEdit, onDelete } = data

  return (
    <div
      className={`
        bg-card border rounded-lg p-4 min-w-[200px] max-w-[280px]
        transition-all duration-200 cursor-pointer
        ${selected ? 'border-primary shadow-lg shadow-primary/20' : 'border-border hover:border-primary/50'}
      `}
      onDoubleClick={() => onEdit?.(stepIndex)}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />

      {/* 头部：序号 + 删除 */}
      <div className="flex items-center justify-between mb-2">
        <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium">
          {stepIndex + 1}
        </span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(stepIndex)
            }}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-red-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 步骤名称 */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon || '🔧'}</span>
        <span className="font-medium text-foreground truncate">
          {name || '未命名步骤'}
        </span>
      </div>

      {/* 技能名称 */}
      <div className="text-xs text-muted-foreground truncate">
        {skillName || '未选择技能'}
      </div>

      {/* 输出连接点 */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </div>
  )
}

export default memo(StepNode)
