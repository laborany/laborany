/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流编辑页                                       ║
 * ║                                                                          ║
 * ║  双模式编辑器：画布模式（拖拽布局）+ 列表模式（传统表单）                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useWorkflowDetail,
  useWorkflowCRUD,
  type WorkflowStep,
  type WorkflowInputParam,
} from '../hooks/useWorkflow'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas'
import SkillPanel, { type Skill } from '../components/workflow/SkillPanel'
import NodeEditor from '../components/workflow/NodeEditor'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           输入参数编辑器                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function InputParamsEditor({
  params,
  onChange,
}: {
  params: Record<string, WorkflowInputParam>
  onChange: (params: Record<string, WorkflowInputParam>) => void
}) {
  const [newKey, setNewKey] = useState('')

  const addParam = () => {
    if (!newKey.trim()) return
    onChange({
      ...params,
      [newKey.trim()]: { type: 'string', description: '', required: false },
    })
    setNewKey('')
  }

  const removeParam = (key: string) => {
    const newParams = { ...params }
    delete newParams[key]
    onChange(newParams)
  }

  const updateParam = (key: string, updates: Partial<WorkflowInputParam>) => {
    onChange({
      ...params,
      [key]: { ...params[key], ...updates },
    })
  }

  return (
    <div className="space-y-3">
      {Object.entries(params).map(([key, param]) => (
        <div key={key} className="flex items-start gap-2 p-3 bg-accent/50 rounded-lg">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="px-2 py-1 bg-background rounded text-sm">{key}</code>
              <select
                value={param.type}
                onChange={e => updateParam(key, { type: e.target.value as 'string' | 'number' | 'boolean' | 'file' })}
                className="px-2 py-1 bg-background border border-border rounded text-sm"
              >
                <option value="string">字符串</option>
                <option value="number">数字</option>
                <option value="boolean">布尔</option>
                <option value="file">文件</option>
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={param.required}
                  onChange={e => updateParam(key, { required: e.target.checked })}
                />
                必填
              </label>
            </div>
            <input
              type="text"
              value={param.description}
              onChange={e => updateParam(key, { description: e.target.value })}
              placeholder="参数描述"
              className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
            />
            {/* 文件类型时显示 accept 输入 */}
            {param.type === 'file' && (
              <input
                type="text"
                value={param.accept || ''}
                onChange={e => updateParam(key, { accept: e.target.value })}
                placeholder="文件类型限制，如 .pdf,.doc 或 image/*"
                className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => removeParam(key)}
            className="p-1 text-red-500 hover:bg-accent rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {/* 添加新参数 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          placeholder="参数名称"
          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
          onKeyDown={e => e.key === 'Enter' && addParam()}
        />
        <button
          type="button"
          onClick={addParam}
          className="px-3 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm"
        >
          添加参数
        </button>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           设置面板（基本信息 + 参数）                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function SettingsPanel({
  name, setName,
  description, setDescription,
  icon, setIcon,
  inputParams, setInputParams,
  onFailure, setOnFailure,
  isOpen, onClose,
}: {
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  icon: string
  setIcon: (v: string) => void
  inputParams: Record<string, WorkflowInputParam>
  setInputParams: (v: Record<string, WorkflowInputParam>) => void
  onFailure: 'stop' | 'continue' | 'retry'
  setOnFailure: (v: 'stop' | 'continue' | 'retry') => void
  isOpen: boolean
  onClose: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">工作流设置</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* 基本信息 */}
          <section>
            <h3 className="text-sm font-medium text-foreground mb-3">基本信息</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">名称 *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="工作流名称"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">图标</label>
                <input
                  type="text"
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  placeholder="例如：📈"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-muted-foreground mb-1">描述</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="工作流描述"
                  rows={2}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            </div>
          </section>

          {/* 失败策略 */}
          <section>
            <h3 className="text-sm font-medium text-foreground mb-3">执行策略</h3>
            <select
              value={onFailure}
              onChange={e => setOnFailure(e.target.value as 'stop' | 'continue' | 'retry')}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
            >
              <option value="stop">失败时停止</option>
              <option value="continue">失败时继续</option>
            </select>
          </section>

          {/* 输入参数 */}
          <section>
            <h3 className="text-sm font-medium text-foreground mb-3">输入参数</h3>
            <p className="text-xs text-muted-foreground mb-3">
              定义工作流执行时需要用户提供的参数，可在步骤 Prompt 中使用 {'{{input.参数名}}'} 引用
            </p>
            <InputParamsEditor params={inputParams} onChange={setInputParams} />
          </section>
        </div>

        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主页面组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function WorkflowEditPage() {
  const { workflowId } = useParams<{ workflowId: string }>()
  const navigate = useNavigate()
  // 新建模式：workflowId 为 undefined（/workflows/new）或 'new'
  const isNew = !workflowId || workflowId === 'new'

  const { workflow, loading, fetchWorkflow } = useWorkflowDetail(isNew ? undefined : workflowId)
  const { createWorkflow, updateWorkflow, installAsSkill, saving, error } = useWorkflowCRUD()

  // 表单状态
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [inputParams, setInputParams] = useState<Record<string, WorkflowInputParam>>({})
  const [onFailure, setOnFailure] = useState<'stop' | 'continue' | 'retry'>('stop')

  // UI 状态
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedStep, setSelectedStep] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [installing, setInstalling] = useState(false)

  // 加载现有工作流
  useEffect(() => {
    if (!isNew) fetchWorkflow()
  }, [isNew, fetchWorkflow])

  // 填充表单
  useEffect(() => {
    if (workflow) {
      setName(workflow.name)
      setDescription(workflow.description)
      setIcon(workflow.icon || '')
      setSteps(workflow.steps)
      setInputParams(workflow.input)
      setOnFailure(workflow.on_failure)
    }
  }, [workflow])

  // 添加步骤（从 SkillPanel 点击）
  const handleAddSkill = useCallback((skill: Skill) => {
    const newStep: WorkflowStep = {
      skill: skill.id,
      name: skill.name,
      prompt: '',
      position: { x: 250, y: steps.length * 150 + 50 },
    }
    setSteps(prev => [...prev, newStep])
    setSelectedStep(steps.length)
  }, [steps.length])

  // 添加步骤（从画布拖拽放置）
  const handleAddSkillAtPosition = useCallback((skill: Skill, position: { x: number; y: number }) => {
    const newStep: WorkflowStep = {
      skill: skill.id,
      name: skill.name,
      prompt: '',
      position,
    }
    setSteps(prev => [...prev, newStep])
    setSelectedStep(steps.length)
  }, [steps.length])

  // 更新步骤
  const updateStep = useCallback((index: number, step: WorkflowStep) => {
    setSteps(prev => prev.map((s, i) => (i === index ? step : s)))
  }, [])

  // 编辑步骤
  const handleEditStep = useCallback((index: number) => {
    setSelectedStep(index)
  }, [])

  // 保存
  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入工作流名称')
      return
    }
    if (steps.length === 0) {
      alert('请至少添加一个步骤')
      return
    }
    if (steps.some(s => !s.skill)) {
      alert('请为所有步骤选择技能')
      return
    }

    try {
      const data = {
        name,
        description,
        icon: icon || undefined,
        steps,
        input: inputParams,
        on_failure: onFailure,
      }

      if (isNew) {
        await createWorkflow(data)
      } else {
        await updateWorkflow(workflowId!, data)
      }
      navigate('/workflows')
    } catch {
      // 错误已在 hook 中处理
    }
  }

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       安装为技能                                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleInstallAsSkill = async () => {
    // 新建模式需要先保存
    if (isNew) {
      alert('请先保存工作流')
      return
    }

    setInstalling(true)
    try {
      const skillId = await installAsSkill(workflowId!)
      alert(`安装成功！技能 ID: ${skillId}`)
      navigate('/skills')
    } catch {
      // 错误已在 hook 中处理
    } finally {
      setInstalling(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const selectedStepData = selectedStep !== null ? steps[selectedStep] : null

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* 头部 */}
      <header className="h-14 border-b border-border flex items-center justify-between pl-4 pr-40 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflows')}
            className="p-2 hover:bg-accent rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {name || (isNew ? '新建工作流' : '编辑工作流')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {steps.length} 个步骤
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 设置按钮 */}
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-2 hover:bg-accent rounded-lg text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            设置
          </button>

          {/* 安装为技能按钮（仅编辑模式显示） */}
          {!isNew && (
            <button
              onClick={handleInstallAsSkill}
              disabled={installing || saving}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {installing ? '安装中...' : '安装为技能'}
            </button>
          )}

          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {/* 主内容区：三栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：Skill 面板 */}
        <SkillPanel
          skills={skills}
          onSkillsLoad={setSkills}
          onAddSkill={handleAddSkill}
        />

        {/* 中间：画布 */}
        <div className="flex-1 relative">
          <WorkflowCanvas
            steps={steps}
            skills={skills}
            onStepsChange={setSteps}
            onEditStep={handleEditStep}
            selectedStep={selectedStep}
            onSelectStep={setSelectedStep}
            onAddSkill={handleAddSkillAtPosition}
          />
        </div>

        {/* 右侧：节点编辑器 */}
        <NodeEditor
          step={selectedStepData}
          stepIndex={selectedStep}
          skills={skills}
          onUpdate={updateStep}
          onClose={() => setSelectedStep(null)}
        />
      </div>

      {/* 设置弹窗 */}
      <SettingsPanel
        name={name} setName={setName}
        description={description} setDescription={setDescription}
        icon={icon} setIcon={setIcon}
        inputParams={inputParams} setInputParams={setInputParams}
        onFailure={onFailure} setOnFailure={setOnFailure}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  )
}