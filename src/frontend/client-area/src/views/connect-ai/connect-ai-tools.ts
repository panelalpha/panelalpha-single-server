/** Translate function as `useTranslation().t` hands it out; only plain keys are used here. */
export type Translate = (key: string) => string

export const TOOL_KEYS = ['claudecode', 'chatgpt', 'codex', 'claude', 'cursor', 'windsurf', 'vscode', 'other'] as const
export type ToolKey = typeof TOOL_KEYS[number]

/** The three views under "Manage" in the sidebar. */
export const MANAGE_KEYS = ['tokens', 'capabilities', 'activity-log'] as const
export type ManageKey = typeof MANAGE_KEYS[number]

export type ViewKey = ToolKey | ManageKey

export function isToolKey (key: string): key is ToolKey {
  return (TOOL_KEYS as readonly string[]).includes(key)
}

export type ToolStep
  = | { kind: 'token', title: string }
    | { kind: 'url', title: string }
    | { kind: 'code', title: string, code: string }
    | { kind: 'text', title: string, body: string }

export interface ToolConfig {
  name: string
  tag: string
  docs?: string
  special?: 'claude'
  steps: ToolStep[]
}

/** Sidebar label key of each tool. */
const TOOL_NAME_KEYS: Record<ToolKey, string> = {
  claudecode: 'heading.connectAi.toolNames.claudeCode',
  chatgpt: 'heading.connectAi.toolNames.chatgpt',
  codex: 'heading.connectAi.toolNames.codex',
  claude: 'heading.connectAi.toolNames.claude',
  cursor: 'heading.connectAi.toolNames.cursor',
  windsurf: 'heading.connectAi.toolNames.windsurf',
  vscode: 'heading.connectAi.toolNames.vscode',
  other: 'heading.connectAi.toolNames.other',
}

const MANAGE_LABEL_KEYS: Record<ManageKey, string> = {
  'tokens': 'heading.connectAi.tool.mcpUrlTokens',
  'capabilities': 'heading.connectAi.capabilities',
  'activity-log': 'heading.connectAi.activityLog',
}

export interface NavItem {
  key: ViewKey
  label: string
}

/** The eight tool entries of the sidebar list ("Your tool"). */
export function toolNavItems (t: Translate): Array<NavItem & { key: ToolKey }> {
  return TOOL_KEYS.map(key => ({ key, label: t(TOOL_NAME_KEYS[key]) }))
}

/** The three "Manage" entries. */
export function manageNavItems (t: Translate): Array<NavItem & { key: ManageKey }> {
  return MANAGE_KEYS.map(key => ({ key, label: t(MANAGE_LABEL_KEYS[key]) }))
}

/** All eleven entries, in the order of the mobile tab strip. */
export function navItems (t: Translate): NavItem[] {
  return [...toolNavItems(t), ...manageNavItems(t)]
}

/**
 * Docs URLs and snippets are hard-coded in legacy on purpose (not translated), and
 * the `icon` field is dropped: nothing renders it. `url` is the MCP URL (`mcp-url.ts`).
 */
export function connectAiTools (t: Translate, url: string): Record<ToolKey, ToolConfig> {
  return {
    claudecode: {
      name: t('heading.connectAi.toolNames.claudeCode'),
      tag: t('heading.connectAi.tags.claudeCode'),
      docs: 'https://code.claude.com/docs/en/mcp',
      steps: [
        { kind: 'token', title: t('heading.connectAi.tool.generateToken') },
        {
          kind: 'code',
          title: t('heading.connectAi.steps.claudeCode.run'),
          code: `claude mcp add --transport http panelalpha \\\n  ${url} \\\n  --header "Authorization: Bearer YOUR_TOKEN"`,
        },
        { kind: 'text', title: t('heading.connectAi.instructions.verify'), body: t('heading.connectAi.instructions.verifyRestart') },
      ],
    },
    chatgpt: {
      name: t('heading.connectAi.toolNames.chatgpt'),
      tag: t('heading.connectAi.tags.chatgpt'),
      docs: 'https://developers.openai.com/apps-sdk/deploy/connect-chatgpt',
      steps: [
        { kind: 'token', title: t('heading.connectAi.tool.generateToken') },
        { kind: 'text', title: t('heading.connectAi.steps.chatgpt.createConnector'), body: t('heading.connectAi.instructions.chatgpt.createConnector') },
        { kind: 'url', title: t('heading.connectAi.instructions.chatgpt.pasteUrl') },
        { kind: 'text', title: t('heading.connectAi.steps.chatgpt.setAuthTitle'), body: t('heading.connectAi.instructions.chatgpt.setAuth') },
        { kind: 'text', title: t('heading.connectAi.steps.chatgpt.createConnector2Title'), body: t('heading.connectAi.instructions.chatgpt.createConnector2') },
      ],
    },
    codex: {
      name: t('heading.connectAi.toolNames.codex'),
      tag: t('heading.connectAi.tags.codex'),
      docs: 'https://developers.openai.com/codex/mcp',
      steps: [
        { kind: 'token', title: t('heading.connectAi.tool.generateToken') },
        {
          kind: 'code',
          title: t('heading.connectAi.instructions.codex.step1'),
          code: `# ~/.codex/config.toml\n[mcp_servers.panelalpha]\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer YOUR_TOKEN" }`,
        },
        { kind: 'text', title: t('heading.connectAi.instructions.verify'), body: t('heading.connectAi.instructions.codex.verify') },
      ],
    },
    claude: {
      name: t('heading.connectAi.toolNames.claude'),
      tag: t('heading.connectAi.tags.claude'),
      special: 'claude',
      steps: [],
    },
    cursor: {
      name: t('heading.connectAi.toolNames.cursor'),
      tag: t('heading.connectAi.tags.cursor'),
      docs: 'https://cursor.com/docs/mcp',
      steps: [
        { kind: 'token', title: t('heading.connectAi.tool.generateToken') },
        { kind: 'text', title: t('heading.connectAi.steps.cursor.openConfig'), body: t('heading.connectAi.steps.cursor.openConfigBody') },
        {
          kind: 'code',
          title: t('heading.connectAi.steps.addPanelAlpha'),
          code: `{\n  "mcpServers": {\n    "panelalpha": {\n      "url": "${url}",\n      "headers": {\n        "Authorization": "Bearer YOUR_TOKEN"\n      }\n    }\n  }\n}`,
        },
        { kind: 'text', title: t('heading.connectAi.steps.saveVerify'), body: t('heading.connectAi.instructions.verifyCursor') },
      ],
    },
    windsurf: {
      name: t('heading.connectAi.toolNames.windsurf'),
      tag: t('heading.connectAi.tags.windsurf'),
      docs: 'https://docs.devin.ai/windsurf/plugins/cascade/mcp',
      steps: [
        { kind: 'token', title: t('heading.connectAi.tool.generateToken') },
        { kind: 'text', title: t('heading.connectAi.steps.windsurf.openRaw'), body: t('heading.connectAi.steps.windsurf.openRawBody') },
        {
          kind: 'code',
          title: t('heading.connectAi.steps.addPanelAlpha'),
          code: `{\n  "mcpServers": {\n    "panelalpha": {\n      "serverUrl": "${url}",\n      "headers": {\n        "Authorization": "Bearer YOUR_TOKEN"\n      }\n    }\n  }\n}`,
        },
        { kind: 'text', title: t('heading.connectAi.steps.saveVerify'), body: t('heading.connectAi.instructions.verifyRestart') },
      ],
    },
    vscode: {
      name: t('heading.connectAi.toolNames.vscode'),
      tag: t('heading.connectAi.tags.vscode'),
      docs: 'https://code.visualstudio.com/docs/agent-customization/mcp-servers',
      steps: [
        { kind: 'token', title: t('heading.connectAi.tool.generateToken') },
        { kind: 'text', title: t('heading.connectAi.steps.vscode.addServer'), body: t('heading.connectAi.steps.vscode.addServerBody') },
        {
          kind: 'code',
          title: t('heading.connectAi.steps.vscode.useConfig'),
          code: `{\n  "servers": {\n    "panelalpha": {\n      "type": "http",\n      "url": "${url}",\n      "headers": {\n        "Authorization": "Bearer YOUR_TOKEN"\n      }\n    }\n  }\n}`,
        },
        { kind: 'text', title: t('heading.connectAi.instructions.verify'), body: t('heading.connectAi.instructions.verifyVscode') },
      ],
    },
    other: {
      name: t('heading.connectAi.toolNames.other'),
      tag: t('heading.connectAi.tags.other'),
      docs: 'https://modelcontextprotocol.io/specification/draft/basic/authorization',
      steps: [
        { kind: 'token', title: t('heading.connectAi.tool.generateToken') },
        { kind: 'text', title: t('heading.connectAi.steps.other.addServer'), body: t('heading.connectAi.instructions.other.addServer') },
        { kind: 'url', title: t('heading.connectAi.instructions.other.pasteUrl') },
        { kind: 'code', title: t('heading.connectAi.steps.other.authHeader'), code: 'Authorization: Bearer YOUR_TOKEN' },
      ],
    },
  }
}
