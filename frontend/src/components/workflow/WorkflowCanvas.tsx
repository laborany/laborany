/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流画布                                         ║
 * ║                                                                          ║
 * ║  核心画布组件：节点渲染、连线、缩放、平移、小地图                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type NodeChange,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import StepNode, { type StepNodeData } from './StepNode'
import type { WorkflowStep } from '../../hooks/useWorkflow'
import type { Skill } from './SkillPanel'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface WorkflowCanvasProps {
  steps: WorkflowStep[]
  skills: Skill[]
  onStepsChange: (steps: WorkflowStep[]) => void
  onEditStep: (stepIndex: number) => void
  selectedStep: number | null
  onSelectStep: (stepIndex: number | null) => void
  onAddSkill?: (skill: Skill, position: { x: number; y: number }) => void
}

// 自定义节点类型
type StepNode = Node<StepNodeData>

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           节点类型注册                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const nodeTypes = {
  stepNode: StepNode,
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据转换：统一的映射逻辑                          │
 * │                                                                          │
 * │  设计哲学：消除特殊情况，所有节点用同一套逻辑处理                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

// 步骤 → 节点：纯函数映射，无分支
function stepsToNodes(
  steps: WorkflowStep[],
  skills: Skill[],
  onEdit: (i: number) => void,
  onDelete: (i: number) => void
): Node[] {
  const skillMap = new Map(skills.map(s => [s.id, s]))

  return steps.map((step, index) => {
    const skill = skillMap.get(step.skill)
    // 默认位置：垂直排列，间距 150px
    const defaultPos = { x: 250, y: index * 150 + 50 }

    return {
      id: `step-${index}`,
      type: 'stepNode',
      position: step.position || defaultPos,
      data: {
        stepIndex: index,
        name: step.name,
        skill: step.skill,
        skillName: skill?.name,
        icon: skill?.icon,
        prompt: step.prompt,
        onEdit,
        onDelete,
      } as StepNodeData,
    }
  })
}

// 步骤 → 边：顺序连接，无特殊情况
function stepsToEdges(steps: WorkflowStep[]): Edge[] {
  return steps.slice(0, -1).map((_, index) => ({
    id: `edge-${index}-${index + 1}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    type: 'smoothstep',
    animated: true,
    style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
  }))
}

// 节点 → 步骤：同步位置信息
function nodesToSteps(nodes: Node[], currentSteps: WorkflowStep[]): WorkflowStep[] {
  return currentSteps.map((step, index) => {
    const node = nodes.find(n => n.id === `step-${index}`)
    return node ? { ...step, position: node.position } : step
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           画布组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function WorkflowCanvasInner({
  steps,
  skills,
  onStepsChange,
  onEditStep,
  selectedStep,
  onSelectStep,
  onAddSkill,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  // 初始化节点和边
  const initialNodes = useMemo(
    () => stepsToNodes(steps, skills, onEditStep, (i) => {
      const newSteps = steps.filter((_, idx) => idx !== i)
      onStepsChange(newSteps)
    }),
    [steps, skills, onEditStep, onStepsChange]
  )

  const initialEdges = useMemo(() => stepsToEdges(steps), [steps])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // 同步外部 steps 变化到节点
  useEffect(() => {
    setNodes(stepsToNodes(steps, skills, onEditStep, (i) => {
      const newSteps = steps.filter((_, idx) => idx !== i)
      onStepsChange(newSteps)
    }))
    setEdges(stepsToEdges(steps))
  }, [steps, skills, onEditStep, onStepsChange, setNodes, setEdges])

  // 节点拖拽结束：同步位置到 steps
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)

      // 检测拖拽结束事件
      const hasDragEnd = changes.some(
        c => c.type === 'position' && !('dragging' in c && c.dragging)
      )
      if (hasDragEnd) {
        setNodes(currentNodes => {
          const updatedSteps = nodesToSteps(currentNodes, steps)
          // 延迟更新避免循环
          setTimeout(() => onStepsChange(updatedSteps), 0)
          return currentNodes
        })
      }
    },
    [onNodesChange, steps, onStepsChange, setNodes]
  )

  // 连线处理
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge({ ...connection, type: 'smoothstep', animated: true }, eds))
    },
    [setEdges]
  )

  // 节点选中
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const match = node.id.match(/step-(\d+)/)
      onSelectStep(match ? parseInt(match[1], 10) : null)
    },
    [onSelectStep]
  )

  // 画布点击：取消选中
  const handlePaneClick = useCallback(() => {
    onSelectStep(null)
  }, [onSelectStep])

  // 拖拽放置处理
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const data = event.dataTransfer.getData('application/json')
      if (!data || !onAddSkill) return

      try {
        const skill = JSON.parse(data) as Skill
        // 将屏幕坐标转换为画布坐标
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })
        onAddSkill(skill, position)
      } catch {
        // 忽略解析错误
      }
    },
    [screenToFlowPosition, onAddSkill]
  )

  // 更新选中状态
  const nodesWithSelection = nodes.map(n => {
    const match = n.id.match(/step-(\d+)/)
    const idx = match ? parseInt(match[1], 10) : -1
    return { ...n, selected: idx === selectedStep }
  })

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full bg-background"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls className="!bg-card !border-border !rounded-lg !shadow-lg" />
        <MiniMap
          className="!bg-card !border-border !rounded-lg"
          nodeColor="hsl(var(--primary))"
          maskColor="hsl(var(--background) / 0.8)"
        />
      </ReactFlow>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出组件（包裹 Provider）                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}