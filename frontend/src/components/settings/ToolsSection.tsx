import { McpSection } from '../mcp/McpSection'
import { SettingsCard } from './SettingsCard'

export function ToolsSection() {
  return (
    <SettingsCard title="MCP 工具扩展" description="管理 MCP (Model Context Protocol) 服务器，扩展 AI 工具能力。">
      <McpSection />
    </SettingsCard>
  )
}
