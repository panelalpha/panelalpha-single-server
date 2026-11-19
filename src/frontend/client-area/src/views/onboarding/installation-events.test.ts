import type { InstallationEventDeps, InstalledInstancePayload } from './installation-events'
import type { OnboardingService } from './onboarding-service'
import { describe, expect, it, vi } from 'vitest'
import { applyInstallationFailed, applyInstallationFinished, applySyncFailed, applySyncFinished, hasVerificationMethods, installedDnsInput, narrowInstalledInstance, sameInstanceId } from './installation-events'

function payload (patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    domain: 'shop.pl',
    url: 'https://shop.pl',
    onboarding_subdomain: 'shop.sub.pl',
    dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any' },
    service_has_dns: true,
    host_ipv4_addresses: ['192.0.2.1', '198.51.100.0/30'],
    host_c_names: ['c.host.pl'],
    domain_zone: { details: { nameservers: ['ns1.host.pl'], configuration_records: [{ type: 'A', name: 'shop.pl', value: '192.0.2.9' }] } },
    plan_settings: {},
    cdn_dns_records: [],
    ...patch,
  }
}

/** Deps for one finished or failed event: the progress is open unless the test closes it, the service is a standard one unless given. */
function deps (patch: Partial<InstallationEventDeps> = {}): InstallationEventDeps {
  return {
    progressOpen: () => true,
    run: () => 1,
    currentInstanceId: () => 7,
    setInstalledInstance: vi.fn(),
    verifyDnsResolving: vi.fn(async () => true),
    setDnsMismatch: vi.fn(),
    setResult: vi.fn(),
    service: () => undefined,
    startSuperQuickRedirect: vi.fn(),
    setShowStartCreatingButton: vi.fn(),
    ...patch,
  }
}

/** A simple-mode service with the given post-installation action. */
function superQuickService (action: string | undefined): OnboardingService {
  return { id: 3, install_method: 'simple', onboarding: { super_quick_post_installation_action: action } } as unknown as OnboardingService
}

describe('narrowInstalledInstance', () => {
  it('keeps an object body and drops anything else', () => {
    expect(narrowInstalledInstance(payload())).toMatchObject({ id: 7, domain: 'shop.pl' })
    expect(narrowInstalledInstance(undefined)).toBeNull()
    expect(narrowInstalledInstance(null)).toBeNull()
  })
})

describe('hasVerificationMethods', () => {
  it('counts only a non-empty array of methods', () => {
    expect(hasVerificationMethods(payload() as unknown as InstalledInstancePayload)).toBe(true)
    expect(hasVerificationMethods(payload({ dns_settings: { verification_methods: [] } }) as unknown as InstalledInstancePayload)).toBe(false)
    expect(hasVerificationMethods(payload({ dns_settings: null }) as unknown as InstalledInstancePayload)).toBe(false)
  })
})

describe('installedDnsInput', () => {
  it('reads the payload fields as the legacy call does, with the host addresses as they come', () => {
    expect(installedDnsInput(payload() as unknown as InstalledInstancePayload)).toEqual({
      domain: 'shop.pl',
      onboardingSubdomain: 'shop.sub.pl',
      dnsSettings: { verification_methods: ['resolve_a_record'], verification_mode: 'any' },
      hasDnsServer: true,
      ipv4Addresses: ['192.0.2.1', '198.51.100.0/30'],
      nameservers: ['ns1.host.pl'],
      hostCNames: ['c.host.pl'],
      recordsFromDnsServer: [{ type: 'A', name: 'shop.pl', value: '192.0.2.9' }],
      eagerDnsVerification: false,
      skipARecordVerification: false,
    })
  })

  it('skips the A record while a CDN plan has no records yet', () => {
    const input = installedDnsInput(payload({ plan_settings: { cdn: { provider_slug: 'bunny' } } }) as unknown as InstalledInstancePayload)
    expect(input.skipARecordVerification).toBe(true)
  })

  it('accepts a payload without domain_zone', () => {
    const input = installedDnsInput(payload({ domain_zone: undefined }) as unknown as InstalledInstancePayload)
    expect(input.nameservers).toEqual([])
    expect(input.recordsFromDnsServer).toEqual([])
  })
})

describe('applyInstallationFinished', () => {
  it('keeps the instance and completes without a DNS check when the plan has no verification methods', async () => {
    const d = deps()
    await applyInstallationFinished(payload({ dns_settings: { verification_methods: [] } }), d)
    expect(d.setInstalledInstance).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
    expect(d.setDnsMismatch).not.toHaveBeenCalled()
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('shows the DNS mismatch when the open progress finds the site not resolving', async () => {
    const d = deps({ verifyDnsResolving: vi.fn(async () => false) })
    await applyInstallationFinished(payload(), d)
    expect(d.verifyDnsResolving).toHaveBeenCalledWith(expect.objectContaining({ domain: 'shop.pl' }))
    expect(d.setDnsMismatch).toHaveBeenCalledWith(true)
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('clears the mismatch when the site resolves', async () => {
    const d = deps()
    await applyInstallationFinished(payload(), d)
    expect(d.setDnsMismatch).toHaveBeenCalledWith(false)
  })

  it('counts a DNS check that throws as not resolved', async () => {
    const d = deps({ verifyDnsResolving: vi.fn(async () => {
      throw new Error('dns down')
    }) })
    await applyInstallationFinished(payload(), d)
    expect(d.setDnsMismatch).toHaveBeenCalledWith(true)
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('does not run the DNS check when the progress is closed, but still completes', async () => {
    const d = deps({ progressOpen: () => false })
    await applyInstallationFinished(payload(), d)
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
    expect(d.setDnsMismatch).not.toHaveBeenCalled()
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('writes the installed instance only while the progress is open', async () => {
    const closed = deps({ progressOpen: () => false })
    await applyInstallationFinished(payload(), closed)
    expect(closed.setInstalledInstance).not.toHaveBeenCalled()

    const open = deps()
    await applyInstallationFinished(payload(), open)
    expect(open.setInstalledInstance).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
  })

  it('sets nothing when the flow closed or restarted during the DNS check (run guard)', async () => {
    let run = 1
    const d = deps({
      run: () => run,
      verifyDnsResolving: vi.fn(async () => {
        run = 2
        return false
      }),
    })
    await applyInstallationFinished(payload(), d)
    expect(d.setDnsMismatch).not.toHaveBeenCalled()
    expect(d.setResult).not.toHaveBeenCalled()
  })

  it('accepts a payload without domain_zone', async () => {
    const d = deps()
    await applyInstallationFinished(payload({ domain_zone: undefined }), d)
    expect(d.verifyDnsResolving).toHaveBeenCalledWith(expect.objectContaining({ nameservers: [] }))
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('ignores an event without a body', async () => {
    const d = deps()
    await applyInstallationFinished(undefined, d)
    expect(d.setInstalledInstance).not.toHaveBeenCalled()
    expect(d.setResult).not.toHaveBeenCalled()
  })
})

describe('applyInstallationFailed', () => {
  it('keeps the instance and shows the failure', () => {
    const d = deps()
    applyInstallationFailed(payload(), d)
    expect(d.setInstalledInstance).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: true })
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
  })

  it('ignores the failure without a body, since it has no id to match', () => {
    const d = deps()
    applyInstallationFailed(undefined, d)
    expect(d.setInstalledInstance).not.toHaveBeenCalled()
    expect(d.setResult).not.toHaveBeenCalled()
  })
})

describe('applyInstallationFinished, super-quick branches', () => {
  it('starts the SSO redirect with the progress open and leaves the result to it', async () => {
    const service = superQuickService('redirect')
    const d = deps({ service: () => service })
    await applyInstallationFinished(payload(), d)
    expect(d.startSuperQuickRedirect).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), service)
    expect(d.setResult).not.toHaveBeenCalled()
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
  })

  it('does not redirect when the progress is closed, but still completes', async () => {
    const d = deps({ service: () => superQuickService('redirect'), progressOpen: () => false })
    await applyInstallationFinished(payload(), d)
    expect(d.startSuperQuickRedirect).not.toHaveBeenCalled()
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('checks the DNS with dns_verification and offers start creating', async () => {
    const d = deps({ service: () => superQuickService('dns_verification'), verifyDnsResolving: vi.fn(async () => false) })
    await applyInstallationFinished(payload(), d)
    expect(d.startSuperQuickRedirect).not.toHaveBeenCalled()
    expect(d.setDnsMismatch).toHaveBeenCalledWith(true)
    expect(d.setShowStartCreatingButton).toHaveBeenCalledWith(true)
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('skips the DNS check with dns_verification when the progress is closed', async () => {
    const d = deps({ service: () => superQuickService('dns_verification'), progressOpen: () => false })
    await applyInstallationFinished(payload(), d)
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('takes neither branch for another action, and skips the verification-methods DNS check', async () => {
    const d = deps({ service: () => superQuickService('none') })
    await applyInstallationFinished(payload(), d)
    expect(d.startSuperQuickRedirect).not.toHaveBeenCalled()
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
    expect(d.setShowStartCreatingButton).toHaveBeenCalledWith(true)
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('ignores the action of a standard service and keeps the verification-methods check', async () => {
    const standard = { id: 3, install_method: 'advanced', onboarding: { super_quick_post_installation_action: 'redirect' } } as unknown as OnboardingService
    const d = deps({ service: () => standard, verifyDnsResolving: vi.fn(async () => false) })
    await applyInstallationFinished(payload(), d)
    expect(d.startSuperQuickRedirect).not.toHaveBeenCalled()
    expect(d.setDnsMismatch).toHaveBeenCalledWith(true)
  })
})

describe('instance id filter', () => {
  it('ignores a finished event for another project, even with the progress open and verification methods', async () => {
    const d = deps({ currentInstanceId: () => 8, verifyDnsResolving: vi.fn(async () => false) })
    await applyInstallationFinished(payload(), d)
    expect(d.setInstalledInstance).not.toHaveBeenCalled()
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
    expect(d.setDnsMismatch).not.toHaveBeenCalled()
    expect(d.setShowStartCreatingButton).not.toHaveBeenCalled()
    expect(d.setResult).not.toHaveBeenCalled()
  })

  it('ignores a finished event for another project before the super-quick redirect', async () => {
    const d = deps({ currentInstanceId: () => 8, service: () => superQuickService('redirect') })
    await applyInstallationFinished(payload(), d)
    expect(d.startSuperQuickRedirect).not.toHaveBeenCalled()
    expect(d.setResult).not.toHaveBeenCalled()
  })

  it('ignores a failed event for another project', () => {
    const d = deps({ currentInstanceId: () => 8 })
    applyInstallationFailed(payload(), d)
    expect(d.setInstalledInstance).not.toHaveBeenCalled()
    expect(d.setResult).not.toHaveBeenCalled()
  })

  it('accepts a finished and a failed event whose id matches in another type', async () => {
    const finished = deps({ currentInstanceId: () => '7' })
    await applyInstallationFinished(payload(), finished)
    expect(finished.setResult).toHaveBeenCalledWith({ completed: true, error: false })

    const failed = deps({ currentInstanceId: () => '7' })
    applyInstallationFailed(payload(), failed)
    expect(failed.setResult).toHaveBeenCalledWith({ completed: true, error: true })

    const reverse = deps({ currentInstanceId: () => 7 })
    applyInstallationFailed(payload({ id: '7' }), reverse)
    expect(reverse.setResult).toHaveBeenCalledWith({ completed: true, error: true })
  })

  it('ignores both events while no instance is known yet (null id)', async () => {
    const finished = deps({ currentInstanceId: () => null })
    await applyInstallationFinished(payload(), finished)
    expect(finished.setInstalledInstance).not.toHaveBeenCalled()
    expect(finished.setResult).not.toHaveBeenCalled()

    const failed = deps({ currentInstanceId: () => undefined })
    applyInstallationFailed(payload(), failed)
    expect(failed.setInstalledInstance).not.toHaveBeenCalled()
    expect(failed.setResult).not.toHaveBeenCalled()
  })

  it('ignores a body without an id', async () => {
    const finished = deps()
    await applyInstallationFinished(payload({ id: undefined }), finished)
    expect(finished.setInstalledInstance).not.toHaveBeenCalled()
    expect(finished.setResult).not.toHaveBeenCalled()

    const failed = deps()
    applyInstallationFailed(payload({ id: undefined }), failed)
    expect(failed.setResult).not.toHaveBeenCalled()
  })
})

describe('sameInstanceId', () => {
  it('matches equal numbers and equal strings, and a number with its string', () => {
    expect(sameInstanceId(7, 7)).toBe(true)
    expect(sameInstanceId('7', '7')).toBe(true)
    expect(sameInstanceId(7, '7')).toBe(true)
    expect(sameInstanceId('7', 7)).toBe(true)
  })

  it('rejects other values, a missing side, and anything that is not a number or a non-empty string', () => {
    expect(sameInstanceId(7, 8)).toBe(false)
    expect(sameInstanceId(7, null)).toBe(false)
    expect(sameInstanceId(null, 7)).toBe(false)
    expect(sameInstanceId(undefined, undefined)).toBe(false)
    expect(sameInstanceId('', '')).toBe(false)
    expect(sameInstanceId({ id: 7 }, { id: 7 })).toBe(false)
    expect(sameInstanceId(true, true)).toBe(false)
  })
})

describe('applySyncFinished and applySyncFailed', () => {
  it('completes the sync progress without an error', () => {
    const d = deps()
    applySyncFinished(d)
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: false })
  })

  it('completes the sync progress with the failure', () => {
    const d = deps()
    applySyncFailed(d)
    expect(d.setResult).toHaveBeenCalledWith({ completed: true, error: true })
  })

  it('does not touch the instance or the DNS check', () => {
    const d = deps()
    applySyncFinished(d)
    applySyncFailed(d)
    expect(d.setInstalledInstance).not.toHaveBeenCalled()
    expect(d.verifyDnsResolving).not.toHaveBeenCalled()
  })
})
