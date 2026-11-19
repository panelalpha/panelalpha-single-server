import type { McpToken } from '@/entities/mcp/mcp.api'

/** Legacy `ConnectAi.vue` `hasActiveToken`: at least one token that is not revoked (`revoked_at` empty). */
export function hasActiveToken (tokens: readonly McpToken[]): boolean {
  return tokens.some(token => !token.revoked_at)
}
