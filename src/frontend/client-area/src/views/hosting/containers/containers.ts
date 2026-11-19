import type { Container, ProxyRule } from './containers.api'
import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
import { escapeHtml } from '@/shared/format/escape-html'

// Pure logic of the Containers screen, ported from the legacy view: `stateColor`/`canStart`/`canStop`,
// the Ports parsers, `getPortEntries`, the URL builders and the table headers.
// The hard-coded English copy of the legacy view lives in `CONTAINERS_COPY` (no new i18n keys).

/** Host shown in a URL when neither the rule nor the service has a name or an address (legacy `[server-ip]`). */
const SERVER_IP_FALLBACK = '[server-ip]'

/** Dash of the legacy copy: the empty Ports cell and the URL preview of a port of 0. */
const DASH = '—'

/** Well-known non-HTTP service ports: public-bound, but an HTTP proxy will not work. */
export const NON_WEB_PORTS: ReadonlySet<number> = new Set([
  3306, 3307, // MySQL / MariaDB
  5432, 6432, // PostgreSQL, PgBouncer
  6379, 6380, 26_379, // Redis, Redis TLS, Redis Sentinel
  27_017, 27_018, 27_019, // MongoDB
  1433, 1434, // MSSQL
  9042, // Cassandra
  11_211, // Memcached
  5672, // AMQP (RabbitMQ)
  1883, 8883, // MQTT
  25, 465, 587, // SMTP
  110, 995, // POP3
  143, 993, // IMAP
  22, // SSH
])

/** Chip colour of a container state. */
export function stateColor (state: string): StatusLabelStatus {
  if (!state) {
    return 'gray'
  }
  const value = state.toLowerCase()
  if (value === 'running') {
    return 'success'
  }
  if (value === 'restarting') {
    return 'warning'
  }
  if (value === 'exited' || value === 'dead') {
    return 'error'
  }
  return 'gray'
}

/** An empty state can be started; running and restarting cannot. */
export function canStart (state: string): boolean {
  if (!state) {
    return true
  }
  const value = state.toLowerCase()
  return value !== 'running' && value !== 'restarting'
}

/** Only running and restarting containers can be stopped. */
export function canStop (state: string): boolean {
  if (!state) {
    return false
  }
  const value = state.toLowerCase()
  return value === 'running' || value === 'restarting'
}

/** Host ports of the `->` mappings, one per port (used by the URLs dialog). Ranges are not read. */
export function parseHostPorts (ports: string): number[] {
  if (!ports) {
    return []
  }
  const result: number[] = []
  for (const match of ports.matchAll(/(?::::|\*|[\d.]+):(\d+)->/g)) {
    const port = Number.parseInt(match[1])
    if (port && !result.includes(port)) {
      result.push(port)
    }
  }
  return result
}

/** A row of the Ports column before the proxy rules are applied. */
export type PortEntry
  = | { type: 'range', display: string }
    | { type: 'internal', port: number }
    | { type: 'sensitive', port: number }
    | { type: 'external', port: number }

/**
 * Typed entries of the Docker Ports string. Unlike `parseHostPorts` it reads ranges and the
 * internal `PORT/proto` form too. A port seen twice (IPv4 and IPv6 mapping) is listed once.
 */
export function parsePortsForDisplay (ports: string): PortEntry[] {
  if (!ports) {
    return []
  }
  const seen = new Set<string>()
  const results: PortEntry[] = []

  for (const part of ports.split(/,\s*/)) {
    const trimmed = part.trim()
    if (trimmed.includes('->')) {
      const match = trimmed.match(/^([\d.:*]+):(\d+(?:-\d+)?)->/)
      if (!match) {
        continue
      }
      const bindAddress = match[1]
      const portOrRange = match[2]
      if (seen.has(portOrRange)) {
        continue
      }
      seen.add(portOrRange)
      const isPublicBind = ['0.0.0.0', '::', ':::', '*'].includes(bindAddress)
      if (portOrRange.includes('-')) {
        results.push({ type: 'range', display: portOrRange })
      } else if (!isPublicBind) {
        // Loopback or a specific address: nothing outside the server reaches it.
        results.push({ type: 'internal', port: Number.parseInt(portOrRange) })
      } else if (NON_WEB_PORTS.has(Number.parseInt(portOrRange))) {
        results.push({ type: 'sensitive', port: Number.parseInt(portOrRange) })
      } else {
        results.push({ type: 'external', port: Number.parseInt(portOrRange) })
      }
      continue
    }

    // `PORT/proto` without a host mapping: an internal port.
    const match = trimmed.match(/^(\d+(?:-\d+)?)\/(?:tcp|udp)$/)
    if (!match) {
      continue
    }
    const portOrRange = match[1]
    const key = `i:${portOrRange}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    results.push(portOrRange.includes('-') ? { type: 'range', display: portOrRange } : { type: 'internal', port: Number.parseInt(portOrRange) })
  }
  return results
}

/** A row of the Ports column: a plain entry, or an entry with the proxy rule that serves it. */
export type PortRow
  = | PortEntry
    | { type: 'sensitive-proxied', port: number, rule: ProxyRule }
    | { type: 'proxied', port: number, rule: ProxyRule }
    | { type: 'stream-proxied', port: number, rule: ProxyRule, address: string }

/**
 * Rows of the Ports column. A public port with HTTP rules becomes one row per rule
 * (`proxied`, or `sensitive-proxied` for a non-web port); with only stream rules it becomes `stream-proxied`. Rules are
 * applied only to `external` and `sensitive` ports.
 */
export function getPortEntries (container: Pick<Container, 'Ports'>, rules: readonly ProxyRule[], serverIp: string | null): PortRow[] {
  const entries: PortRow[] = []
  for (const entry of parsePortsForDisplay(container.Ports)) {
    if (entry.type !== 'external' && entry.type !== 'sensitive') {
      entries.push(entry)
      continue
    }
    const httpRules = rules.filter(rule => rule.transport === 'http' && rule.upstream_port === entry.port)
    const streamRules = rules.filter(rule => rule.transport !== 'http' && rule.upstream_port === entry.port)
    if (httpRules.length > 0) {
      for (const rule of httpRules) {
        entries.push(entry.type === 'sensitive'
          ? { type: 'sensitive-proxied', port: entry.port, rule }
          : { type: 'proxied', port: entry.port, rule })
      }
    } else if (streamRules.length > 0) {
      for (const rule of streamRules) {
        entries.push({ type: 'stream-proxied', port: entry.port, rule, address: `${serverIp || SERVER_IP_FALLBACK}:${rule.listen_port}` })
      }
    } else {
      entries.push(entry)
    }
  }
  return entries
}

/** Public URL of a proxy rule: https on port 443 or for an https upstream, the port left out on 80 and 443. */
export function buildUrlFromRule (rule: Pick<ProxyRule, 'listen_port' | 'upstream_protocol' | 'server_name'>, serverIp: string | null): string {
  const isHttps = rule.listen_port === 443 || rule.upstream_protocol === 'https'
  const scheme = isHttps ? 'https' : 'http'
  const host = rule.server_name || serverIp || SERVER_IP_FALLBACK
  const defaultPort = isHttps ? 443 : 80
  const portSuffix = rule.listen_port === defaultPort ? '' : `:${rule.listen_port}`
  return `${scheme}://${host}${portSuffix}/`
}

/**
 * Preview of the URL the dialog is about to add. Unlike `buildUrlFromRule`, https only on 443.
 * A port of 0 (or not a number) or no domain shows the dash: a public URL needs a domain.
 */
export function previewPublicUrl (domain: string | null, listenPort: number): string {
  if (!listenPort || !domain) {
    return DASH
  }
  const isHttps = listenPort === 443
  const scheme = isHttps ? 'https' : 'http'
  const host = domain
  const defaultPort = isHttps ? 443 : 80
  const portSuffix = listenPort === defaultPort ? '' : `:${listenPort}`
  return `${scheme}://${host}${portSuffix}/`
}

/** Key of a service in the per-service loading map. */
export function serviceKey (accountId: number, service: string): string {
  return `${accountId}:${service}`
}

/** Hard-coded English copy of the legacy view (kept as it is, no i18n keys). */
export const CONTAINERS_COPY = {
  portsColumn: 'Ports',
  /** Title of the column that shows how long a container runs (the Docker `Status` read by `containerUptime`). */
  uptimeColumn: 'Uptime',
  /** Row action that opens the URLs dialog of the container (add and remove the proxy rules of its ports). */
  publicUrls: 'Public URLs',
  /** Column placeholder for a container without ports. */
  noPorts: DASH,
  arrow: '→',
  portSeparator: ':',
  noPublicUrls: 'No public URLs configured for this port',
  addPublicUrl: 'Add public URL',
  addUrl: 'Add URL',
  domainLabel: 'Domain',
  /** Accessible name of the listen port field of the URLs dialog (legacy has no label; no pixels change). */
  portLabel: 'Port',
  noDomain: 'Add a domain to this project before creating a public URL.',
  selectDomain: 'Select a domain for the public URL',
  publicUrlAdded: 'Public URL added',
  publicUrlRemoved: 'Public URL removed',
  /** Subtitle of a rule in the URLs dialog: `Listen port 8080`. */
  listenPortLabel: (port: number): string => `Listen port ${port}`,
  /** Suffix of a rule's subtitle when it has a server name: `· example.com`. */
  serverNameLabel: (name: string): string => `· ${name}`,
  /** Title of the URLs dialog: `Port 8080 (web)`. */
  portDialogTitle: (port: number | null, service: string | null): string => service ? `Port ${port} (${service})` : `Port ${port}`,
  /** Tooltips of the port chips, one per row type. */
  tooltip: {
    range: (display: string): string => `Port range ${display}. Port ranges cannot be individually proxied.`,
    internal: (): string => 'Bound to 127.0.0.1, only accessible inside the server. Cannot be exposed publicly.',
    sensitive: (port: number): string => `Port ${port} looks like a non-HTTP service (e.g. database). HTTP proxying is unlikely to work. Manage this via Admin Area if needed.`,
    sensitiveProxied: (port: number): string => `Port ${port} looks like a non-HTTP service. This rule was configured manually.`,
    streamProxied: (port: number): string => `Port ${port} is proxied as a TCP/UDP stream. Configured via the Admin Area.`,
    proxied: (port: number): string => `Port ${port} is publicly accessible. Click to manage this URL.`,
    external: (port: number): string => `Port ${port} is not yet publicly accessible. Click to add a public URL.`,
  },
}

/** Tooltip text of a Ports row. */
export function portTooltip (row: PortRow): string {
  switch (row.type) {
    case 'range': { return CONTAINERS_COPY.tooltip.range(row.display)
    }
    case 'internal': { return CONTAINERS_COPY.tooltip.internal()
    }
    case 'sensitive': { return CONTAINERS_COPY.tooltip.sensitive(row.port)
    }
    case 'sensitive-proxied': { return CONTAINERS_COPY.tooltip.sensitiveProxied(row.port)
    }
    case 'stream-proxied': { return CONTAINERS_COPY.tooltip.streamProxied(row.port)
    }
    case 'proxied': { return CONTAINERS_COPY.tooltip.proxied(row.port)
    }
    case 'external': { return CONTAINERS_COPY.tooltip.external(row.port)
    }
  }
}

/** One chip of the Ports column: a port (or a range) with every public URL and stream address that points to it. */
export interface PortGroup {
  key: string
  /** The port number, or the range as Docker prints it. */
  label: string
  /** The port of the URLs dialog; `null` for a range. */
  port: number | null
  /** Green with a public URL, amber for a non-web port, gray otherwise. */
  status: StatusLabelStatus
  /** Public URLs of the HTTP rules of the port. */
  links: string[]
  /** `host:port` addresses of the stream rules of the port. */
  streams: string[]
  /** What the port is (the tooltip text of its first row). */
  hint: string
  /** A public HTTP port: with the privilege, a click opens its URLs dialog. */
  manageable: boolean
}

/**
 * Chips of the Ports column: the rows of `getPortEntries` grouped by port, in their order, so a port with several URLs is one chip and its
 * URLs are listed in the menu of the chip (not one row per URL).
 */
export function groupPortRows (rows: readonly PortRow[], serverIp: string | null): PortGroup[] {
  const groups = new Map<string, PortGroup>()
  for (const row of rows) {
    const label = row.type === 'range' ? row.display : String(row.port)
    let group = groups.get(label)
    if (!group) {
      group = {
        key: label,
        label,
        port: row.type === 'range' ? null : row.port,
        status: 'gray',
        links: [],
        streams: [],
        hint: portTooltip(row),
        manageable: row.type === 'proxied' || row.type === 'external',
      }
      groups.set(label, group)
    }
    if (row.type === 'sensitive' || row.type === 'sensitive-proxied') {
      group.status = 'warning'
    }
    if (row.type === 'proxied' || row.type === 'sensitive-proxied') {
      group.links.push(buildUrlFromRule(row.rule, serverIp))
      if (row.type === 'proxied') {
        group.status = 'success'
      }
    }
    if (row.type === 'stream-proxied') {
      group.streams.push(row.address)
    }
  }
  return [...groups.values()]
}

/**
 * How long a container runs, from the Docker `Status` (`Up 59 seconds`, `Up 2 hours (healthy)`, `Up About an hour`): the text after `Up`
 * without the health note. A container that does not run (`Exited (0) 2 hours ago`, `Created`, `Restarting (1) …`) has no uptime: the dash.
 */
export function containerUptime (status: string): string {
  const text = (status ?? '').trim()
  if (!/^up\s/i.test(text)) {
    return DASH
  }
  const uptime = text.slice(3).trim().replace(/\s*\([^)]*\)$/, '')
  return uptime || DASH
}

/** Stable key of a Ports row inside its `v-for`. */
export function portRowKey (row: PortRow): string {
  switch (row.type) {
    case 'range': { return `r-${row.display}`
    }
    case 'internal': { return `i-${row.port}`
    }
    case 'sensitive': { return `s-${row.port}`
    }
    case 'external': { return `p-${row.port}`
    }
    case 'sensitive-proxied': { return `sp-${row.rule.id}`
    }
    case 'stream-proxied': { return `st-${row.rule.id}`
    }
    case 'proxied': { return `rule-${row.rule.id}`
    }
  }
}

export interface ContainerHeader {
  title: string
  key: string
  sortable: boolean
  align?: 'end'
}

/** Headers of the container table: Service and Image sort, the rest do not. */
export function containerHeaders (t: (key: string) => string): ContainerHeader[] {
  return [
    { title: t('heading.hosting.containers.col.service'), key: 'Service', sortable: true },
    { title: t('heading.hosting.containers.col.image'), key: 'Image', sortable: true },
    { title: t('heading.hosting.containers.col.state'), key: 'State', sortable: false },
    { title: CONTAINERS_COPY.uptimeColumn, key: 'Status', sortable: false },
    { title: CONTAINERS_COPY.portsColumn, key: 'ports', sortable: false },
    { title: t('heading.hosting.containers.col.actions'), key: 'actions', sortable: false, align: 'end' },
  ]
}

/** One item of the project Actions menu; `color` is the hover colour of the item. */
export interface ProjectAction {
  id: 'up' | 'restart' | 'stop' | 'pull'
  title: string
  icon: string
  iconSize: string
  color?: string
}

/** Items of the project Actions menu in the legacy order, without the legacy `down`. */
export function projectActions (t: (key: string) => string): ProjectAction[] {
  return [
    { id: 'up', title: t('heading.hosting.containers.action.up'), icon: '$play', iconSize: '20' },
    { id: 'restart', title: t('heading.hosting.containers.action.restart'), icon: '$restore', iconSize: '20' },
    { id: 'stop', title: t('heading.hosting.containers.action.stop'), icon: '$pauseLine', iconSize: '20' },
    { id: 'pull', title: t('heading.hosting.containers.action.pull'), icon: '$downloadLine', iconSize: '20' },
  ]
}

/**
 * An action that stops or recreates containers, or removes a public URL: it runs only after the danger dialog.
 * `url` is the address the rule serves, `service` the container its port belongs to.
 */
export type ConfirmedAction
  = | { scope: 'project', action: 'restart' | 'stop' | 'pull' }
    | { scope: 'service', action: 'restart' | 'stop', service: string }
    | { scope: 'url', rule: ProxyRule, url: string, service: string }

const CONFIRMED_PROJECT_ACTIONS = ['restart', 'stop', 'pull'] as const
const CONFIRMED_SERVICE_ACTIONS = ['restart', 'stop'] as const

function isOneOf<T extends string> (list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value)
}

/** The confirmed action of a project action, or `null` for one that runs at once (`up`). */
export function confirmedProjectAction (action: string): ConfirmedAction | null {
  return isOneOf(CONFIRMED_PROJECT_ACTIONS, action) ? { scope: 'project', action } : null
}

/** The confirmed action of a container action, or `null` for one that runs at once (`start`). */
export function confirmedServiceAction (service: string, action: string): ConfirmedAction | null {
  return isOneOf(CONFIRMED_SERVICE_ACTIONS, action) ? { scope: 'service', action, service } : null
}

export interface ConfirmCopy {
  /** HTML (`BasicModal` renders it with `v-safe-html`): the service name in it is escaped. */
  title: string
  message: string
  button: string
}

/** Title, message and button of the danger dialog. */
export function confirmCopy (target: ConfirmedAction | null, t: (key: string, options?: Record<string, unknown>) => string): ConfirmCopy {
  if (!target) {
    return { title: '', message: '', button: '' }
  }
  if (target.scope === 'url') {
    return {
      title: t('heading.hosting.containers.confirm.removeUrl.title'),
      message: t('heading.hosting.containers.confirm.removeUrl.message', {
        url: `<b>${escapeHtml(target.url)}</b>`,
        port: target.rule.upstream_port,
        service: `<b>${escapeHtml(target.service)}</b>`,
      }),
      button: t('button.remove'),
    }
  }
  if (target.scope === 'project') {
    return {
      title: t(`heading.hosting.containers.confirm.${target.action}.title`),
      message: t(`heading.hosting.containers.confirm.${target.action}.message`),
      button: t(`heading.hosting.containers.action.${target.action}`),
    }
  }
  const key = target.action === 'stop' ? 'serviceStop' : 'serviceRestart'
  const service = escapeHtml(target.service)
  return {
    title: t(`heading.hosting.containers.confirm.${key}.title`, { service }),
    message: t(`heading.hosting.containers.confirm.${key}.message`, { service: `<b>${service}</b>` }),
    button: t(`heading.hosting.containers.service.${target.action}`),
  }
}

/**
 * No group means not acting; without an action, any action of the group in progress counts.
 * `loading` is keyed by account id, as in `ContainersView`.
 */
export function isGroupActing (loading: Record<number, string | undefined>, accountId: number | null, action?: string): boolean {
  if (accountId === null) {
    return false
  }
  const current = loading[accountId]
  return action === undefined ? !!current : current === action
}
