import type { OnboardingService } from './onboarding-service'
import { describe, expect, it, vi } from 'vitest'
import { handleAfterLogin } from './after-login'

const ORIGIN = 'https://panel.example.com'

const roomy: OnboardingService[] = [{ id: 1, status: 'active', instance_count: 0, instance_limit: 2 }]
const full: OnboardingService[] = [{ id: 1, status: 'active', instance_count: 2, instance_limit: 2 }]

function makeStorage (initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      data.delete(key)
    }),
  }
}

function makeDeps (overrides: Partial<Parameters<typeof handleAfterLogin>[0]> = {}, storage = makeStorage()) {
  return {
    origin: ORIGIN,
    storage,
    services: roomy,
    startInstallation: vi.fn(),
    creationTypeSelected: vi.fn(),
    startSync: vi.fn(),
    ...overrides,
  }
}

describe('handleAfterLogin', () => {
  it('opens Create with the after-login source for new-site and removes the key', () => {
    const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'new-site' })
    const deps = makeDeps({}, storage)

    expect(handleAfterLogin(deps)).toBe('new-site')

    expect(deps.startInstallation).toHaveBeenCalledTimes(1)
    expect(deps.creationTypeSelected).toHaveBeenCalledWith(0, { source: 'after-login' })
    expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
  })

  it('starts the installation before it selects the creation type', () => {
    const order: string[] = []
    const deps = makeDeps({
      startInstallation: vi.fn(() => order.push('start')),
      creationTypeSelected: vi.fn(() => order.push('creation')),
    }, makeStorage({ [`${ORIGIN}-redirect`]: 'new-site' }))

    handleAfterLogin(deps)

    expect(order).toEqual(['start', 'creation'])
  })

  it('opens Import for new-import', () => {
    const deps = makeDeps({}, makeStorage({ [`${ORIGIN}-redirect`]: 'new-import' }))

    expect(handleAfterLogin(deps)).toBe('new-import')

    expect(deps.startInstallation).toHaveBeenCalledTimes(1)
    expect(deps.creationTypeSelected).toHaveBeenCalledWith(1)
  })

  it('control-panel-upgrade starts the installation, drops the token and then starts the sync', () => {
    const storage = makeStorage({
      [`${ORIGIN}-redirect`]: 'control-panel-upgrade',
      [`${ORIGIN}-token`]: 'abc',
    })
    const order: string[] = []
    const deps = makeDeps({
      startInstallation: vi.fn(() => order.push('start')),
      startSync: vi.fn(() => order.push('sync')),
    }, storage)

    expect(handleAfterLogin(deps)).toBe('control-panel-upgrade')

    expect(deps.startInstallation).toHaveBeenCalledTimes(1)
    expect(deps.creationTypeSelected).not.toHaveBeenCalled()
    expect(deps.startSync).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['start', 'sync'])
    expect(storage.data.has(`${ORIGIN}-token`)).toBe(false)
    expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
  })

  it('control-panel-upgrade drops the sessionStorage token of the hand-over too', () => {
    const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'control-panel-upgrade', [`${ORIGIN}-token`]: 'legacy' })
    sessionStorage.setItem(`${ORIGIN}-token`, 'abc')
    const deps = makeDeps({}, storage)

    expect(handleAfterLogin(deps)).toBe('control-panel-upgrade')

    expect(sessionStorage.getItem(`${ORIGIN}-token`)).toBeNull()
    // The storage it was given (the browser's `localStorage`) loses the legacy copy as well.
    expect(storage.data.has(`${ORIGIN}-token`)).toBe(false)
  })

  it('control-panel-upgrade does not start the sync when the limit is reached', () => {
    const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'control-panel-upgrade', [`${ORIGIN}-token`]: 'abc' })
    const deps = makeDeps({ services: full }, storage)

    expect(handleAfterLogin(deps)).toBeNull()

    expect(deps.startSync).not.toHaveBeenCalled()
    expect(storage.data.has(`${ORIGIN}-token`)).toBe(true)
  })

  it('new-site and new-import do not start the sync', () => {
    const deps = makeDeps({}, makeStorage({ [`${ORIGIN}-redirect`]: 'new-import' }))

    handleAfterLogin(deps)

    expect(deps.startSync).not.toHaveBeenCalled()
  })

  it('does nothing but remove the key when the limit is reached', () => {
    const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'new-site' })
    const deps = makeDeps({ services: full }, storage)

    expect(handleAfterLogin(deps)).toBeNull()

    expect(deps.startInstallation).not.toHaveBeenCalled()
    expect(deps.creationTypeSelected).not.toHaveBeenCalled()
    expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
  })

  it('treats an empty service list as limit reached', () => {
    const deps = makeDeps({ services: [] }, makeStorage({ [`${ORIGIN}-redirect`]: 'new-import' }))

    expect(handleAfterLogin(deps)).toBeNull()
    expect(deps.creationTypeSelected).not.toHaveBeenCalled()
  })

  it('leaves the flow alone without a redirect key', () => {
    const deps = makeDeps()

    expect(handleAfterLogin(deps)).toBeNull()
    expect(deps.startInstallation).not.toHaveBeenCalled()
  })

  it('ignores an unknown redirect value and still removes the key', () => {
    const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'something-else' })
    const deps = makeDeps({}, storage)

    expect(handleAfterLogin(deps)).toBeNull()

    expect(deps.startInstallation).not.toHaveBeenCalled()
    expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
  })

  it('does nothing when storage is blocked', () => {
    const deps = makeDeps({ storage: null })

    expect(handleAfterLogin(deps)).toBeNull()
    expect(deps.startInstallation).not.toHaveBeenCalled()
  })

  it('removes the key even when the flow throws', () => {
    const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'new-site' })
    const deps = makeDeps({
      creationTypeSelected: vi.fn(() => {
        throw new Error('boom')
      }),
    }, storage)

    expect(() => handleAfterLogin(deps)).toThrow('boom')
    expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
  })

  describe('forced install (LITE shouldForceInstallAfterLogin)', () => {
    const forced: OnboardingService[] = [{ id: 1, status: 'active', force_install: true, instance_count: 0, instance_limit: 2 }]
    const forcedNoRoom: OnboardingService[] = [{ id: 1, status: 'active', force_install: true, instance_count: 0, instance_limit: 0 }]

    it('opens Create with the after-login source when no redirect is stored and the service forces the install', () => {
      const storage = makeStorage()
      const deps = makeDeps({ services: forced }, storage)

      expect(handleAfterLogin(deps)).toBe('force-install')

      expect(deps.startInstallation).toHaveBeenCalledTimes(1)
      expect(deps.creationTypeSelected).toHaveBeenCalledWith(0, { source: 'after-login' })
      expect(deps.startSync).not.toHaveBeenCalled()
    })

    it('treats an empty redirect value as no redirect', () => {
      const storage = makeStorage({ [`${ORIGIN}-redirect`]: '' })
      const deps = makeDeps({ services: forced }, storage)

      expect(handleAfterLogin(deps)).toBe('force-install')
      expect(deps.creationTypeSelected).toHaveBeenCalledWith(0, { source: 'after-login' })
      expect(storage.removeItem).toHaveBeenCalledWith(`${ORIGIN}-redirect`)
      expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
    })

    it('does nothing when the limit is reached, even if the service forces the install', () => {
      const storage = makeStorage()
      const deps = makeDeps({ services: forcedNoRoom }, storage)

      expect(handleAfterLogin(deps)).toBeNull()

      expect(deps.startInstallation).not.toHaveBeenCalled()
      expect(deps.creationTypeSelected).not.toHaveBeenCalled()
    })

    it('does nothing when the forcing service already has an instance', () => {
      const deps = makeDeps({
        services: [{ id: 1, status: 'active', force_install: true, instance_count: 1, instance_limit: 2 }],
      })

      expect(handleAfterLogin(deps)).toBeNull()
      expect(deps.startInstallation).not.toHaveBeenCalled()
    })

    it('does nothing when the forcing service is not active', () => {
      const deps = makeDeps({
        services: [{ id: 1, status: 'suspended', force_install: true, instance_count: 0, instance_limit: 2 }],
      })

      expect(handleAfterLogin(deps)).toBeNull()
      expect(deps.creationTypeSelected).not.toHaveBeenCalled()
    })

    it('does nothing when no service forces the install', () => {
      const deps = makeDeps({ services: roomy })

      expect(handleAfterLogin(deps)).toBeNull()
      expect(deps.startInstallation).not.toHaveBeenCalled()
    })

    it('does nothing when storage is blocked', () => {
      const deps = makeDeps({ services: forced, storage: null })

      expect(handleAfterLogin(deps)).toBeNull()
      expect(deps.creationTypeSelected).not.toHaveBeenCalled()
    })

    it('an unknown redirect value blocks the forced install and is still removed', () => {
      const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'something-else' })
      const deps = makeDeps({ services: forced }, storage)

      expect(handleAfterLogin(deps)).toBeNull()

      expect(deps.creationTypeSelected).not.toHaveBeenCalled()
      expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
    })

    it('a stored redirect wins over the forced install', () => {
      const storage = makeStorage({ [`${ORIGIN}-redirect`]: 'new-import' })
      const deps = makeDeps({ services: forced }, storage)

      expect(handleAfterLogin(deps)).toBe('new-import')

      expect(deps.creationTypeSelected).toHaveBeenCalledTimes(1)
      expect(deps.creationTypeSelected).toHaveBeenCalledWith(1)
      expect(storage.data.has(`${ORIGIN}-redirect`)).toBe(false)
    })

    it('removes the key on the forced path even when the flow throws', () => {
      const storage = makeStorage({ [`${ORIGIN}-redirect`]: '' })
      const deps = makeDeps({
        services: forced,
        creationTypeSelected: vi.fn(() => {
          throw new Error('boom')
        }),
      }, storage)

      expect(() => handleAfterLogin(deps)).toThrow('boom')
      expect(storage.removeItem).toHaveBeenCalledWith(`${ORIGIN}-redirect`)
    })
  })
})
