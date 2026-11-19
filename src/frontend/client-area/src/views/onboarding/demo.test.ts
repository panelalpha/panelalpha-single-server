import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_EMAIL } from '@/shared/session/demo-mode'
import { autostartKey, clearAutostart, DEMO_INSTALL_DELAY_MS, demoSuccessMessage, isAutostartEnabled, isDemoAccount, scheduleDemoInstallation } from './demo'

const ORIGIN = 'https://client.example.com'

/** An in-memory storage with the two methods the demo helpers read and remove. */
function memoryStorage (initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key)
    },
  } as unknown as Storage
}

describe('isDemoAccount (legacy isDemo)', () => {
  it('is true only for the demo email', () => {
    expect(isDemoAccount(DEMO_EMAIL)).toBe(true)
    expect(isDemoAccount('demo@panelalpha.com')).toBe(true)
    expect(isDemoAccount('jane@example.com')).toBe(false)
    expect(isDemoAccount(null)).toBe(false)
    expect(isDemoAccount(undefined)).toBe(false)
  })
})

describe('autostart (legacy isAutoStartEnabled)', () => {
  it('uses the origin-scoped key', () => {
    expect(autostartKey(ORIGIN)).toBe('https://client.example.com-autostartInstallation')
  })

  it('is enabled for the demo account with the key set', () => {
    const storage = memoryStorage({ [autostartKey(ORIGIN)]: 'true' })
    expect(isAutostartEnabled(DEMO_EMAIL, ORIGIN, storage)).toBe(true)
  })

  it('is disabled for the demo account without the key', () => {
    expect(isAutostartEnabled(DEMO_EMAIL, ORIGIN, memoryStorage())).toBe(false)
  })

  it('is disabled for another account even with the key set', () => {
    const storage = memoryStorage({ [autostartKey(ORIGIN)]: 'true' })
    expect(isAutostartEnabled('jane@example.com', ORIGIN, storage)).toBe(false)
  })

  it('treats an empty stored value as no autostart (legacy truthy check)', () => {
    const storage = memoryStorage({ [autostartKey(ORIGIN)]: '' })
    expect(isAutostartEnabled(DEMO_EMAIL, ORIGIN, storage)).toBe(false)
  })

  it('reads as disabled when the storage throws (blocked site data)', () => {
    const storage = { getItem: () => {
      throw new Error('blocked')
    } } as unknown as Storage
    expect(isAutostartEnabled(DEMO_EMAIL, ORIGIN, storage)).toBe(false)
  })

  it('removes only the origin key when the user picks the process', () => {
    const storage = memoryStorage({ [autostartKey(ORIGIN)]: 'true' })
    clearAutostart(ORIGIN, storage)
    expect(storage.getItem(autostartKey(ORIGIN))).toBeNull()
  })

  it('does not throw when the storage blocks the removal', () => {
    const storage = { removeItem: () => {
      throw new Error('blocked')
    } } as unknown as Storage
    expect(() => clearAutostart(ORIGIN, storage)).not.toThrow()
  })
})

describe('scheduleDemoInstallation (legacy handleDemoInstallation)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function deps (inRun = () => true) {
    return {
      showProgress: vi.fn(),
      complete: vi.fn(),
      inRun,
    }
  }

  it('opens the progress at once and completes after 3000 ms with the success alert', async () => {
    const demo = deps()

    scheduleDemoInstallation(demo, 'shop')

    expect(demo.showProgress).toHaveBeenCalledTimes(1)
    expect(demo.complete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DEMO_INSTALL_DELAY_MS - 1)
    expect(demo.complete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(demo.complete).toHaveBeenCalledTimes(1)
    expect(demo.complete).toHaveBeenCalledWith('Instance "shop" installed successfully')
  })

  it('drops the result when the flow was closed or started again during the delay (run guard)', async () => {
    let run = 1
    const demo = deps(() => run === 1)

    scheduleDemoInstallation(demo, 'shop')
    run = 2
    await vi.advanceTimersByTimeAsync(DEMO_INSTALL_DELAY_MS)

    expect(demo.complete).not.toHaveBeenCalled()
  })

  it('makes no request: it only drives the progress and the result', async () => {
    const demo = deps()
    scheduleDemoInstallation(demo, null, 10)
    await vi.advanceTimersByTimeAsync(10)
    expect(demo.showProgress).toHaveBeenCalledTimes(1)
    expect(demo.complete).toHaveBeenCalledTimes(1)
  })
})

describe('demoSuccessMessage', () => {
  it('uses the English copy of legacy', () => {
    expect(demoSuccessMessage('shop')).toBe('Instance "shop" installed successfully')
  })
})
