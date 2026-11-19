import { api } from '@/shared/api/client'

/**
 * `Api.defaults.baseURL` without trailing slashes and without the final `/api`, plus `/mcp`.
 * Legacy sets that base to `VUE_APP_API_URL || //<hostname>[:port]/api`. Next's base is `VITE_API_URL || '/api'`,
 * so a relative base (`/api`, not `//host/api`) is given the same `//<hostname>[:port]` origin legacy has by default.
 *
 * Deviation from legacy: a scheme-less base gets the page protocol. The URL is
 * pasted into MCP clients, which need `https://host/mcp`, not `//host/mcp`. A base that already has a scheme is untouched.
 */
export function mcpUrl (baseURL: string | undefined, location: Pick<Location, 'hostname' | 'port' | 'protocol'>): string {
  let base = baseURL || ''
  if (base.startsWith('/') && !base.startsWith('//')) {
    base = `//${location.hostname}${location.port ? `:${location.port}` : ''}${base}`
  }
  if (base.startsWith('//')) {
    base = `${location.protocol}${base}`
  }
  return `${base.replace(/\/+$/, '').replace(/\/api$/, '')}/mcp`
}

/** The MCP server address shown to the user: `mcpUrl` on the HTTP client's base and the current page location. */
export function mcpServerUrl (): string {
  return mcpUrl(api.defaults.baseURL, window.location)
}
