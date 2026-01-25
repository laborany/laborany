/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         节点编辑面板                                       ║
 * ║                                                                          ║
 * ║  右侧面板：编辑选中节点的名称、Skill、Prompt                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import type { WorkflowStep } from '../../hooks/useWorkflow'
import type { Skill } from './SkillPanel'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface NodeEditorProps {
  step: WorkflowStep | null
  stepIndex: number | null
  skills: Skill[]
  onUpdate: (stepIndex: number, step: WorkflowStep) => void
  onClose: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           编辑面板组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function NodeEditor({ step, stepIndex, skills, onUpdate, onClose }: NodeEditorProps) {
  const [name, setName] = useState('')
  const [skill, setSkill] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isSkillOpen, setIsSkillOpen] = useState(false)

  // 同步外部数据
  useEffect(() => {
    if (step) {
      setName(step.name)
      setSkill(step.skill)
      setPrompt(step.prompt)
    }
  }, [step])

  // 保存更改
  const handleSave = () => {
    if (stepIndex === null || !step) return
    onUpdate(stepIndex, {
      ...step,
      name,
      skill,
      prompt,
    })
  }

  // 无选中节点时的空状态
  if (step === null || stepIndex === null) {
    return (
      <div className="w-80 h-full bg-card border-l border-border flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <p className="text-sm">选择节点进行编辑</p>
          <p className="text-xs mt-1">双击节点或在画布中点击</p>
        </div>
      </div>
    )
  }

  const selectedSkill = skills.find(s => s.id === skill)

  return (
    <div className="w-80 h-full bg-card border-l border-border flex flex-col">
      {/* 头部 */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium">
            {stepIndex + 1}
          </span>
          <h2 className="text-sm font-medium text-foreground">编辑步骤</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 表单 */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 步骤名称 */}
        <div>
          <label className="block text-sm text-muted-foreground mb-1">步骤名称</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleSave}
            placeholder="例如：数据采集"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Skill 选择 */}
        <div>
          <label className="block text-sm text-muted-foreground mb-1">选择 Skill</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSkillOpen(!isSkillOpen)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-left flex items-center justify-between text-sm"
            >
              <span className={selectedSkill ? 'text-foreground' : 'text-muted-foreground'}>
                {selectedSkill ? `${selectedSkill.icon || '🔧'} ${selectedSkill.name}` : '选择 Skill'}
              </span>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isSkillOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsSkillOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                  {skills.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSkill(s.id)
                        setIsSkillOpen(false)
                        setTimeout(handleSave, 0)
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 text-sm ${
                        s.id === skill ? 'bg-accent' : ''
                      }`}
                    >
                      <span>{s.icon || '🔧'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Prompt 模板 */}
        <div>
          <label className="block text-sm text-muted-foreground mb-1">
            Prompt 模板
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            支持 {'{{input.xxx}}'} 和 {'{{prev.output}}'}
          </p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onBlur={handleSave}
            placeholder="输入发送给 Skill 的指令..."
            rows={8}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>
      </div>

      {/* 底部提示 */}
      <div className="p-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          修改后自动保存
        </p>
      </div>
    </div>
  )
}
