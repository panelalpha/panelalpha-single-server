import { describe, expect, it } from 'vitest'
import {
  asksForDomain,
  asksForSiteName,
  availableInstallationTypes,
  canMigrateWordpress,
  canTransferDomain,
  getActiveServices,
  getServiceOnboardingMode,
  hasEagerDnsVerification,
  hasLimitReached,
  isAdvancedOnboarding,
  isSuperQuick,
  type OnboardingService,
} from './onboarding-service'

function service (patch: Partial<OnboardingService> = {}): OnboardingService {
  return { id: 1, status: 'active', instance_count: 0, instance_limit: 5, ...patch }
}

describe('getActiveServices', () => {
  it('keeps only the services with status active', () => {
    const active = service({ id: 1 })
    const expired = service({ id: 2, status: 'expired' })

    expect(getActiveServices([active, expired])).toEqual([active])
  })
})

describe('hasLimitReached', () => {
  it('is true for an empty list (legacy hasLimitReached, no service to choose)', () => {
    expect(hasLimitReached([])).toBe(true)
  })

  it('is false while one active service still has room', () => {
    expect(hasLimitReached([service({ instance_count: 5, instance_limit: 5 }), service({ id: 2, instance_count: 1, instance_limit: 5 })])).toBe(false)
  })

  it('is true when every active service is full, and ignores inactive services with room', () => {
    expect(hasLimitReached([service({ instance_count: 5, instance_limit: 5 }), service({ id: 2, status: 'expired' })])).toBe(true)
  })
})

describe('availableInstallationTypes', () => {
  it('collects the enabled types of all services in legacy order', () => {
    const services = [
      service({ id: 1, onboarding: { installation_type: { go: true, wordpress: false } } }),
      service({ id: 2, onboarding: { installation_type: { git: true, wordpress: true } } }),
    ]

    expect(availableInstallationTypes(services)).toEqual(['wordpress', 'git'])
  })

  it('hides PanelAlpha Go unless the panel reads its catalog, even when a service enables it', () => {
    const services = [service({ id: 1, onboarding: { installation_type: { wordpress: true, go: true } } })]

    expect(availableInstallationTypes(services)).toEqual(['wordpress'])
    expect(availableInstallationTypes(services, { go: false })).toEqual(['wordpress'])
    expect(availableInstallationTypes([service({ id: 2, onboarding: { installation_type: { go: true } } })])).toEqual([])
  })

  it('offers the PanelAlpha Go source last when the panel reads the Go catalog', () => {
    const services = [service({ id: 1, onboarding: { installation_type: { go: true, wordpress: true, git: true } } })]

    expect(availableInstallationTypes(services, { go: true })).toEqual(['wordpress', 'git', 'go'])
    expect(availableInstallationTypes([service({ id: 2, onboarding: { installation_type: { wordpress: true } } })], { go: true })).toEqual(['wordpress'])
  })

  it('is empty when no service enables a type', () => {
    expect(availableInstallationTypes([service()])).toEqual([])
  })
})

describe('canMigrateWordpress', () => {
  it('needs migrations and wordpress on the same service', () => {
    expect(canMigrateWordpress([service({ onboarding: { installation_type: { wordpress: true } } })])).toBe(false)
    expect(canMigrateWordpress([service({ onboarding: { installation_type: { wordpress: true, migrations: true } } })])).toBe(true)
  })
})

describe('getServiceOnboardingMode', () => {
  it('prefers onboarding_mode over install_method', () => {
    expect(getServiceOnboardingMode(service({ onboarding_mode: 'advanced', install_method: 'simple' }))).toBe('advanced')
  })

  it('maps install_method when onboarding_mode is missing', () => {
    expect(getServiceOnboardingMode(service({ install_method: 'super_quick' }))).toBe('simple')
    expect(getServiceOnboardingMode(service({ install_method: 'standard' }))).toBe('advanced')
    expect(getServiceOnboardingMode(service({ install_method: 'quick' }))).toBe('legacy_quick')
  })

  it('falls back to simple', () => {
    expect(getServiceOnboardingMode(service())).toBe('simple')
  })

  it('treats a missing service as simple, as legacy does', () => {
    expect(getServiceOnboardingMode(undefined)).toBe('simple')
  })
})

describe('onboarding mode helpers', () => {
  it('reads advanced and super-quick (simple) onboarding', () => {
    expect(isAdvancedOnboarding(service({ onboarding_mode: 'advanced' }))).toBe(true)
    expect(isAdvancedOnboarding(service({ onboarding_mode: 'simple' }))).toBe(false)
    expect(isSuperQuick(service({ onboarding_mode: 'simple' }))).toBe(true)
    expect(isSuperQuick(service({ onboarding_mode: 'legacy_quick' }))).toBe(false)
    expect(isSuperQuick(undefined)).toBe(true)
  })
})

describe('asksForDomain', () => {
  it('is false for advanced onboarding, whatever the flag says', () => {
    expect(asksForDomain(service({ onboarding_mode: 'advanced', ask_for_domain: true }))).toBe(false)
  })

  it('follows the service flag for simple and legacy quick onboarding', () => {
    expect(asksForDomain(service({ onboarding_mode: 'simple', ask_for_domain: true }))).toBe(true)
    expect(asksForDomain(service({ onboarding_mode: 'legacy_quick' }))).toBe(false)
    expect(asksForDomain(undefined)).toBe(false)
  })
})

describe('asksForSiteName', () => {
  it('is false for advanced onboarding and true for legacy quick, whatever the flags say', () => {
    expect(asksForSiteName(service({ onboarding_mode: 'advanced', ask_for_site_name: true }))).toBe(false)
    expect(asksForSiteName(service({ onboarding_mode: 'legacy_quick' }))).toBe(true)
  })

  it('walks the fallback chain for simple onboarding: service flag, onboarding flag, super-quick flag', () => {
    expect(asksForSiteName(service({ onboarding_mode: 'simple', ask_for_site_name: true }))).toBe(true)
    expect(asksForSiteName(service({ onboarding_mode: 'simple', onboarding: { installation_type: {}, ask_for_site_name: true } }))).toBe(true)
    expect(asksForSiteName(service({ onboarding_mode: 'simple', onboarding: { installation_type: {}, super_quick_ask_for_site_name: true } }))).toBe(true)
    expect(asksForSiteName(service({ onboarding_mode: 'simple', ask_for_site_name: false, onboarding: { installation_type: {}, ask_for_site_name: true } }))).toBe(false)
    expect(asksForSiteName(service({ onboarding_mode: 'simple' }))).toBe(false)
    expect(asksForSiteName(undefined)).toBe(false)
  })
})

describe('domain transfer and eager DNS flags', () => {
  it('reads the server transfer flag and the eager verification flag from the onboarding config', () => {
    const allowed = service({ onboarding: { installation_type: {}, server_allow_domain_transfer: true, eager_domain_dns_verification_enabled: true } })

    expect(canTransferDomain(allowed)).toBe(true)
    expect(hasEagerDnsVerification(allowed)).toBe(true)
    expect(canTransferDomain(service())).toBe(false)
    expect(hasEagerDnsVerification(undefined)).toBe(false)
  })
})
