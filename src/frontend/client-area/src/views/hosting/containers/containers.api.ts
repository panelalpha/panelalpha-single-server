import { api } from '@/shared/api/client'

// Calls of the Containers screen, same contract as legacy. App-lite only.

/** The server account a group belongs to. */
export interface ContainerAccount {
  id: number
  username: string
  domain: string | null
}

/** One container as `docker ps` reports it. The keys are the Docker field names, capitalised as the backend sends them. */
export interface Container {
  Service: string
  Image: string
  State: string
  Status: string
  /** Docker port string, e.g. `0.0.0.0:8080->80/tcp, :::8080->80/tcp`. */
  Ports: string
}

/** One item of `GET /services/{id}/containers`: the containers of one server account (empty when the engine failed for it). */
export interface ContainerGroup {
  account: ContainerAccount
  containers: Container[]
}

/** One item of `GET /services/{id}/proxy-rules`. */
export interface ProxyRule {
  id: number
  transport: string
  upstream_port: number
  upstream_protocol: string
  listen_port: number
  server_name: string | null
  upstream_host: string
  enabled?: boolean
  /** Owner of the rule (app-lite). Read only by the project scope; hosting ignores it. */
  username?: string
}

/** Body of `POST /services/{id}/proxy-rules`. */
export interface ProxyRulePayload {
  transport: string
  listen_ip: string | null
  listen_port: number
  server_name: string | null
  upstream_host: string
  upstream_port: number
  upstream_protocol: string
  enabled: boolean
}

/** Legacy `data.data ?? data`; a body that is not an array reads as empty. */
function asList<T> (body: unknown): T[] {
  const list = (body as { data?: unknown } | null)?.data ?? body
  return Array.isArray(list) ? list as T[] : []
}

/** `GET /services/{id}/containers`. */
export async function listContainerGroups (serviceId: number): Promise<ContainerGroup[]> {
  const { data } = await api.get<unknown>(`/services/${serviceId}/containers`)
  return asList<ContainerGroup>(data)
}

/**
 * `GET /services/{id}/proxy-rules`. Asked by Containers only with the `hosting.manage_proxy_routing` privilege; the second consumer
 * is Domains (the "Points to" column), which asks without that privilege, only for a panelalpha service or single-server (app-lite).
 */
export async function listProxyRules (serviceId: number): Promise<ProxyRule[]> {
  const { data } = await api.get<unknown>(`/services/${serviceId}/proxy-rules`)
  return asList<ProxyRule>(data)
}

/** `POST /services/{id}/containers/{accountId}/action`: the whole project (`up`, `restart`, `stop`, `pull`, `down`). */
export async function projectAction (serviceId: number, accountId: number, action: string): Promise<void> {
  await api.post(`/services/${serviceId}/containers/${accountId}/action`, { action })
}

/** `POST /services/{id}/containers/{accountId}/{service}/action`: one container (`start`, `stop`, `restart`). The compose service name is encoded. */
export async function serviceAction (serviceId: number, accountId: number, service: string, action: string): Promise<void> {
  await api.post(`/services/${serviceId}/containers/${accountId}/${encodeURIComponent(service)}/action`, { action })
}

/** `GET /services/{id}/containers/{accountId}/{service}/logs?lines=200`. Legacy `data.data ?? data ?? ''`. */
export async function containerLogs (serviceId: number, accountId: number, service: string): Promise<string> {
  const { data } = await api.get<{ data?: string | null } | string | null>(`/services/${serviceId}/containers/${accountId}/${encodeURIComponent(service)}/logs?lines=200`)
  if (typeof data === 'string') {
    return data
  }
  return data?.data ?? ''
}

/** `POST /services/{id}/proxy-rules`. */
export async function createProxyRule (serviceId: number, body: ProxyRulePayload): Promise<void> {
  await api.post(`/services/${serviceId}/proxy-rules`, body)
}

/** `DELETE /services/{id}/proxy-rules/{ruleId}`. */
export async function deleteProxyRule (serviceId: number, ruleId: number): Promise<void> {
  await api.delete(`/services/${serviceId}/proxy-rules/${ruleId}`)
}

/** One item of `GET /server-accounts/{id}/domains`. Legacy keeps only the items with a `domain`. */
export interface AccountDomain {
  domain: string | null
}

/** `GET /server-accounts/{id}/domains`. */
export async function listDomains (accountId: number): Promise<AccountDomain[]> {
  const { data } = await api.get<unknown>(`/server-accounts/${accountId}/domains`)
  return asList<AccountDomain>(data)
}
