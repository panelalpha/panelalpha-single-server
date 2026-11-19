// The domain and disk logic of the create-staging dialog as pure functions. The app-lite target adds a custom branch that hides the disk block.
import type { StagingDiskUsage } from './instance-actions.api'
import type psl from 'psl'
import { formatBytes } from '@/shared/format/format-bytes'

const DOMAIN_REGEX = /[\w-]+(?:\.[\w-]+)*\.[a-z]{2,63}(?::\d{1,5})?(?:\/[\w~-]+)*$/i

type ParseDomain = typeof psl.parse

// `psl` (~136 kB, the public suffix list) is only needed when the plan converts nested subdomains, so it loads on demand
// instead of with the projects list and the project page.
let parseDomain: ParseDomain | null = null

/** Whether `stagingDomainParts` needs the public suffix list for this project. */
export function needsDomainParser (instance: StagingInstanceSettings): boolean {
  return Boolean(instance.plan_settings?.convert_nested_subdomains_for_staging)
}

/** Loads `psl` once; call before `stagingDomainParts` when `needsDomainParser` is true. */
export async function loadDomainParser (): Promise<void> {
  if (!parseDomain) {
    parseDomain = (await import('psl')).default.parse
  }
}

export function isValidDomain (value: string): boolean {
  return DOMAIN_REGEX.test(value)
}

export interface StagingInstanceSettings {
  domain?: string | null
  type?: string | null
  plan_settings?: Record<string, unknown> | null
  server_settings?: Record<string, unknown> | null
}

export interface StagingDomainParts {
  allowAnyDomain: boolean
  /** The fixed text part of the field. */
  subdomain: string
  parentDomain: string
  /** `.`, or `-` when nested subdomains are converted. */
  suffix: string
  /** The initial value of the field. */
  domain: string
  /** No field: the PanelAlpha proxy assigns the copy a name the Engine registers. */
  assignedByEngine: boolean
}

const PANELALPHA_ONLINE = 'panelalpha.online'

/**
 * Whether the name is in the PanelAlpha Online proxy zone. The proxy serves only the labels the Engine allocates
 * there, so a name this dialog could build for a copy of a site on that zone would never answer.
 */
export function inPanelAlphaOnlineZone (domain: string | null | undefined): boolean {
  const name = String(domain ?? '').trim().toLowerCase().replace(/\.+$/, '')
  return name === PANELALPHA_ONLINE || name.endsWith(`.${PANELALPHA_ONLINE}`)
}

export function stagingDomainParts (instance: StagingInstanceSettings): StagingDomainParts {
  const settings = (instance.plan_settings?.domain_for_staging ?? {}) as { type?: string, fixed_domain?: string }
  const subdomain = 'staging'
  let suffix = '.'
  let allowAnyDomain = false
  let parentDomain = instance.domain ?? ''

  let domain = parentDomain
  if (settings.type === 'fixed_subdomain') {
    parentDomain = settings.fixed_domain ?? ''
    domain = parentDomain
  } else if (settings.type === 'any_domain') {
    allowAnyDomain = true
    domain = `staging.${domain}`
  }

  // A copy of a site on the free PanelAlpha Online address gets its name from the Engine (which registers it with
  // the proxy), so there is no label to type: the panel sends no domain and the copy answers under the new name.
  if (!allowAnyDomain && inPanelAlphaOnlineZone(parentDomain)) {
    return { allowAnyDomain, subdomain: '', parentDomain, suffix: '', domain: '', assignedByEngine: true }
  }

  // Without the loaded parser (`loadDomainParser` not awaited) the suffix stays `.`; `CreateStagingModal.open` awaits it.
  if (needsDomainParser(instance) && parseDomain) {
    const parsed = parseDomain(domain)
    if ('subdomain' in parsed && parsed.subdomain) {
      suffix = '-'
    }
  }

  return { allowAnyDomain, subdomain, parentDomain, suffix, domain: subdomain + suffix + parentDomain, assignedByEngine: false }
}

export function stagingOnSeparateAccount (instance: StagingInstanceSettings): boolean {
  return Boolean(instance.server_settings?.force_separate_accounts)
}

export function isStagingBillable (instance: StagingInstanceSettings): boolean {
  return Boolean(instance.server_settings?.is_staging_billable)
}

/** app-lite: a custom project has no WordPress disk usage to show; both sources hide the block on separate accounts. */
export function hideDiskUsage (instance: StagingInstanceSettings): boolean {
  return (instance.type || 'wordpress') === 'custom' || stagingOnSeparateAccount(instance)
}

const num = (value: unknown): number => Number(value ?? 0)

export function emptyUsage (): StagingDiskUsage {
  return {
    account_usage: null,
    account_limit: null,
    wordpress_dir_usage: null,
    uploads_dir_usage: null,
    wordpress_db_usage: null,
  }
}

export function wpDiskUsage (usage: StagingDiskUsage): string {
  return formatBytes(num(usage.wordpress_dir_usage) + num(usage.wordpress_db_usage))
}

export function uploadsDirUsage (usage: StagingDiskUsage): string {
  return formatBytes(usage.uploads_dir_usage === undefined ? null : (usage.uploads_dir_usage as number | null))
}

/** `availableDiskSpace`: a missing limit is unlimited (`unlimitedLabel` is the translated text). */
export function availableDiskSpace (usage: StagingDiskUsage, unlimitedLabel: string): string {
  const limit = usage.account_limit as number | null | undefined
  if (!limit) {
    return unlimitedLabel
  }
  const free = limit - num(usage.account_usage)
  return free < 0 ? '0 B' : formatBytes(free)
}

/** `forceSkipUploadsDir`: WordPress files plus the database do not fit into the free space. */
export function forceSkipUploadsDir (usage: StagingDiskUsage): boolean {
  const limit = usage.account_limit as number | null | undefined
  if (!limit) {
    return false
  }
  return num(usage.wordpress_dir_usage) + num(usage.wordpress_db_usage) > limit - num(usage.account_usage)
}
