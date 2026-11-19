import type { McpState } from './wordpress-mcp-state'
import { api } from '@/shared/api/client'

// The page is identical in app and app-lite. The calls live here, not in the view. The `instances` / `projects` segment is rewritten by the shared client, so the path stays as legacy writes it.

/** `data.data` of `GET .../wordpress/mcp`. `health_check` is sent too, but this screen does not read it (legacy does not either). */
export interface WordpressMcpStatus {
  state: McpState
  endpoint: string | null
  config_json: string | null
}

function mcpPath (id: number | string): string {
  return `/instances/${id}/wordpress/mcp`
}

/** `GET .../wordpress/mcp`: returns `data.data`. */
export async function getWordpressMcp (id: number | string): Promise<WordpressMcpStatus> {
  const { data } = await api.get<{ data: WordpressMcpStatus }>(mcpPath(id))
  return data.data
}

/** `POST .../wordpress/mcp` without a body. The response is ignored, the state comes from the websocket or the polling. */
export async function enableWordpressMcp (id: number | string): Promise<void> {
  await api.post(mcpPath(id))
}

/** `DELETE .../wordpress/mcp`. The response is ignored. */
export async function disableWordpressMcp (id: number | string): Promise<void> {
  await api.delete(mcpPath(id))
}
