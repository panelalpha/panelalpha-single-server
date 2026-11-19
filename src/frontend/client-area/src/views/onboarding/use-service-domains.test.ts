import type { OnboardingService } from './onboarding-service'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getServiceDomains } from './onboarding.api'
import { DOMAIN_SEARCH_DEBOUNCE_MS, useServiceDomains } from './use-service-domains'

vi.mock('./onboarding.api', () => ({
  getServiceDomains: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function service (id: number): OnboardingService {
  return { id, status: 'active' } as unknown as OnboardingService
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.mocked(getServiceDomains).mockReset()
  vi.mocked(getServiceDomains).mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

/** Runs the composable in its own scope, so `onScopeDispose` has one and the watchers stop with it. */
function setup (initial: OnboardingService | null = null) {
  const selected = ref<OnboardingService | null>(initial)
  const scope = effectScope()
  const api = scope.run(() => useServiceDomains(selected))!
  return { selected, api, scope }
}

describe('useServiceDomains', () => {
  it('loads the first page with an empty term when the service is selected', async () => {
    const { api, selected } = setup()
    selected.value = service(10)
    await vi.runOnlyPendingTimersAsync()
    expect(getServiceDomains).toHaveBeenCalledWith(10, '')
    expect(api.loading.value).toBe(false)
  })

  it('does nothing without a service id', async () => {
    setup(null)
    await vi.runOnlyPendingTimersAsync()
    expect(getServiceDomains).not.toHaveBeenCalled()
  })

  it('debounces a search: only the last term is requested, 300 ms after the last call', async () => {
    const { api } = setup(service(10))
    await vi.runOnlyPendingTimersAsync()
    vi.mocked(getServiceDomains).mockClear()

    api.search('a')
    vi.advanceTimersByTime(DOMAIN_SEARCH_DEBOUNCE_MS - 1)
    api.search('ab')
    vi.advanceTimersByTime(DOMAIN_SEARCH_DEBOUNCE_MS - 1)
    expect(getServiceDomains).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await vi.runOnlyPendingTimersAsync()
    expect(getServiceDomains).toHaveBeenCalledTimes(1)
    expect(getServiceDomains).toHaveBeenCalledWith(10, 'ab')
  })

  it('drops an answer that comes after a newer request started', async () => {
    const first = deferred<{ domain: string }[]>()
    const second = deferred<{ domain: string }[]>()
    vi.mocked(getServiceDomains)
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never)

    const { api } = setup(service(10))
    api.load('old')
    api.load('new')
    second.resolve([{ domain: 'new.pl' }])
    await second.promise
    await Promise.resolve()
    expect(api.domains.value).toEqual([{ domain: 'new.pl' }])

    first.resolve([{ domain: 'old.pl' }])
    await first.promise
    await Promise.resolve()
    expect(api.domains.value).toEqual([{ domain: 'new.pl' }])
  })

  it('drops an answer that comes after the service changed', async () => {
    const pending = deferred<{ domain: string }[]>()
    vi.mocked(getServiceDomains).mockReturnValueOnce(pending.promise as never)

    const { api, selected } = setup(service(10))
    api.load('')
    selected.value = service(20)
    pending.resolve([{ domain: 'stale.pl' }])
    await pending.promise
    await vi.runOnlyPendingTimersAsync()

    expect(api.domains.value).not.toContainEqual({ domain: 'stale.pl' })
  })

  it('clear empties the list and drops the request in flight', async () => {
    const pending = deferred<{ domain: string }[]>()
    vi.mocked(getServiceDomains).mockReturnValueOnce(pending.promise as never)

    const { api } = setup(service(10))
    await vi.runOnlyPendingTimersAsync()
    api.load('x')
    api.clear()
    pending.resolve([{ domain: 'late.pl' }])
    await pending.promise
    await Promise.resolve()

    expect(api.domains.value).toEqual([])
    expect(api.loading.value).toBe(false)
  })

  it('reload starts again from an empty term', async () => {
    const { api } = setup(service(10))
    await vi.runOnlyPendingTimersAsync()
    vi.mocked(getServiceDomains).mockClear()

    api.reload()
    await vi.runOnlyPendingTimersAsync()
    expect(getServiceDomains).toHaveBeenCalledWith(10, '')
  })

  it('a failed request becomes an alert and leaves the list as it was', async () => {
    const { api } = setup(service(10))
    await vi.runOnlyPendingTimersAsync()
    vi.mocked(getServiceDomains).mockRejectedValueOnce(new Error('boom'))

    await api.load('x')

    expect(api.domains.value).toEqual([])
    expect(api.loading.value).toBe(false)
    expect(useAlertsStore().activeAlerts).toHaveLength(1)
  })

  it('stops a pending search when the scope is disposed', async () => {
    const { api, scope } = setup(service(10))
    await vi.runOnlyPendingTimersAsync()
    vi.mocked(getServiceDomains).mockClear()

    api.search('later')
    scope.stop()
    await vi.runOnlyPendingTimersAsync()
    expect(getServiceDomains).not.toHaveBeenCalled()
  })
})
