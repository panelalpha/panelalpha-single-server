import type { MetricsPeriod } from '@/views/hosting/hosting.types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useMetricsRefresh } from './use-metrics-refresh'

function mountRefresh (load: (period: MetricsPeriod) => Promise<void>) {
  let api!: ReturnType<typeof useMetricsRefresh>
  const wrapper = mount(defineComponent({
    setup () {
      api = useMetricsRefresh(load)
      return () => null
    },
  }))
  return { wrapper, api }
}

describe('useMetricsRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads Live on mount and counts 5 → 0 after the response', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const { wrapper, api } = mountRefresh(load)
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenLastCalledWith('last-5-minutes')
    expect(api.fetching.value).toBe(false)
    expect(api.refreshIn.value).toBe(5)

    await vi.advanceTimersByTimeAsync(4000)
    expect(api.refreshIn.value).toBe(1)
    expect(load).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(load).toHaveBeenCalledTimes(2)
    expect(api.refreshIn.value).toBe(5)
    wrapper.unmount()
  })

  it('starts no request while the first one is still in flight (legacy fired one every second, audit D1)', async () => {
    let resolve!: () => void
    const load = vi.fn(() => new Promise<void>(r => {
      resolve = r
    }))
    const { wrapper, api } = mountRefresh(load)
    expect(api.fetching.value).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(1)
    expect(api.refreshIn.value).toBe(0)

    resolve()
    await flushPromises()
    expect(api.fetching.value).toBe(false)
    expect(api.refreshIn.value).toBe(5)
    wrapper.unmount()
  })

  it('holds the counter while the tab is hidden', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const { wrapper, api } = mountRefresh(load)
    await flushPromises()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.refreshIn.value).toBe(5)
    expect(load).toHaveBeenCalledTimes(1)

    visibility.mockReturnValue('visible')
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).toHaveBeenCalledTimes(2)
    visibility.mockRestore()
    wrapper.unmount()
  })

  it('stops polling outside Live and starts it again on return', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const { wrapper, api } = mountRefresh(load)
    await flushPromises()

    api.setPeriod('last-hour')
    await nextTick()
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith('last-hour')
    const calls = load.mock.calls.length

    await vi.advanceTimersByTimeAsync(20_000)
    expect(load).toHaveBeenCalledTimes(calls)

    api.setPeriod('last-5-minutes')
    await nextTick()
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith('last-5-minutes')
    await vi.advanceTimersByTimeAsync(5000)
    expect(load.mock.calls.length).toBeGreaterThan(calls + 1)
    wrapper.unmount()
  })

  it('loads last-12-hours without a counter or polling', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const { wrapper, api } = mountRefresh(load)
    await flushPromises()

    api.setPeriod('last-12-hours')
    await nextTick()
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith('last-12-hours')
    const calls = load.mock.calls.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(load).toHaveBeenCalledTimes(calls)
    wrapper.unmount()
  })

  it('clears the interval on unmount', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const { wrapper } = mountRefresh(load)
    await flushPromises()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
