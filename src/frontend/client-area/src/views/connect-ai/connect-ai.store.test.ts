import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/entities/mcp/mcp.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useConnectAiStore } from './connect-ai.store'

vi.mock('@/entities/mcp/mcp.api', () => ({ listTokens: vi.fn() }))

const active = { id: 1, name: 'A', last_used_at: null, revoked_at: null, created_at: '2026-10-05T10:00:00Z' }
const revoked = { ...active, id: 2, name: 'B', revoked_at: '2026-10-05T11:00:00Z' }

describe('useConnectAiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('hasActiveToken is true only while a token is not revoked', async () => {
    vi.mocked(api.listTokens).mockResolvedValue([revoked])
    const store = useConnectAiStore()
    await store.fetchTokens()
    expect(store.hasActiveToken).toBe(false)

    vi.mocked(api.listTokens).mockResolvedValue([revoked, active])
    await store.fetchTokens()
    expect(store.hasActiveToken).toBe(true)
  })

  it('fetchTokens makes a single request and toggles loading', async () => {
    vi.mocked(api.listTokens).mockResolvedValue([active])
    const store = useConnectAiStore()
    const pending = store.fetchTokens()
    expect(store.loading).toBe(true)
    await pending
    expect(store.loading).toBe(false)
    expect(api.listTokens).toHaveBeenCalledTimes(1)
    expect(store.tokens).toEqual([active])
  })

  it('an alerting fetch keeps the tokens and adds an error alert on failure', async () => {
    vi.mocked(api.listTokens).mockResolvedValueOnce([active])
    const store = useConnectAiStore()
    await store.fetchTokens()

    vi.mocked(api.listTokens).mockRejectedValueOnce({ response: { data: { message: 'Boom' } } })
    await store.fetchTokens({ alertOnError: true })

    expect(store.tokens).toEqual([active])
    const alerts = useAlertsStore()
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Boom' })
  })

  it('a silent fetch resets the tokens on failure (no active token) and shows no alert', async () => {
    vi.mocked(api.listTokens).mockResolvedValueOnce([active])
    const store = useConnectAiStore()
    await store.fetchTokens()
    expect(store.hasActiveToken).toBe(true)

    vi.mocked(api.listTokens).mockRejectedValueOnce(new Error('x'))
    await store.fetchTokens()

    expect(store.tokens).toEqual([])
    expect(store.hasActiveToken).toBe(false)
    expect(useAlertsStore().activeAlerts).toHaveLength(0)
  })

  describe('overlapping fetches', () => {
    function deferred<T> () {
      let resolve!: (value: T) => void
      let reject!: (reason: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }

    it('a late silent failure does not wipe the list a newer fetch wrote', async () => {
      const first = deferred<(typeof active)[]>()
      const second = deferred<(typeof active)[]>()
      vi.mocked(api.listTokens).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const store = useConnectAiStore()

      const silent = store.fetchTokens()
      const alerting = store.fetchTokens({ alertOnError: true })
      second.resolve([active])
      await alerting
      first.reject(new Error('late'))
      await silent

      expect(store.tokens).toEqual([active])
    })

    it('loading stays true until the latest request settles', async () => {
      const first = deferred<(typeof active)[]>()
      const second = deferred<(typeof active)[]>()
      vi.mocked(api.listTokens).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const store = useConnectAiStore()

      const older = store.fetchTokens()
      const newer = store.fetchTokens()
      first.resolve([revoked])
      await older
      expect(store.loading).toBe(true)
      expect(store.tokens).toEqual([])

      second.resolve([active])
      await newer
      expect(store.loading).toBe(false)
      expect(store.tokens).toEqual([active])
    })
  })
})
