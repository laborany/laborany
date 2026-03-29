import { McpSection } from '../mcp/McpSection'
import { SettingsCard } from './SettingsCard'
import { BrowserResearchSection } from './BrowserResearchSection'

export function ToolsSection() {
  return (
    <>
      <BrowserResearchSection />
      <SettingsCard title="MCP 工具扩展" description="管理 MCP (Model Context Protocol) 服务器，扩展 AI 工具能力。">
        <McpSection />
      </SettingsCard>
    </>
  )
}
