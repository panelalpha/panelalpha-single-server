import { describe, expect, it } from 'vitest'
import {
  connectAiTools,
  isToolKey,
  MANAGE_KEYS,
  manageNavItems,
  navItems,
  TOOL_KEYS,
  toolNavItems,
} from './connect-ai-tools'

const t = (key: string): string => key
const URL = '//host.example/mcp'
const tools = connectAiTools(t, URL)

describe('connect-ai-tools', () => {
  it('lists the eight tools and the three manage views in the legacy order', () => {
    expect(TOOL_KEYS).toEqual(['claudecode', 'chatgpt', 'codex', 'claude', 'cursor', 'windsurf', 'vscode', 'other'])
    expect(MANAGE_KEYS).toEqual(['tokens', 'capabilities', 'activity-log'])
    expect(Object.keys(tools)).toEqual([...TOOL_KEYS])
  })

  it('isToolKey tells tools from the manage views', () => {
    expect(isToolKey('cursor')).toBe(true)
    expect(isToolKey('tokens')).toBe(false)
  })

  it('sidebar lists and the tab strip are built from the same keys and labels', () => {
    expect(toolNavItems(t).map(item => item.label)).toEqual([
      'heading.connectAi.toolNames.claudeCode',
      'heading.connectAi.toolNames.chatgpt',
      'heading.connectAi.toolNames.codex',
      'heading.connectAi.toolNames.claude',
      'heading.connectAi.toolNames.cursor',
      'heading.connectAi.toolNames.windsurf',
      'heading.connectAi.toolNames.vscode',
      'heading.connectAi.toolNames.other',
    ])
    expect(manageNavItems(t).map(item => item.label)).toEqual([
      'heading.connectAi.tool.mcpUrlTokens',
      'heading.connectAi.capabilities',
      'heading.connectAi.activityLog',
    ])
    expect(navItems(t)).toHaveLength(11)
    expect(navItems(t).map(item => item.key)).toEqual([...TOOL_KEYS, ...MANAGE_KEYS])
  })

  it('every tool but claude starts with the token step and has a docs link', () => {
    for (const key of TOOL_KEYS.filter(key => key !== 'claude')) {
      expect(tools[key].steps[0]).toEqual({ kind: 'token', title: 'heading.connectAi.tool.generateToken' })
      expect(tools[key].docs).toMatch(/^https:\/\//)
    }
  })

  it('claudecode: token, code, text; the code is the legacy command with the URL', () => {
    expect(tools.claudecode.steps.map(step => step.kind)).toEqual(['token', 'code', 'text'])
    expect(tools.claudecode.docs).toBe('https://code.claude.com/docs/en/mcp')
    expect(tools.claudecode.steps[1]).toMatchObject({
      code: 'claude mcp add --transport http panelalpha \\\n  //host.example/mcp \\\n  --header "Authorization: Bearer YOUR_TOKEN"',
    })
  })

  it('chatgpt: the url step sits between the text steps', () => {
    expect(tools.chatgpt.steps.map(step => step.kind)).toEqual(['token', 'text', 'url', 'text', 'text'])
  })

  it('codex: toml snippet', () => {
    expect(tools.codex.steps[1]).toMatchObject({
      code: '# ~/.codex/config.toml\n[mcp_servers.panelalpha]\nurl = "//host.example/mcp"\nhttp_headers = { "Authorization" = "Bearer YOUR_TOKEN" }',
    })
  })

  it('claude is special: no steps and no docs', () => {
    expect(tools.claude.special).toBe('claude')
    expect(tools.claude.steps).toEqual([])
    expect(tools.claude.docs).toBeUndefined()
  })

  it('cursor: mcpServers snippet with url', () => {
    expect(tools.cursor.steps[2]).toMatchObject({
      code: '{\n  "mcpServers": {\n    "panelalpha": {\n      "url": "//host.example/mcp",\n      "headers": {\n        "Authorization": "Bearer YOUR_TOKEN"\n      }\n    }\n  }\n}',
    })
  })

  it('windsurf uses serverUrl instead of url', () => {
    const step = tools.windsurf.steps[2]
    expect(step).toMatchObject({ kind: 'code' })
    expect((step as { code: string }).code).toContain('"serverUrl": "//host.example/mcp"')
    expect((step as { code: string }).code).not.toContain('"url"')
  })

  it('vscode: servers snippet with type http', () => {
    expect(tools.vscode.steps[2]).toMatchObject({
      code: '{\n  "servers": {\n    "panelalpha": {\n      "type": "http",\n      "url": "//host.example/mcp",\n      "headers": {\n        "Authorization": "Bearer YOUR_TOKEN"\n      }\n    }\n  }\n}',
    })
  })

  it('other: text, url, then the bare header', () => {
    expect(tools.other.steps.map(step => step.kind)).toEqual(['token', 'text', 'url', 'code'])
    expect(tools.other.steps[3]).toMatchObject({ code: 'Authorization: Bearer YOUR_TOKEN' })
    expect(tools.other.docs).toBe('https://modelcontextprotocol.io/specification/draft/basic/authorization')
  })

  it('the URL is injected into every snippet that carries one', () => {
    for (const key of ['claudecode', 'codex', 'cursor', 'windsurf', 'vscode'] as const) {
      const code = tools[key].steps.find(step => step.kind === 'code') as { code: string }
      expect(code.code).toContain(URL)
    }
  })
})
