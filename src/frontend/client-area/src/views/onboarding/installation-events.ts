import type { OnboardingService } from './onboarding-service'
import type { OnboardingStep } from './onboarding-steps'
import type { EntityPayload } from '@/shared/events/app-events'
import type { DnsSettings, VerifyDomainResolvingInput } from '@/entities/domain/verify-domain-resolving'
import type { CdnDnsRecord } from '@/entities/project/instance-resource'
import { cdnDnsPending } from '@/entities/project/instance-resource'
import { isSuperQuick } from './onboarding-service'

// Echo consumers of the installation (the standard branch). The bus carries the loose
// Echo body, so the payload is narrowed once, here, when it comes in. Deliberate deviation from
// legacy: the Echo channel is per user, so both handlers act only on the instance this wizard created (`currentInstanceId`) and
// ignore events of the user's other projects. The DNS branch and the super-quick branches only run while the progress is the open step.

/** The fields of the installed instance the progress reads (the raw Echo body). */
export interface InstalledInstancePayload {
  [key: string]: unknown
  id: number
  domain?: string | null
  url?: string | null
  onboarding_subdomain?: string | null
  dns_settings?: DnsSettings | null
  service_has_dns?: boolean
  service_id?: number
  host_ipv4_addresses?: string[] | null
  host_c_names?: string[] | null
  plan_settings?: Record<string, unknown> | null
  cdn_dns_records?: CdnDnsRecord[] | null
  install_details?: { install_method?: string } | null
  domain_zone?: {
    details?: {
      nameservers?: string[] | null
      configuration_records?: Array<{ type: string, name: string, value: string }> | null
    } | null
  } | null
}

/** The steps where the progress is on screen: only then the DNS branch runs (legacy had no such guard). */
export const PROGRESS_STEPS: ReadonlySet<OnboardingStep> = new Set<OnboardingStep>(['install-progress', 'super-quick-progress'])

/** Narrows the bus payload once. A missing or non-object body is no instance. */
export function narrowInstalledInstance (payload: EntityPayload | null): InstalledInstancePayload | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  return payload as unknown as InstalledInstancePayload
}

/** The DNS branch counts only with methods. */
export function hasVerificationMethods (instance: InstalledInstancePayload): boolean {
  const methods = instance.dns_settings?.verification_methods
  return Array.isArray(methods) && methods.length > 0
}

/**
 * The DNS check of the installed site: the raw Echo body has no
 * `getDnsIpv4Addresses`, so the host addresses are read as they come. CDN records not ready skip the A record (`cdnDnsPending`).
 */
export function installedDnsInput (instance: InstalledInstancePayload): VerifyDomainResolvingInput {
  return {
    domain: instance.domain ?? '',
    onboardingSubdomain: instance.onboarding_subdomain ?? null,
    dnsSettings: instance.dns_settings ?? {},
    hasDnsServer: instance.service_has_dns,
    ipv4Addresses: instance.host_ipv4_addresses ?? [],
    nameservers: instance.domain_zone?.details?.nameservers ?? [],
    hostCNames: instance.host_c_names ?? [],
    recordsFromDnsServer: instance.domain_zone?.details?.configuration_records ?? [],
    eagerDnsVerification: false,
    skipARecordVerification: cdnDnsPending(instance),
  }
}

export interface InstallationResult {
  completed: boolean
  error: boolean
}

/**
 * Whether an event's instance id is the id of this wizard's instance. Both sides must be a number or a non-empty string; the values are
 * compared as strings, so `7` and `"7"` match. Anything else (missing id, object, boolean) is no match.
 */
export function sameInstanceId (a: unknown, b: unknown): boolean {
  return hasInstanceId(a) && hasInstanceId(b) && String(a) === String(b)
}

/** A usable instance id: a number or a non-empty string. */
export function hasInstanceId (value: unknown): value is number | string {
  return typeof value === 'number' || (typeof value === 'string' && value !== '')
}

export interface InstallationEventDeps {
  /** True while the progress is the open step. */
  progressOpen: () => boolean
  /** The flow's run (`onboarding.run`): a DNS check that ends after the flow closed or restarted sets nothing. */
  run: () => number
  /** The id of the instance this flow's install request returned (`onboarding.newInstance.id`); null/undefined while none. */
  currentInstanceId: () => unknown
  setInstalledInstance: (instance: InstalledInstancePayload) => void
  verifyDnsResolving: (input: VerifyDomainResolvingInput) => Promise<boolean>
  setDnsMismatch: (mismatch: boolean) => void
  setResult: (result: InstallationResult) => void
  /** The service the flow works on: its mode and post-installation action pick the branch. */
  service: () => OnboardingService | undefined
  /** The super-quick redirect: the polling and the SSO settle the result themselves. */
  startSuperQuickRedirect: (instance: InstalledInstancePayload, service: OnboardingService) => void
  /** Set on every finished result. */
  setShowStartCreatingButton: (show: boolean) => void
}

/** The DNS mismatch of the installed site. A check that throws counts as not resolved, so the progress does not wait forever. */
async function dnsMismatchOf (instance: InstalledInstancePayload, deps: InstallationEventDeps): Promise<boolean> {
  const resolved = await deps.verifyDnsResolving(installedDnsInput(instance)).catch(() => false)
  return !resolved
}

/**
 * The instance is kept. A super-quick service
 * (simple mode) takes its branch from `super_quick_post_installation_action`, read from the service and not from the payload: `redirect`
 * starts the SSO polling, `dns_verification` checks the DNS. Any other service checks the DNS only with verification methods. Both
 * DNS checks and the redirect run only while the progress is the open step. Then the result is completed.
 */
export async function applyInstallationFinished (payload: EntityPayload | null, deps: InstallationEventDeps): Promise<void> {
  const instance = narrowInstalledInstance(payload)
  if (!instance || !sameInstanceId(instance.id, deps.currentInstanceId())) {
    return
  }
  const progressOpen = deps.progressOpen()
  // The instance is written only while the progress is on screen (the id check above does not replace this).
  if (progressOpen) {
    deps.setInstalledInstance(instance)
  }
  const service = deps.service()
  let checkDns: boolean
  if (service && isSuperQuick(service)) {
    const action = service.onboarding?.super_quick_post_installation_action
    if (progressOpen && action === 'redirect') {
      deps.startSuperQuickRedirect(instance, service)
      return
    }
    checkDns = progressOpen && action === 'dns_verification'
  } else {
    checkDns = progressOpen && hasVerificationMethods(instance)
  }
  if (checkDns) {
    const run = deps.run()
    const mismatch = await dnsMismatchOf(instance, deps)
    if (deps.run() !== run) {
      return
    }
    deps.setDnsMismatch(mismatch)
  }
  deps.setShowStartCreatingButton(true)
  deps.setResult({ completed: true, error: false })
}

/**
 * The instance is kept and the result is a failure. An event without a body or for another
 * instance id is ignored.
 */
export function applyInstallationFailed (payload: EntityPayload | null, deps: InstallationEventDeps): void {
  const instance = narrowInstalledInstance(payload)
  if (!instance || !sameInstanceId(instance.id, deps.currentInstanceId())) {
    return
  }
  deps.setInstalledInstance(instance)
  deps.setResult({ completed: true, error: true })
}

/** The sync progress reads the same result flags as the install progress. */
export type SyncEventDeps = Pick<InstallationEventDeps, 'setResult'>

/**
 * The sync progress completes. No guard
 * on the open step, as legacy: the flags only matter to a progress on screen, and `start` resets them.
 */
export function applySyncFinished (deps: SyncEventDeps): void {
  deps.setResult({ completed: true, error: false })
}

/** The sync progress shows the failure. */
export function applySyncFailed (deps: SyncEventDeps): void {
  deps.setResult({ completed: true, error: true })
}
