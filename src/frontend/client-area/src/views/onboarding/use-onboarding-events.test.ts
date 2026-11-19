import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type EffectScope, effectScope } from 'vue'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { getDomainResolved, getSslCertificateDetected } from './onboarding.api'
import { useOnboardingStore } from './onboarding.store'
import { useOnboardingEvents } from './use-onboarding-events'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/instances' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/entities/project/instance-actions.api', () => ({
  createSsoUrl: vi.fn(),
  getServiceInstanceOptions: vi.fn(),
  retryInstall: vi.fn(),
}))

vi.mock('./onboarding.api', () => ({
  getSslCertificateDetected: vi.fn(),
  getDomainResolved: vi.fn(),
}))

/** A service that enables the files installation type, with room. */
function filesService (id: number, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    status: 'active',
    instance_count: 0,
    instance_limit: 5,
    onboarding: { installation_type: { files: true } },
    ...patch,
  }
}

/** A simple-mode service whose post-installation action is the WP admin redirect (legacy super-quick `redirect`). */
const redirectService = {
  id: 3,
  status: 'active',
  onboarding_mode: 'simple',
  onboarding: { super_quick_post_installation_action: 'redirect', super_quick_redirect_delay_after_site_creation: 60 },
}

describe('useOnboardingEvents', () => {
  let scope: EffectScope

  beforeEach(() => {
    setActivePinia(createPinia())
    resetAppEvents()
    vi.useFakeTimers()
    vi.mocked(getSslCertificateDetected).mockReset()
    vi.mocked(getDomainResolved).mockReset()
    scope = effectScope()
    scope.run(() => useOnboardingEvents())
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('applies a finished event that came before the install response, once the instance id is set', async () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')

    emit('instance-installation-finished', { id: 9, domain: 'shop.pl' })
    await vi.runAllTimersAsync()
    expect(onboarding.installationCompleted).toBe(false)

    onboarding.newInstance = { id: 9 }
    await vi.runAllTimersAsync()

    expect(onboarding.newInstance).toEqual({ id: 9, domain: 'shop.pl' })
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(false)
  })

  it('applies a failed event that came before the install response, and ignores an early event of another project', async () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')

    emit('instance-installation-finished', { id: 10, domain: 'other.pl' })
    emit('instance-installation-failed', { id: 9 })
    onboarding.newInstance = { id: 9 }
    await vi.runAllTimersAsync()

    expect(onboarding.newInstance).toEqual({ id: 9 })
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
  })

  it('forgets early events when the flow restarts', async () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')

    emit('instance-installation-finished', { id: 9, domain: 'shop.pl' })
    onboarding.deactivateAll()
    onboarding.show('install-progress')
    onboarding.newInstance = { id: 9 }
    await vi.runAllTimersAsync()

    expect(onboarding.installationCompleted).toBe(false)
  })

  it('completes the open progress and keeps the instance on instance-installation-finished', async () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')
    onboarding.newInstance = { id: 9 }

    emit('instance-installation-finished', { id: 9, domain: 'shop.pl' })
    await vi.runAllTimersAsync()

    expect(onboarding.newInstance).toEqual({ id: 9, domain: 'shop.pl' })
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(false)
  })

  it('shows the failure and keeps the instance on instance-installation-failed', () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')
    onboarding.newInstance = { id: 9 }

    emit('instance-installation-failed', { id: 9 })

    expect(onboarding.newInstance).toEqual({ id: 9 })
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
  })

  it('completes the sync progress, with the failure on the failed event', () => {
    const onboarding = useOnboardingStore()
    onboarding.show('sync-progress')

    emit('service-sync-hosting-account-finished', {})
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(false)

    emit('service-sync-hosting-account-failed', {})
    expect(onboarding.installationError).toBe(true)
  })

  it('opens the standard form in retry mode on instance-retry-install-with-form', () => {
    const onboarding = useOnboardingStore()

    emit('instance-retry-install-with-form', { id: 9, install_details: { install_method: 'standard', name: 'shop' } })

    expect(onboarding.step).toBe('standard-form')
    expect(onboarding.retryInstanceId).toBe(9)
    expect(onboarding.retryWithForm).toBe(true)
  })

  it('offers the files services in the service choice on start-files-drop-install (legacy start-files-drop-install)', () => {
    useSessionStore().hydrateHome({ user: { services: [filesService(10), filesService(11), filesService(12, { status: 'expired' })] } } as never)
    const onboarding = useOnboardingStore()

    emit('start-files-drop-install', { uploadItems: [new File(['x'], 'shop-site.zip')] })

    expect(onboarding.step).toBe('choose-service')
    expect(onboarding.serviceChoices?.map(item => item.id)).toEqual([10, 11])
    expect(onboarding.filesDropLaunch).toBe(true)
  })

  it('shows zero-data for a drop with no active service', () => {
    useSessionStore().hydrateHome({ user: { services: [] } } as never)
    const onboarding = useOnboardingStore()

    emit('start-files-drop-install', { uploadItems: [new File(['x'], 'shop-site.zip')] })

    expect(onboarding.step).toBe('zero-data')
  })

  it('ignores a drop while a flow is open (the open-step check of the handler)', () => {
    useSessionStore().hydrateHome({ user: { services: [filesService(10), filesService(11)] } } as never)
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')

    emit('start-files-drop-install', { uploadItems: [new File(['x'], 'shop-site.zip')] })

    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.filesDropLaunch).toBe(false)
  })

  it('stops the super-quick polling once the flow closes (run watch)', async () => {
    vi.mocked(getSslCertificateDetected).mockResolvedValue(false)
    vi.mocked(getDomainResolved).mockResolvedValue(false)
    const onboarding = useOnboardingStore()
    onboarding.selectedService = redirectService as never
    onboarding.show('super-quick-progress')
    onboarding.newInstance = { id: 9 }

    emit('instance-installation-finished', { id: 9, domain: 'shop.pl', service_id: 3 })
    await vi.advanceTimersByTimeAsync(5000)
    const calls = vi.mocked(getSslCertificateDetected).mock.calls.length
    expect(calls).toBe(2)

    onboarding.deactivateAll()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(getSslCertificateDetected).toHaveBeenCalledTimes(calls)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves the store as it is for a finished event of another project', async () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')
    onboarding.newInstance = { id: 9 }

    emit('instance-installation-finished', { id: 10, domain: 'other.pl' })
    await vi.runAllTimersAsync()

    expect(onboarding.newInstance).toEqual({ id: 9 })
    expect(onboarding.installationCompleted).toBe(false)
    expect(onboarding.installationError).toBe(false)
  })

  it('leaves the store as it is for a failed event of another project', () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')
    onboarding.newInstance = { id: 9 }

    emit('instance-installation-failed', { id: 10 })

    expect(onboarding.newInstance).toEqual({ id: 9 })
    expect(onboarding.installationCompleted).toBe(false)
    expect(onboarding.installationError).toBe(false)
  })

  it('ignores a finished event while no instance is known yet', async () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')

    emit('instance-installation-finished', { id: 9, domain: 'shop.pl' })
    await vi.runAllTimersAsync()

    expect(onboarding.newInstance).toBeNull()
    expect(onboarding.installationCompleted).toBe(false)
  })

  it('does not start the super-quick polling for another project', async () => {
    vi.mocked(getSslCertificateDetected).mockResolvedValue(false)
    vi.mocked(getDomainResolved).mockResolvedValue(false)
    const onboarding = useOnboardingStore()
    onboarding.selectedService = redirectService as never
    onboarding.show('super-quick-progress')
    onboarding.newInstance = { id: 9 }

    emit('instance-installation-finished', { id: 10, domain: 'other.pl', service_id: 3 })
    await vi.advanceTimersByTimeAsync(5000)

    expect(getSslCertificateDetected).not.toHaveBeenCalled()
    expect(onboarding.installationCompleted).toBe(false)
  })
})
