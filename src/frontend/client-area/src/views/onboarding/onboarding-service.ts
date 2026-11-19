import type { HomeService } from '@/shared/session/session.api'
import type { DnsSettings } from '@/entities/domain/verify-domain-resolving'

/**
 * The fields of a `/home` service that the onboarding reads. The rest of the service stays opaque on `HomeService`.
 */
export interface OnboardingService extends HomeService {
  status?: string
  plan_name?: string
  instance_count?: number
  instance_limit?: number
  /** The install opens right after login while no instance exists. */
  force_install?: boolean
  install_method?: string
  onboarding_mode?: 'simple' | 'advanced' | 'legacy_quick'
  choose_theme?: boolean
  ask_for_domain?: boolean
  ask_for_site_name?: boolean
  plan_default_theme?: unknown
  plan_upgrade_link?: string
  is_installed_from_template?: boolean
  quick_allow_to_choose_themes?: boolean
  dns_server?: { enabled?: boolean, nameservers?: string[] } | null
  hosting_server?: { ip_v4_addresses?: string[] } | null
  hosting_accounts?: Array<{ ipv4_addresses?: string[], host_c_names?: string[] } & Record<string, unknown>>
  /** The standard fields are read on the service itself (the `onboarding` block is the fallback). */
  standard_fields?: Record<string, unknown>
  standard_force_template?: boolean
  ask_for_wordpress_version?: boolean
  onboarding?: OnboardingServiceConfig
}

export interface OnboardingServiceConfig {
  [key: string]: unknown
  installation_type?: Partial<Record<InstallationTypeKey | 'migrations', boolean>>
  user_configurable_options?: Array<{ name: string } & Record<string, unknown>>
  account_config?: unknown
  can_select_reseller_user?: boolean
  subdomain_bases?: string[]
  domains_blacklist?: string[]
  server_allow_domain_transfer?: boolean
  domain_transfer_enabled?: boolean
  eager_domain_dns_verification_enabled?: boolean
  dns_settings?: DnsSettings
  ask_for_site_name?: boolean
  super_quick_ask_for_site_name?: boolean
  super_quick_post_installation_action?: string
  super_quick_redirect_delay_after_site_creation?: number
  standard_fields?: Record<string, unknown>
  standard_force_template?: boolean
  ask_for_wordpress_version?: boolean
}

/** Legacy order of the installation types: the first enabled one is preselected. */
export const INSTALLATION_TYPE_KEYS = ['wordpress', 'git', 'files', 'go'] as const
export type InstallationTypeKey = (typeof INSTALLATION_TYPE_KEYS)[number]

/** Only the services with `status == 'active'`. */
export function getActiveServices (services: readonly OnboardingService[]): OnboardingService[] {
  return services.filter(service => service.status === 'active')
}

/**
 * True unless an active service still has room.
 * An empty list is "limit reached", so the flow shows Limit instead of a service choice.
 */
export function hasLimitReached (services: readonly OnboardingService[]): boolean {
  return !services.some(service => service.status === 'active' && (service.instance_count ?? 0) < (service.instance_limit ?? 0))
}

export interface InstallationTypeOptions {
  /**
   * The panel reads PanelAlpha Go's catalog (`/api/free/go`, the Community panel). Without it `go` stays hidden as before
   * (legacy LITE showed an inert "coming soon" card), so it does not count towards the choice either.
   */
  go?: boolean
}

/**
 * The enabled types of the given services, in `INSTALLATION_TYPE_KEYS` order. `go` ("Deploy with
 * Go!") only when `options.go` says the panel can read Go's catalog.
 */
export function availableInstallationTypes (services: readonly OnboardingService[], options: InstallationTypeOptions = {}): InstallationTypeKey[] {
  const enabled = new Set<InstallationTypeKey>()

  for (const service of services) {
    const types = service.onboarding?.installation_type
    if (!types) {
      continue
    }
    for (const key of INSTALLATION_TYPE_KEYS) {
      if (types[key] === true) {
        enabled.add(key)
      }
    }
  }

  return INSTALLATION_TYPE_KEYS.filter(key => enabled.has(key) && (key !== 'go' || options.go === true))
}

/** WordPress with the migrations option on any service. */
export function canMigrateWordpress (services: readonly OnboardingService[]): boolean {
  return services.some(service => {
    const types = service.onboarding?.installation_type
    return types?.migrations === true && types?.wordpress === true
  })
}

/**
 * The service's own `onboarding_mode` wins; without it the
 * `install_method` decides (`simple` / `super_quick` → simple, `advanced` / `standard` → advanced, `quick` → legacy_quick).
 * No service counts as simple, as in legacy (`this.selectedService?.install_method` is undefined there).
 */
export function getServiceOnboardingMode (service: OnboardingService | undefined): 'simple' | 'advanced' | 'legacy_quick' {
  if (!service) {
    return 'simple'
  }
  if (service.onboarding_mode) {
    return service.onboarding_mode
  }

  const method = service.install_method
  if (method === 'simple' || method === 'super_quick') {
    return 'simple'
  }
  if (method === 'advanced' || method === 'standard') {
    return 'advanced'
  }
  if (method === 'quick') {
    return 'legacy_quick'
  }
  return 'simple'
}

export function isAdvancedOnboarding (service: OnboardingService | undefined): boolean {
  return getServiceOnboardingMode(service) === 'advanced'
}

/** The super-quick path. */
export function isSuperQuick (service: OnboardingService | undefined): boolean {
  return getServiceOnboardingMode(service) === 'simple'
}

/**
 * Advanced onboarding never asks for a domain
 * here (its standard form does), otherwise the service's own flag.
 */
export function asksForDomain (service: OnboardingService | undefined): boolean {
  if (isAdvancedOnboarding(service)) {
    return false
  }
  return Boolean(service?.ask_for_domain)
}

/**
 * Advanced never asks, legacy quick always
 * does, simple reads the first set flag of the service, its onboarding config, then the super-quick config.
 */
export function asksForSiteName (service: OnboardingService | undefined): boolean {
  if (isAdvancedOnboarding(service)) {
    return false
  }
  if (getServiceOnboardingMode(service) === 'legacy_quick') {
    return true
  }
  return Boolean(
    service?.ask_for_site_name
    ?? service?.onboarding?.ask_for_site_name
    ?? service?.onboarding?.super_quick_ask_for_site_name,
  )
}

/** The hosting server lets the domain be transferred in. */
export function canTransferDomain (service: OnboardingService | undefined): boolean {
  return service?.onboarding?.server_allow_domain_transfer === true
}

/** The DNS is verified right after the domain is set. */
export function hasEagerDnsVerification (service: OnboardingService | undefined): boolean {
  return service?.onboarding?.eager_domain_dns_verification_enabled === true
}
