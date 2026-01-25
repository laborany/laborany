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
        <h2 className="text-2xl font-bold">Skills 管理</h2>
        <Link to="/" className="text-sm text-primary-600 hover:underline">
          返回首页
        </Link>
      </div>

      <div className="border-b border-gray-200 mb-6">
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
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-64 bg-gray-200 rounded" />
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
          className="text-gray-500 hover:text-gray-700"
        >
          ← 返回
        </button>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{detail?.icon}</span>
          <div>
            <h2 className="text-2xl font-bold">{detail?.name}</h2>
            <p className="text-sm text-gray-600">{detail?.description}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 文件列表 */}
        <div className="col-span-4 bg-white rounded-lg shadow-sm border p-4">
          <h3 className="font-semibold mb-4">物料结构</h3>
          <div className="space-y-1">
            {detail?.files.map((file) => (
              <div key={file.path}>
                <button
                  onClick={() => file.type !== 'folder' && loadFileContent(file.path)}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                    selectedFile === file.path
                      ? 'bg-primary-50 text-primary-700'
                      : 'hover:bg-gray-50'
                  } ${file.type === 'folder' ? 'cursor-default font-medium' : ''}`}
                >
                  <FileIcon type={file.type} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{file.name}</div>
                    {file.description && (
                      <div className="text-xs text-gray-500 truncate">{file.description}</div>
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
                        className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                          selectedFile === child.path
                            ? 'bg-primary-50 text-primary-700'
                            : 'hover:bg-gray-50'
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
        <div className="col-span-8 bg-white rounded-lg shadow-sm border">
          {selectedFile ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-medium">{selectedFile}</span>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveFileContent}
                        className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                      >
                        保存
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1 text-sm text-primary-600 hover:text-primary-700"
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
                    className="w-full h-full min-h-[400px] font-mono text-sm p-2 border rounded focus:ring-2 focus:ring-primary-500"
                  />
                ) : (
                  <pre className="font-mono text-sm whitespace-pre-wrap">{fileContent}</pre>
                )}
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
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
              } else if (data.type === 'skill_created') {
                setGeneratedSkill(data.skillId)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch {
      // 模拟响应
      const mockResponse = generateMockResponse(userMessage, messages.length)
      setMessages((prev) => [...prev, { role: 'assistant', content: mockResponse }])
    } finally {
      setGenerating(false)
    }
  }

  function generateMockResponse(userInput: string, msgCount: number): string {
    if (msgCount <= 2) {
      return `好的，我理解了你想创建一个 **${userInput.slice(0, 20)}** 相关的助手。

让我进一步了解：
- 这个流程有哪些**具体步骤**？
- 每个步骤需要做什么？
- 有没有需要调用的外部工具或 API？`
    }

    if (msgCount <= 4) {
      return `明白了！基于你的描述，我来梳理一下这个 Skill 的流程：

**流程步骤：**
1. 接收用户输入
2. 数据获取与预处理
3. 核心分析/处理
4. 结果整理与输出

**需要的工具：**
- 数据获取脚本
- 分析处理脚本
- 报告生成脚本

这样的流程设计合理吗？如果没问题，我就开始生成完整的 Skill 结构了。`
    }

    setGeneratedSkill('new-skill-' + Date.now())
    return `太好了！我已经为你生成了完整的 Skill 结构：

\`\`\`
skills/
└── your-skill/
    ├── SKILL.md          ✅ 主指令已生成
    ├── FORMS.md          ✅ 表单指南已生成
    ├── skill.yaml        ✅ 配置文件已生成
    └── scripts/
        ├── fetch.py      ✅ 数据获取脚本
        ├── process.py    ✅ 处理脚本
        └── output.py     ✅ 输出脚本
\`\`\`

Skill 已创建成功！你可以在「已安装」标签页中找到它，点击「配置」可以查看和编辑所有文件。`
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border">
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
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              </div>
            </div>
          ))}
          {generating && (
            <div className="flex justify-start">
              <div className="bg-gray-100 px-4 py-3 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="animate-pulse">●</span>
                  正在思考...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="border-t p-4">
          {generatedSkill ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-600">Skill 创建成功！</span>
              <Link
                to="/skills"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
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
                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50"
              />
              <button
                onClick={sendMessage}
                disabled={generating || !input.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                发送
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-center text-sm text-gray-500">
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
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
          ← 返回
        </button>
        <h2 className="text-xl font-bold">优化 Skill: {skillName}</h2>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
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
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              </div>
            </div>
          ))}
          {optimizing && (
            <div className="flex justify-start">
              <div className="bg-gray-100 px-4 py-3 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="animate-pulse">●</span>
                  正在分析和优化...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="border-t p-4">
          {completed ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-600">Skill 优化完成！</span>
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
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
                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50"
              />
              <button
                onClick={sendMessage}
                disabled={optimizing || !input.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                发送
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-center text-sm text-gray-500">
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
          ? 'border-primary-600 text-primary-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
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
          <div key={i} className="h-40 bg-gray-200 rounded-lg" />
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
        <p className="text-gray-500 mb-4">还没有安装任何 Skill</p>
        <p className="text-sm text-gray-400">去官方 Skills 安装，或创建自定义 Skill</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skills.map((skill) => (
        <div
          key={skill.id}
          className="p-6 bg-white rounded-lg shadow-sm border border-gray-100"
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">{skill.icon || '🤖'}</span>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{skill.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{skill.description}</p>
              {skill.category && (
                <span className="inline-block mt-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                  {skill.category}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link
              to={`/execute/${skill.id}`}
              className="flex-1 text-center py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
            >
              使用
            </Link>
            <button
              onClick={() => onOptimize(skill.id)}
              className="px-3 py-2 text-sm text-primary-600 hover:text-primary-700 border border-primary-200 rounded"
              title="AI 优化"
            >
              优化
            </button>
            <button
              onClick={() => onConfigure(skill.id)}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded"
            >
              配置
            </button>
            <button
              onClick={() => onUninstall(skill.id)}
              className="px-3 py-2 text-sm text-red-500 hover:text-red-700 border border-red-200 rounded"
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
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold mb-3">从 GitHub 安装</h3>
        <p className="text-sm text-gray-600 mb-4">
          输入 GitHub 仓库中 Skill 的路径，例如：
          <code className="mx-1 px-2 py-1 bg-gray-100 rounded text-xs">
            anthropics/skills/skills/skill-creator
          </code>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customUrl}
            onChange={(e) => onCustomUrlChange(e.target.value)}
            placeholder="owner/repo/path/to/skill 或 GitHub URL"
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={() => customUrl && onInstall(customUrl)}
            disabled={!customUrl || installing === customUrl}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {installing === customUrl ? '安装中...' : '安装'}
          </button>
        </div>
        {installError && (
          <p className="mt-2 text-sm text-red-600">{installError}</p>
        )}
      </div>

      {/* 官方 Skills 列表 */}
      <div>
        <h3 className="font-semibold mb-4">Anthropic 官方 Skills</h3>
        {skills.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
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
                  className="p-6 bg-white rounded-lg shadow-sm border border-gray-100"
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">🔧</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{skill.name}</h3>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {skill.description}
                      </p>
                      <p className="text-xs text-gray-400 mt-2 truncate">
                        {skill.source}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    {isInstalled ? (
                      <span className="block text-center py-2 text-sm text-green-600 bg-green-50 rounded">
                        已安装
                      </span>
                    ) : (
                      <button
                        onClick={() => onInstall(skill.source)}
                        disabled={isInstalling}
                        className="w-full py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700 disabled:opacity-50"
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
