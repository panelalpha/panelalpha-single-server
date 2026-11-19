import { afterEach, describe, expect, it, vi } from 'vitest'
import { runWhenIdle } from './idle'

describe('runWhenIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('uses requestIdleCallback with the timeout, and cancels through cancelIdleCallback', () => {
    const request = vi.fn((_callback: () => void, _options?: { timeout: number }) => 7)
    const cancel = vi.fn()
    vi.stubGlobal('requestIdleCallback', request)
    vi.stubGlobal('cancelIdleCallback', cancel)
    const callback = vi.fn()

    const stop = runWhenIdle(callback, 1500)
    expect(request.mock.calls[0]![1]).toEqual({ timeout: 1500 })
    request.mock.calls[0]![0]()
    expect(callback).toHaveBeenCalledTimes(1)

    stop()
    expect(cancel).toHaveBeenCalledWith(7)
  })

  it('falls back to a timer where requestIdleCallback is missing', () => {
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.useFakeTimers()
    const callback = vi.fn()

    runWhenIdle(callback)
    vi.advanceTimersByTime(200)
    expect(callback).toHaveBeenCalledTimes(1)

    const late = vi.fn()
    const stop = runWhenIdle(late)
    stop()
    vi.advanceTimersByTime(1000)
    expect(late).not.toHaveBeenCalled()
  })
})
