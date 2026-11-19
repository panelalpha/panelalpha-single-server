import type { CollectedIssue, InstanceLike, ProjectDetailsLike } from './issue-registry'
import { versionGreater } from '@/shared/version/compare-versions'

export {
  CATEGORY_ORDER,
  hydrateIssue,
  ISSUE_REGISTRY,
} from './issue-registry'

function instanceType (instance: InstanceLike): string {
  return instance.type || 'wordpress'
}

function isInstalledAndOutdated (current: string | null | undefined, available: string | null | undefined): boolean {
  if (current == null) {
    return false
  }
  // Numeric compare, so `6.5` and `6.5.0` are the same version. No available version means there is nothing to update to.
  return versionGreater(available, current)
}

export function collectInstanceIssues (instance: InstanceLike): CollectedIssue[] {
  const issues: CollectedIssue[] = []
  const type = instanceType(instance)
  const status = instance.status || {}

  issues.push(...deployIssuesFromInstance(instance.details))

  if (type === 'wordpress' && isInstalledAndOutdated(status.wordpress, status.wordpress_available)) {
    issues.push({
      code: 'wordpress.core_outdated',
      category: 'wordpress',
      params: { current: status.wordpress, available: status.wordpress_available },
    })
  }

  if (isInstalledAndOutdated(status.woocommerce, status.woocommerce_available)) {
    issues.push({
      code: 'woocommerce.outdated',
      category: 'woocommerce',
      params: { current: status.woocommerce, available: status.woocommerce_available },
    })
  }

  const autoOff = typeof instance.hasAutomaticBackup === 'function' ? !instance.hasAutomaticBackup() : false
  const noRecent
    = typeof instance.hasRecentBackup === 'function' && typeof instance.shouldHaveRecentBackup === 'function'
      ? !instance.hasRecentBackup() && instance.shouldHaveRecentBackup()
      : false

  if (autoOff || noRecent) {
    issues.push({ code: 'backup.attention', category: 'backup', params: { autoOff, noRecent } })
  }

  return issues
}

/**
 * The deploy warning the Engine recorded on the project itself (`details.deployment_status === 'partial'`
 * with `details.deployment_warnings`): what the project's own row and card show without a request per
 * project. The texts are the Engine's; the title and the fallback description are the ones the `/source`
 * warning already uses (`deploy.last_deploy_warnings`).
 */
export function deployIssuesFromInstance (details: unknown): CollectedIssue[] {
  const record = (details !== null && typeof details === 'object' ? details : null) as ProjectDetailsLike | null
  if (record?.deployment_status !== 'partial') {
    return []
  }

  const lines: string[] = []
  for (const warning of Array.isArray(record.deployment_warnings) ? record.deployment_warnings : []) {
    const message = typeof warning === 'string' ? warning : warning?.message
    if (typeof message === 'string' && message.trim() !== '') {
      lines.push(message.trim())
    }
  }

  return [{
    code: 'deploy.last_deploy_warnings',
    category: 'deploy',
    params: {},
    title: null,
    detail: lines.length > 0 ? lines.join('\n') : null,
  }]
}

/** One issue per code: two sources may report the same state (`/source` and the project payload). */
export function uniqueIssues (issues: CollectedIssue[]): CollectedIssue[] {
  const seen: string[] = []
  return issues.filter(issue => {
    if (seen.includes(issue.code)) {
      return false
    }
    seen.push(issue.code)
    return true
  })
}

/** The part of `ProjectSource` (`/instances/{id}/source`) the deploy issues read; structural, so this module does not import the API. */
export interface SourceWarningsLike {
  available: boolean
  warnings?: { code: string, title?: string | null, details?: string[] | null }[] | null
}

/**
 * The deploy issues the Engine reports for the project source (`/source` warnings): nothing when the source is
 * unavailable. Each warning keeps its code, its title and details (`pre-line`) in the Engine's own words, and
 * `deploy.not_deployable` comes first.
 */
export function deployIssuesFromSource (source: SourceWarningsLike | null | undefined): CollectedIssue[] {
  if (!source || !source.available) {
    return []
  }
  const issues: CollectedIssue[] = (source.warnings || []).map(warning => {
    const details = (warning.details || []).filter(Boolean)
    return {
      code: warning.code,
      category: 'deploy',
      params: {},
      title: warning.title || null,
      detail: details.length > 0 ? details.join('\n') : null,
    }
  })
  const notDeployable = issues.filter(issue => issue.code === 'deploy.not_deployable')
  return [...notDeployable, ...issues.filter(issue => issue.code !== 'deploy.not_deployable')]
}

export interface AppHealth {
  available: boolean
  healthy?: boolean
  serving?: string
  ports?: { port: number, status: string, http_code?: number | null, detail?: string | null }[]
  checks?: { id: string, severity?: string, title?: string | null, detail?: string | null, fix?: string | null }[]
}

/** The Engine checks the two named deploy issues already stand for. */
const MISSING_INDEX_CHECKS = new Set(['entry-served'])
const NOT_ANSWERING_CHECKS = new Set(['no-service-unreachable'])

/**
 * The deploy issues of a container project, from the Engine's probe of its running application
 * (`GET /instances/{id}/app-health`): nothing when the project is not probed or the probe found nothing wrong.
 *
 * - `serving: missing_entry`: the domain root has no page to serve (a missing index file).
 * - `healthy: false` with nothing answering on any published port, and not because the container keeps restarting
 *   or is stopped: the application does not listen on the port the project is routed to (the first one listed).
 * - Every other failing `error`/`warning` check, in the Engine's own words.
 */
export function deployIssuesFromHealth (health: AppHealth | null | undefined): CollectedIssue[] {
  if (!health || !health.available) {
    return []
  }
  const checks = health.checks || []
  const ports = health.ports || []
  const issues: CollectedIssue[] = []
  const covered: string[] = []

  if (health.serving === 'missing_entry') {
    const check = checks.find(c => MISSING_INDEX_CHECKS.has(c.id))
    issues.push({
      code: 'deploy.missing_index',
      category: 'deploy',
      params: {},
      detail: check ? check.title : null,
    })
    covered.push(...MISSING_INDEX_CHECKS)
  }

  const nothingAnswers = ports.length > 0 && ports.every(port => port.status !== 'ok')
  if (
    health.healthy === false
    && nothingAnswers
    && !['restarting', 'stopped'].includes(health.serving ?? '')
  ) {
    issues.push({
      code: 'deploy.port_mismatch',
      category: 'deploy',
      params: { port: ports[0]!.port },
    })
    covered.push(...NOT_ANSWERING_CHECKS)
  }

  for (const check of checks.filter(c => !covered.includes(c.id))) {
    issues.push({
      code: `deploy.check.${check.id}`,
      category: 'deploy',
      params: {},
      title: check.title || check.id,
      detail: check.detail || check.fix || null,
    })
  }

  return issues
}
