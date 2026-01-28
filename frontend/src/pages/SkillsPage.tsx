/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      Skills 管理页面                                      ║
 * ║                                                                          ║
 * ║  职责：查看、配置、创建 AI Skills                                          ║
 * ║  设计：配置展示完整物料结构，创建通过对话式流程                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface Skill {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
}

interface SkillFile {
  name: string
  path: string
  type: string
  description: string
  content?: string
  children?: Array<{ name: string; path: string; type: string }>
}

interface SkillDetail {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
  files: SkillFile[]
}

interface CreateMessage {
  role: 'user' | 'assistant'
  content: string
}

interface OfficialSkill {
  id: string
  name: string
  description: string
  source: string
}


/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [officialSkills, setOfficialSkills] = useState<OfficialSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'installed' | 'official' | 'create'>('installed')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [optimizingSkill, setOptimizingSkill] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => {
    fetchSkills()
  }, [])

  useEffect(() => {
    if (activeTab === 'official' && officialSkills.length === 0) {
      fetchOfficialSkills()
    }
  }, [activeTab])

  async function fetchSkills() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/skill/list', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setSkills(data.skills || [])
    } catch {
      setSkills([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchOfficialSkills() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/skill/official', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setOfficialSkills(data.skills || [])
    } catch {
      setOfficialSkills([])
    }
  }

  async function installSkill(source: string) {
    setInstalling(source)
    setInstallError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/skill/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || '安装失败')
      }
      await fetchSkills()
      setActiveTab('installed')
      setCustomUrl('')
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : '安装失败')
    } finally {
      setInstalling(null)
    }
  }

  async function uninstallSkill(skillId: string) {
    if (!confirm(`确定要卸载 "${skillId}" 吗？`)) return
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/skill/uninstall/${skillId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchSkills()
    } catch (err) {
      console.error('卸载失败:', err)
    }
  }

  const installedIds = new Set(skills.map((s) => s.id))

  // 如果选中了某个 Skill，显示配置详情
  if (selectedSkill) {
    return (
      <SkillConfigPage
        skillId={selectedSkill}
        onBack={() => setSelectedSkill(null)}
      />
    )
  }

  // 如果正在优化某个 Skill，显示优化对话
  if (optimizingSkill) {
    const skill = skills.find((s) => s.id === optimizingSkill)
    return (
      <OptimizeSkillChat
        skillId={optimizingSkill}
        skillName={skill?.name || optimizingSkill}
        onBack={() => setOptimizingSkill(null)}
        onComplete={() => {
          setOptimizingSkill(null)
          fetchSkills()
        }}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">Skills 管理</h2>
        <Link to="/" className="text-sm text-primary hover:underline">
          返回首页
        </Link>
      </div>

      <div className="border-b border-border mb-6">
        <nav className="flex gap-8">
          <TabButton
            active={activeTab === 'installed'}
            onClick={() => setActiveTab('installed')}
          >
            已安装 ({skills.length})
          </TabButton>
          <TabButton
            active={activeTab === 'official'}
            onClick={() => setActiveTab('official')}
          >
            官方 Skills
          </TabButton>
          <TabButton
            active={activeTab === 'create'}
            onClick={() => setActiveTab('create')}
          >
            创建流程
          </TabButton>
        </nav>
      </div>

      {loading ? (
        <LoadingState />
      ) : activeTab === 'installed' ? (
        <InstalledSkills
          skills={skills}
          onConfigure={setSelectedSkill}
          onOptimize={setOptimizingSkill}
          onUninstall={uninstallSkill}
        />
      ) : activeTab === 'official' ? (
        <OfficialSkillsMarket
          skills={officialSkills}
          installedIds={installedIds}
          installing={installing}
          customUrl={customUrl}
          installError={installError}
          onInstall={installSkill}
          onCustomUrlChange={setCustomUrl}
        />
      ) : (
        <CreateSkillChat />
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       Skill 配置详情页                                    │
 * │  展示完整的物料结构：SKILL.md, FORMS.md, skill.yaml, scripts/             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function SkillConfigPage({
  skillId,
  onBack,
}: {
  skillId: string
  onBack: () => void
}) {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchSkillDetail()
  }, [skillId])

  async function fetchSkillDetail() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/skill/${skillId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setDetail(data)
    } catch {
      // 模拟数据
      setDetail({
        id: skillId,
        name: '金融研报助手',
        description: '分析财报数据，生成专业的金融研究报告',
        icon: '📊',
        category: '金融',
        files: [
          { name: 'SKILL.md', path: 'SKILL.md', type: 'md', description: '主指令（触发时加载）' },
          { name: 'FORMS.md', path: 'FORMS.md', type: 'md', description: '表单指南（按需加载）' },
          { name: 'reference.md', path: 'reference.md', type: 'md', description: 'API 参考（按需加载）' },
          { name: 'examples.md', path: 'examples.md', type: 'md', description: '使用示例（按需加载）' },
          { name: 'skill.yaml', path: 'skill.yaml', type: 'yaml', description: '元信息和能力配置' },
          { name: 'scripts/', path: 'scripts', type: 'folder', description: '工具脚本目录' },
        ],
      })
    } finally {
      setLoading(false)
    }
  }

  async function loadFileContent(path: string) {
    setSelectedFile(path)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/skill/${skillId}/file?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setFileContent(data.content || '')
    } catch {
      // 模拟内容
      if (path === 'SKILL.md') {
        setFileContent(`# 金融研报助手

## 角色定义
你是一位专业的金融分析师，擅长分析财务报表和生成研究报告。

## 工作流程
1. 接收用户的分析需求
2. 获取相关财务数据
3. 进行深度分析
4. 生成专业研报

## 输出格式
- 公司概况
- 财务分析
- 行业对比
- 风险提示
- 投资建议`)
      } else if (path === 'skill.yaml') {
        setFileContent(`name: 金融研报助手
description: 分析财报数据，生成专业的金融研究报告
icon: "📊"
category: 金融

price_per_run: 0.5

features:
  - 财务报表分析
  - 关键指标计算
  - 行业对比分析

tools:
  - name: fetch_stock_data
    script: scripts/fetch_data.py
  - name: analyze_financial
    script: scripts/analyze.py`)
      } else {
        setFileContent('// 文件内容加载中...')
      }
    }
    setEditing(false)
  }

  async function saveFileContent() {
    if (!selectedFile) return
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/skill/${skillId}/file`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path: selectedFile, content: fileContent }),
      })
      setEditing(false)
    } catch (err) {
      console.error('保存失败:', err)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 页头 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{detail?.icon}</span>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{detail?.name}</h2>
            <p className="text-sm text-muted-foreground">{detail?.description}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 文件列表 */}
        <div className="col-span-4 card p-4">
          <h3 className="font-semibold text-foreground mb-4">物料结构</h3>
          <div className="space-y-1">
            {detail?.files.map((file) => (
              <div key={file.path}>
                <button
                  onClick={() => file.type !== 'folder' && loadFileContent(file.path)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                    selectedFile === file.path
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent'
                  } ${file.type === 'folder' ? 'cursor-default font-medium' : ''}`}
                >
                  <FileIcon type={file.type} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-foreground">{file.name}</div>
                    {file.description && (
                      <div className="text-xs text-muted-foreground truncate">{file.description}</div>
                    )}
                  </div>
                </button>
                {/* 子目录文件 */}
                {file.type === 'folder' && file.children && file.children.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1">
                    {file.children.map((child) => (
                      <button
                        key={child.path}
                        onClick={() => loadFileContent(child.path)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                          selectedFile === child.path
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <FileIcon type={child.type} />
                        <span className="truncate">{child.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 文件内容 */}
        <div className="col-span-8 card">
          {selectedFile ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-medium text-foreground">{selectedFile}</span>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveFileContent}
                        className="btn-primary px-3 py-1 text-sm"
                      >
                        保存
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 p-4 overflow-auto">
                {editing ? (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="input w-full h-full min-h-[400px] font-mono text-sm"
                  />
                ) : (
                  <pre className="font-mono text-sm whitespace-pre-wrap text-foreground">{fileContent}</pre>
                )}
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              选择左侧文件查看内容
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       对话式创建 Skill                                    │
 * │  通过与 Claude Code 对话，逐步定义流程步骤，生成完整 Skill 结构             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function CreateSkillChat() {
  const [messages, setMessages] = useState<CreateMessage[]>([
    {
      role: 'assistant',
      content: `你好！我是 Skill 创建助手。

我会帮你通过对话的方式创建一个完整的 AI 工作流程（Skill）。

请告诉我：
1. **你想创建什么类型的助手？** （例如：数据分析、内容创作、代码审查等）
2. **这个助手需要完成什么任务？** （描述具体的工作流程）
3. **需要什么输入？会产生什么输出？**

描述得越详细，我生成的 Skill 就越精准。`,
    },
  ])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedSkill, setGeneratedSkill] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || generating) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setGenerating(true)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/skill/create-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
        }),
      })

      /* ┌────────────────────────────────────────────────────────────────────────┐
       * │  检查响应状态，非 200 时读取错误信息                                     │
       * └────────────────────────────────────────────────────────────────────────┘ */
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '请求失败' }))
        throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      let assistantMessage = ''
      const decoder = new TextDecoder()

      /* ┌────────────────────────────────────────────────────────────────────────┐
       * │  辅助函数：更新助手消息                                                  │
       * └────────────────────────────────────────────────────────────────────────┘ */
      const updateAssistantMessage = (content: string) => {
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastMsg = newMessages[newMessages.length - 1]
          if (lastMsg?.role === 'assistant') {
            lastMsg.content = content
          } else {
            newMessages.push({ role: 'assistant', content })
          }
          return newMessages
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.slice(6))

            switch (data.type) {
              case 'init':
                assistantMessage = `📁 工作目录: ${data.taskDir || '准备中...'}\n\n`
                updateAssistantMessage(assistantMessage)
                break

              case 'text':
                if (data.content) {
                  assistantMessage += data.content
                  updateAssistantMessage(assistantMessage)
                }
                break

              case 'tool_use':
                assistantMessage += `\n🔧 正在执行: ${data.toolName || '工具'}...\n`
                updateAssistantMessage(assistantMessage)
                break

              case 'tool_result':
                assistantMessage += '✅ 完成\n'
                updateAssistantMessage(assistantMessage)
                break

              case 'error':
                assistantMessage += `\n❌ 错误: ${data.content || data.message || '未知错误'}\n`
                updateAssistantMessage(assistantMessage)
                break

              case 'skill_created':
                setGeneratedSkill(data.skillId)
                break

              case 'done':
                setGeneratedSkill('created')
                break
            }
          } catch {
            // 非 JSON 行，忽略
          }
        }
      }

      /* ┌────────────────────────────────────────────────────────────────────────┐
       * │  如果没有收到任何消息，显示提示                                          │
       * └────────────────────────────────────────────────────────────────────────┘ */
      if (!assistantMessage) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '处理完成，但没有收到响应内容。请检查后端日志。' },
        ])
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '请求失败'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ 错误: ${errorMsg}\n\n请检查后端服务是否正常运行。` },
      ])
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="card">
        {/* 消息列表 */}
        <div className="h-[500px] overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              </div>
            </div>
          ))}
          {generating && (
            <div className="flex justify-start">
              <div className="bg-muted px-4 py-3 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="animate-pulse">●</span>
                  正在思考...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="border-t border-border p-4">
          {generatedSkill ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-600 dark:text-green-400">Skill 创建成功！</span>
              <Link
                to="/skills"
                onClick={() => window.location.reload()}
                className="btn-primary px-4 py-2 text-sm"
              >
                查看 Skill
              </Link>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="描述你想创建的工作流程..."
                disabled={generating}
                className="input flex-1"
              />
              <button
                onClick={sendMessage}
                disabled={generating || !input.trim()}
                className="btn-primary px-4 py-2"
              >
                发送
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        通过对话描述你的需求，AI 会帮你生成完整的 Skill 结构
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       对话式优化 Skill                                    │
 * │  通过与 AI 对话，描述想要的改进，自动修改 Skill 文件                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function OptimizeSkillChat({
  skillId,
  skillName,
  onBack,
  onComplete,
}: {
  skillId: string
  skillName: string
  onBack: () => void
  onComplete: () => void
}) {
  const [messages, setMessages] = useState<CreateMessage[]>([
    {
      role: 'assistant',
      content: `你好！我是 Skill 优化助手。

我会帮你改进和优化 **${skillName}** 这个 Skill。

请告诉我你想要：
1. **功能增强** - 添加新功能或扩展现有能力
2. **提示词优化** - 改进指令使输出更准确
3. **性能优化** - 提高执行效率
4. **错误修复** - 修复已知问题
5. **其他改进** - 描述你的具体需求

我会分析现有代码，然后根据你的需求进行修改。`,
    },
  ])
  const [input, setInput] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [completed, setCompleted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || optimizing) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setOptimizing(true)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/skill/${skillId}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
        }),
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      let assistantMessage = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'text') {
                assistantMessage += data.content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const lastMsg = newMessages[newMessages.length - 1]
                  if (lastMsg?.role === 'assistant') {
                    lastMsg.content = assistantMessage
                  } else {
                    newMessages.push({ role: 'assistant', content: assistantMessage })
                  }
                  return newMessages
                })
              } else if (data.type === 'skill_updated') {
                setCompleted(true)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '优化过程中出现错误，请稍后重试。' },
      ])
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-foreground">优化 Skill: {skillName}</h2>
      </div>

      <div className="card">
        {/* 消息列表 */}
        <div className="h-[500px] overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              </div>
            </div>
          ))}
          {optimizing && (
            <div className="flex justify-start">
              <div className="bg-muted px-4 py-3 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="animate-pulse">●</span>
                  正在分析和优化...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="border-t border-border p-4">
          {completed ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-600 dark:text-green-400">Skill 优化完成！</span>
              <button
                onClick={onComplete}
                className="btn-primary px-4 py-2 text-sm"
              >
                返回列表
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="描述你想要的改进..."
                disabled={optimizing}
                className="input flex-1"
              />
              <button
                onClick={sendMessage}
                disabled={optimizing || !input.trim()}
                className="btn-primary px-4 py-2"
              >
                发送
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        AI 会分析现有代码并根据你的需求进行优化
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function FileIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    md: '📄',
    yaml: '⚙️',
    py: '🐍',
    folder: '📁',
  }
  return <span>{icons[type] || '📄'}</span>
}

function InstalledSkills({
  skills,
  onConfigure,
  onOptimize,
  onUninstall,
}: {
  skills: Skill[]
  onConfigure: (id: string) => void
  onOptimize: (id: string) => void
  onUninstall: (id: string) => void
}) {
  if (skills.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">还没有安装任何 Skill</p>
        <p className="text-sm text-muted-foreground/70">去官方 Skills 安装，或创建自定义 Skill</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skills.map((skill) => (
        <div
          key={skill.id}
          className="card-hover p-6"
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">{skill.icon || '🤖'}</span>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-foreground">{skill.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
              {skill.category && (
                <span className="inline-block mt-2 px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded">
                  {skill.category}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link
              to={`/execute/${skill.id}`}
              className="btn-primary flex-1 text-center py-2 text-sm"
            >
              使用
            </Link>
            <button
              onClick={() => onOptimize(skill.id)}
              className="px-3 py-2 text-sm text-primary hover:text-primary/80 border border-primary/20 rounded-lg transition-colors"
              title="AI 优化"
            >
              优化
            </button>
            <button
              onClick={() => onConfigure(skill.id)}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              配置
            </button>
            <button
              onClick={() => onUninstall(skill.id)}
              className="px-3 py-2 text-sm text-destructive hover:text-destructive/80 border border-destructive/20 rounded-lg transition-colors"
            >
              卸载
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function OfficialSkillsMarket({
  skills,
  installedIds,
  installing,
  customUrl,
  installError,
  onInstall,
  onCustomUrlChange,
}: {
  skills: OfficialSkill[]
  installedIds: Set<string>
  installing: string | null
  customUrl: string
  installError: string | null
  onInstall: (source: string) => void
  onCustomUrlChange: (url: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* 自定义 GitHub URL 安装 */}
      <div className="card p-6">
        <h3 className="font-semibold text-foreground mb-3">从 GitHub 安装</h3>
        <p className="text-sm text-muted-foreground mb-4">
          输入 GitHub 仓库中 Skill 的路径，例如：
          <code className="mx-1 px-2 py-1 bg-muted rounded text-xs">
            anthropics/skills/skills/skill-creator
          </code>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customUrl}
            onChange={(e) => onCustomUrlChange(e.target.value)}
            placeholder="owner/repo/path/to/skill 或 GitHub URL"
            className="input flex-1"
          />
          <button
            onClick={() => customUrl && onInstall(customUrl)}
            disabled={!customUrl || installing === customUrl}
            className="btn-primary px-6 py-2"
          >
            {installing === customUrl ? '安装中...' : '安装'}
          </button>
        </div>
        {installError && (
          <p className="mt-2 text-sm text-destructive">{installError}</p>
        )}
      </div>

      {/* 官方 Skills 列表 */}
      <div>
        <h3 className="font-semibold text-foreground mb-4">Anthropic 官方 Skills</h3>
        {skills.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>正在加载官方 Skills...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => {
              const isInstalled = installedIds.has(skill.id)
              const isInstalling = installing === skill.source

              return (
                <div
                  key={skill.id}
                  className="card-hover p-6"
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">🔧</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-foreground">{skill.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {skill.description}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-2 truncate">
                        {skill.source}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    {isInstalled ? (
                      <span className="block text-center py-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        已安装
                      </span>
                    ) : (
                      <button
                        onClick={() => onInstall(skill.source)}
                        disabled={isInstalling}
                        className="btn-primary w-full py-2 text-sm"
                      >
                        {isInstalling ? '安装中...' : '安装'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
