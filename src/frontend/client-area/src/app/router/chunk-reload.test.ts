import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  type ChunkReloadDeps,
  clearChunkReloadMark,
  installChunkReload,
  isChunkLoadError,
  isSameDocument,
  reloadOnChunkError,
} from './chunk-reload'

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: https://panel.test/assets/BillingView-abc123.js')

function memoryStorage (): Storage {
  const data = new Map<string, string>()
  return {
    get length () {
      return data.size
    },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

function makeDeps (overrides: Partial<ChunkReloadDeps> = {}) {
  const storage = memoryStorage()
  const clock = { value: 1_000_000 }
  const reload = vi.fn()
  const notifyBlocked = vi.fn()
  const clearNotice = vi.fn()
  const deps: ChunkReloadDeps = {
    storage: () => storage,
    now: () => clock.value,
    online: () => true,
    reload,
    notifyBlocked,
    clearNotice,
    ...overrides,
  }
  return { deps, storage, clock, reload, notifyBlocked, clearNotice }
}

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/A.js',
    'error loading dynamically imported module: https://x/assets/A.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/A.css',
    'Loading chunk 12 failed.',
  ])('recognises "%s"', message => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('recognises a ChunkLoadError by name', () => {
    const error = new Error('boom')
    error.name = 'ChunkLoadError'
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('leaves every other error alone', () => {
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false)
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('reloadOnChunkError', () => {
  let ctx: ReturnType<typeof makeDeps>

  beforeEach(() => {
    ctx = makeDeps()
  })

  it('reloads the target once and records the time', () => {
    expect(reloadOnChunkError(chunkError(), '/billing', ctx.deps)).toBe(true)
    expect(ctx.reload).toHaveBeenCalledExactlyOnceWith('/billing')
    expect(ctx.storage.getItem(CHUNK_RELOAD_KEY)).toBe('1000000')
  })

  it('does not reload again inside the window (no loop)', () => {
    reloadOnChunkError(chunkError(), '/billing', ctx.deps)
    ctx.clock.value += CHUNK_RELOAD_WINDOW_MS - 1

    expect(reloadOnChunkError(chunkError(), '/billing', ctx.deps)).toBe(false)
    expect(ctx.reload).toHaveBeenCalledTimes(1)
  })

  it('still blocks after a slow reload cycle (a minute on a slow link)', () => {
    reloadOnChunkError(chunkError(), '/billing', ctx.deps)
    ctx.clock.value += 60_000

    expect(reloadOnChunkError(chunkError(), '/billing', ctx.deps)).toBe(false)
    expect(ctx.reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again once the window has passed', () => {
    reloadOnChunkError(chunkError(), '/billing', ctx.deps)
    ctx.clock.value += CHUNK_RELOAD_WINDOW_MS

    expect(reloadOnChunkError(chunkError(), '/services', ctx.deps)).toBe(true)
    expect(ctx.reload).toHaveBeenLastCalledWith('/services')
  })

  it('ignores errors that are not chunk errors', () => {
    expect(reloadOnChunkError(new Error('Network Error'), '/billing', ctx.deps)).toBe(false)
    expect(ctx.reload).not.toHaveBeenCalled()
  })

  it('does not reload without a network', () => {
    const offline = makeDeps({ online: () => false })

    expect(reloadOnChunkError(chunkError(), '/billing', offline.deps)).toBe(false)
    expect(offline.reload).not.toHaveBeenCalled()
  })

  it('does not reload without storage, as the guard could not be kept', () => {
    const noStorage = makeDeps({ storage: () => null })

    expect(reloadOnChunkError(chunkError(), '/billing', noStorage.deps)).toBe(false)
    expect(noStorage.reload).not.toHaveBeenCalled()
  })

  it('does not reload when storage throws', () => {
    const broken = makeDeps({
      storage: () => ({
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('denied')
        },
      }) as unknown as Storage,
    })

    expect(reloadOnChunkError(chunkError(), '/billing', broken.deps)).toBe(false)
    expect(broken.reload).not.toHaveBeenCalled()
  })

  it('clears the mark', () => {
    reloadOnChunkError(chunkError(), '/billing', ctx.deps)
    clearChunkReloadMark(ctx.deps)

    expect(ctx.storage.getItem(CHUNK_RELOAD_KEY)).toBeNull()
  })
})

describe('isSameDocument', () => {
  const current = 'https://panel.test/billing?tab=a#top'

  it('is true for the same path and query, whatever the hash', () => {
    expect(isSameDocument('/billing?tab=a', current)).toBe(true)
    expect(isSameDocument('/billing?tab=a#other', current)).toBe(true)
  })

  it('is false for another path, query or origin', () => {
    expect(isSameDocument('/services', current)).toBe(false)
    expect(isSameDocument('/billing?tab=b', current)).toBe(false)
    expect(isSameDocument('https://other.test/billing?tab=a', current)).toBe(false)
  })
})

describe('installChunkReload on a router', () => {
  function build (deps: ChunkReloadDeps) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => null } },
        { path: '/ok', component: () => Promise.resolve({ render: () => null }) },
        { path: '/stale/:id', component: () => Promise.reject(chunkError()) },
        { path: '/broken', component: () => Promise.reject(new Error('Network Error')) },
      ],
    })
    installChunkReload(router, deps)
    return router
  }

  it('reloads the full URL of a route whose chunk is gone, once', async () => {
    const ctx = makeDeps()
    const router = build(ctx.deps)
    await router.push('/')

    await router.push('/stale/7?tab=a').catch(() => undefined)
    expect(ctx.reload).toHaveBeenCalledExactlyOnceWith('/stale/7?tab=a')

    // The reloaded page fails on the same chunk: the guard keeps it from looping.
    await router.push('/stale/7?tab=a').catch(() => undefined)
    expect(ctx.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload for an error that is not a chunk error', async () => {
    const ctx = makeDeps()
    const router = build(ctx.deps)
    await router.push('/')

    await router.push('/broken').catch(() => undefined)

    expect(ctx.reload).not.toHaveBeenCalled()
  })

  it('clears the mark after a navigation that succeeds, so a later deploy reloads once more', async () => {
    const ctx = makeDeps()
    const router = build(ctx.deps)
    await router.push('/')
    await router.push('/stale/1').catch(() => undefined)
    expect(ctx.storage.getItem(CHUNK_RELOAD_KEY)).not.toBeNull()

    await router.push('/ok')
    expect(ctx.storage.getItem(CHUNK_RELOAD_KEY)).toBeNull()

    await router.push('/stale/2').catch(() => undefined)
    expect(ctx.reload).toHaveBeenCalledTimes(2)
    expect(ctx.reload).toHaveBeenLastCalledWith('/stale/2')
  })

  describe('the notice when no reload happens', () => {
    it('tells the user when the loop guard blocks the reload', async () => {
      const ctx = makeDeps()
      const router = build(ctx.deps)
      await router.push('/')

      await router.push('/stale/7').catch(() => undefined)
      expect(ctx.reload).toHaveBeenCalledTimes(1)
      expect(ctx.notifyBlocked).not.toHaveBeenCalled()

      await router.push('/stale/7').catch(() => undefined)
      expect(ctx.reload).toHaveBeenCalledTimes(1)
      expect(ctx.notifyBlocked).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: expect.stringContaining('dynamically imported module') }))
    })

    it('tells the user without a network', async () => {
      const ctx = makeDeps({ online: () => false })
      const router = build(ctx.deps)
      await router.push('/')

      await router.push('/stale/1').catch(() => undefined)

      expect(ctx.reload).not.toHaveBeenCalled()
      expect(ctx.notifyBlocked).toHaveBeenCalledTimes(1)
    })

    it('tells the user without storage', async () => {
      const ctx = makeDeps({ storage: () => null })
      const router = build(ctx.deps)
      await router.push('/')

      await router.push('/stale/1').catch(() => undefined)

      expect(ctx.reload).not.toHaveBeenCalled()
      expect(ctx.notifyBlocked).toHaveBeenCalledTimes(1)
    })

    it('tells the user when storage throws', async () => {
      const ctx = makeDeps({
        storage: () => ({
          getItem: () => {
            throw new Error('denied')
          },
          setItem: () => {
            throw new Error('denied')
          },
        }) as unknown as Storage,
      })
      const router = build(ctx.deps)
      await router.push('/')

      await router.push('/stale/1').catch(() => undefined)

      expect(ctx.reload).not.toHaveBeenCalled()
      expect(ctx.notifyBlocked).toHaveBeenCalledTimes(1)
    })

    it('tells the user on the first navigation, when the screen would stay empty', async () => {
      const ctx = makeDeps({ online: () => false })
      const router = build(ctx.deps)

      await router.push('/stale/1').catch(() => undefined)

      expect(router.currentRoute.value.matched).toHaveLength(0)
      expect(ctx.notifyBlocked).toHaveBeenCalledTimes(1)
    })

    it('says nothing when the reload starts', async () => {
      const ctx = makeDeps()
      const router = build(ctx.deps)
      await router.push('/')

      await router.push('/stale/1').catch(() => undefined)

      expect(ctx.reload).toHaveBeenCalledTimes(1)
      expect(ctx.notifyBlocked).not.toHaveBeenCalled()
    })

    it('says nothing for an error that is not a chunk error', async () => {
      const ctx = makeDeps({ online: () => false })
      const router = build(ctx.deps)
      await router.push('/')

      await router.push('/broken').catch(() => undefined)

      expect(ctx.notifyBlocked).not.toHaveBeenCalled()
    })

    it('never reloads because of the notice', async () => {
      const ctx = makeDeps()
      const router = build(ctx.deps)
      await router.push('/')
      await router.push('/stale/1').catch(() => undefined)
      await router.push('/stale/1').catch(() => undefined)
      await router.push('/stale/2').catch(() => undefined)

      expect(ctx.reload).toHaveBeenCalledTimes(1)
      expect(ctx.notifyBlocked).toHaveBeenCalledTimes(2)
    })

    it('removes the notice after a navigation that succeeds, and not after one that fails', async () => {
      const ctx = makeDeps({ online: () => false })
      const router = build(ctx.deps)
      await router.push('/')
      ctx.clearNotice.mockClear()

      await router.push('/stale/1').catch(() => undefined)
      expect(ctx.clearNotice).not.toHaveBeenCalled()

      await router.push('/ok')
      expect(ctx.clearNotice).toHaveBeenCalledTimes(1)
    })
  })
})
