import { api } from '@/shared/api/client'

// A plain get/post/put/delete wrapper, XSRF is global (no `fetchCsrfCookie()`).

/** One row of `GET /mcp-tokens` (`McpTokenController`): dates are ISO strings, `revoked_at` is `null` while the token is active. */
export interface McpToken {
  id: number
  name: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

/** `POST /mcp-tokens` answers with the token plus its one-time `plain_text_token`. */
export interface CreatedMcpToken extends McpToken {
  plain_text_token: string
}

export interface McpActivityLog {
  id: number
  created_at: string
  token_name: string
  tool_name: string
  status: string
}

/** The raw Laravel paginator of `GET /mcp-activity-logs`; the view reads `data`, `total` and `last_page`. */
export interface McpActivityLogPage {
  data: McpActivityLog[]
  total: number
  last_page: number
  current_page: number
  per_page: number
}

export interface McpActivityLogParams {
  page: number
  token_name?: string
}

export async function listTokens (): Promise<McpToken[]> {
  const { data } = await api.get<{ data: McpToken[] }>('/mcp-tokens')
  return data.data ?? []
}

export async function createToken (name: string): Promise<CreatedMcpToken> {
  const { data } = await api.post<{ data: CreatedMcpToken }>('/mcp-tokens', { name: name.trim() })
  return data.data
}

export async function revokeToken (id: number): Promise<void> {
  await api.put(`/mcp-tokens/${id}/revoke`)
}

export async function deleteToken (id: number): Promise<void> {
  await api.delete(`/mcp-tokens/${id}`)
}

/** `token_name` is left out when empty (legacy sends it only for a selected filter). */
export async function listActivityLogs (params: McpActivityLogParams): Promise<McpActivityLogPage> {
  const query: McpActivityLogParams = { page: params.page }
  if (params.token_name) {
    query.token_name = params.token_name
  }
  const { data } = await api.get<McpActivityLogPage>('/mcp-activity-logs', { params: query })
  return data
}
