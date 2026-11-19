import type { InstalledInstancePayload } from './installation-events'
import type { OnboardingService } from './onboarding-service'
import type { SuperQuickRedirectDeps } from './super-quick'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSuperQuickRedirect, displaysButtons, hasExternalWordPressBuilder, redirectsToWpAdmin } from './super-quick'

const instance: InstalledInstancePayload = { id: 7, domain: 'shop.pl', service_id: 3 }

/** A simple service with the given redirect delay in seconds. */
function service (delay?: number): OnboardingService {
  return { id: 3, install_method: 'simple', onboarding: { super_quick_redirect_delay_after_site_creation: delay } } as unknown as OnboardingService
}

/** Deps where both checks answer `ready` (a mutable flag the test flips), the SSO link resolves, and the run stays active. */
function makeDeps (patch: Partial<SuperQuickRedirectDeps> = {}) {
  const state = { ready: true, active: true }
  const deps: SuperQuickRedirectDeps = {
    isSslCertificateDetected: vi.fn(async () => state.ready),
    isDomainResolved: vi.fn(async () => state.ready),
    requestSsoUrl: vi.fn(async () => 'https://wp.test/sso'),
    navigate: vi.fn(),
    onSsoFailed: vi.fn(),
    onSsoSettled: vi.fn(),
    isActive: () => state.active,
    ...patch,
  }
  return { deps, state }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createSuperQuickRedirect', () => {
  it('checks at once and redirects before the first tick when both flags are set', async () => {
    const { deps } = makeDeps()
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })

    await redirect.start()

    expect(deps.isSslCertificateDetected).toHaveBeenCalledWith('shop.pl')
    expect(deps.isDomainResolved).toHaveBeenCalledWith(3, 'shop.pl')
    expect(deps.requestSsoUrl).toHaveBeenCalledWith(7)
    expect(deps.navigate).toHaveBeenCalledWith('https://wp.test/sso')
    expect(deps.onSsoSettled).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('polls every 5 seconds after a first check that is not ready, and redirects early once both are set', async () => {
    const { deps, state } = makeDeps()
    state.ready = false
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })

    await redirect.start()
    expect(deps.isSslCertificateDetected).toHaveBeenCalledTimes(1)
    expect(deps.navigate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(4999)
    expect(deps.navigate).not.toHaveBeenCalled()

    state.ready = true
    await vi.advanceTimersByTimeAsync(1)
    expect(deps.requestSsoUrl).toHaveBeenCalledTimes(1)
    expect(deps.navigate).toHaveBeenCalledWith('https://wp.test/sso')
    // The redirect is early: the delay of 60 s is far away, and the polling is over.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skips a tick while the previous checks still run, so the requests do not pile up', async () => {
    const { deps, state } = makeDeps()
    state.ready = false
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })
    await redirect.start()

    let release: (ready: boolean) => void = () => {}
    vi.mocked(deps.isSslCertificateDetected).mockImplementationOnce(() => new Promise<boolean>(resolve => {
      release = resolve
    }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.isSslCertificateDetected).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(deps.isSslCertificateDetected).toHaveBeenCalledTimes(2)

    release(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.isSslCertificateDetected).toHaveBeenCalledTimes(3)
    redirect.stop()
  })

  it('latches the SSL flag once it was seen, and keeps checking only the resolve flag', async () => {
    const { deps } = makeDeps({
      isSslCertificateDetected: vi.fn(async () => true),
      isDomainResolved: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true),
    })
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })

    await redirect.start()
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.navigate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.isSslCertificateDetected).toHaveBeenCalledTimes(1)
    expect(deps.isDomainResolved).toHaveBeenCalledTimes(3)
    expect(deps.navigate).toHaveBeenCalledTimes(1)
  })

  it('counts a check that throws as not ready', async () => {
    const { deps, state } = makeDeps({
      isSslCertificateDetected: vi.fn(async () => {
        throw new Error('network')
      }),
    })
    state.ready = true
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(0) })

    await redirect.start()

    // With a zero delay the first tick is already the last check: the redirect goes on, whatever it said.
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(100)
    expect(deps.navigate).toHaveBeenCalledTimes(1)
  })

  it('ends on the delay: the last check and the redirect run whatever it says', async () => {
    const { deps, state } = makeDeps()
    state.ready = false
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(12) })

    await redirect.start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(deps.requestSsoUrl).not.toHaveBeenCalled()

    // The tick at 15 s is past the 12 s delay: one last check, then the redirect 100 ms later.
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.requestSsoUrl).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(deps.requestSsoUrl).toHaveBeenCalledTimes(1)
    expect(deps.navigate).toHaveBeenCalledWith('https://wp.test/sso')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('without a delay on the service, keeps polling while not ready and redirects once ready', async () => {
    const { deps, state } = makeDeps()
    state.ready = false
    const redirect = createSuperQuickRedirect(deps, { instance, service: service() })

    await redirect.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.requestSsoUrl).not.toHaveBeenCalled()

    state.ready = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.requestSsoUrl).toHaveBeenCalledTimes(1)
    redirect.stop()
  })

  it('stops polling when stopped, and no request goes out after it', async () => {
    const { deps, state } = makeDeps()
    state.ready = false
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })

    await redirect.start()
    redirect.stop()
    state.ready = true
    await vi.advanceTimersByTimeAsync(20_000)

    expect(deps.isSslCertificateDetected).toHaveBeenCalledTimes(1)
    expect(deps.navigate).not.toHaveBeenCalled()
  })

  it('stops at once when the run guard reports the progress closed, with no redirect', async () => {
    const { deps, state } = makeDeps()
    state.ready = false
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })

    await redirect.start()
    state.active = false
    state.ready = true
    await vi.advanceTimersByTimeAsync(5000)

    expect(deps.requestSsoUrl).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start when the progress is already closed', async () => {
    const { deps, state } = makeDeps()
    state.active = false
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })

    await redirect.start()

    expect(deps.isSslCertificateDetected).not.toHaveBeenCalled()
    expect(deps.requestSsoUrl).not.toHaveBeenCalled()
  })

  it('does nothing for the service with id 0 (legacy guard)', async () => {
    const { deps } = makeDeps()
    const redirect = createSuperQuickRedirect(deps, { instance, service: { ...service(60), id: 0 } })

    await redirect.start()

    expect(deps.isSslCertificateDetected).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
  })

  it('offers start creating and settles the result when the SSO link fails', async () => {
    const failure = new Error('sso down')
    const { deps } = makeDeps({ requestSsoUrl: vi.fn(async () => {
      throw failure
    }) })
    const redirect = createSuperQuickRedirect(deps, { instance, service: service(60) })

    await redirect.start()

    expect(deps.navigate).not.toHaveBeenCalled()
    expect(deps.onSsoFailed).toHaveBeenCalledWith(failure)
    expect(deps.onSsoSettled).toHaveBeenCalledTimes(1)
  })
})

describe('redirectsToWpAdmin', () => {
  it('is true for the simple mode with the redirect action', () => {
    expect(redirectsToWpAdmin({ install_method: 'simple', onboarding: { super_quick_post_installation_action: 'redirect' } } as unknown as OnboardingService)).toBe(true)
    expect(redirectsToWpAdmin({ onboarding_mode: 'simple', onboarding: { super_quick_post_installation_action: 'redirect' } } as unknown as OnboardingService)).toBe(true)
  })

  it('is false for another action, another mode or no service', () => {
    expect(redirectsToWpAdmin({ install_method: 'simple', onboarding: { super_quick_post_installation_action: 'dns_verification' } } as unknown as OnboardingService)).toBe(false)
    expect(redirectsToWpAdmin({ install_method: 'advanced', onboarding: { super_quick_post_installation_action: 'redirect' } } as unknown as OnboardingService)).toBe(false)
    expect(redirectsToWpAdmin(undefined)).toBe(false)
  })
})

describe('displaysButtons', () => {
  it('shows the buttons for every action but the redirect', () => {
    expect(displaysButtons({ onboarding: { super_quick_post_installation_action: 'redirect' } } as unknown as OnboardingService)).toBe(false)
    expect(displaysButtons({ onboarding: { super_quick_post_installation_action: 'dns_verification' } } as unknown as OnboardingService)).toBe(true)
    expect(displaysButtons(undefined)).toBe(true)
  })
})

describe('hasExternalWordPressBuilder', () => {
  it('reads the flag from the plan settings of the installed instance', () => {
    expect(hasExternalWordPressBuilder({ id: 1, plan_settings: { onboarding: { has_external_wordpress_builder: true } } })).toBe(true)
    expect(hasExternalWordPressBuilder({ id: 1, plan_settings: {} })).toBe(false)
    expect(hasExternalWordPressBuilder(null)).toBe(false)
  })
})
