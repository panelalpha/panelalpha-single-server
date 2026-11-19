import type { ContainerGroup, ProxyRule } from './containers.api'

// Client-side scoping of the service-level containers response to a single project.

/** Keeps only the groups that belong to the given hosting (project) id; ids are compared as strings. */
export function scopeGroups (groups: ContainerGroup[] | null | undefined, hostingId: unknown): ContainerGroup[] {
  return (groups || []).filter(group => String(group?.account?.id) === String(hostingId))
}

/** Keeps only the proxy rules owned by the given account username; rules carry no project id, so two projects can share an `upstream_port`. */
export function scopeRules (rules: ProxyRule[] | null | undefined, username: string | undefined): ProxyRule[] {
  return (rules || []).filter(rule => rule.username === username)
}
