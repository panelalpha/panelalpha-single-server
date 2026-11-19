import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { cachedGet, clearAllCachedGet, clearCachedGet, clearCachedGetByPrefix } from './cached-get'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
  },
}))

const START = new Date('2026-10-08T12:00:00Z')

describe('cachedGet', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
    vi.clearAllMocks()
    clearAllCachedGet()
    vi.mocked(api.get).mockImplementation(async url => ({ data: { url } }) as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function advanceSeconds (seconds: number) {
    vi.setSystemTime(new Date(START.getTime() + seconds * 1000))
  }

  it('returns the cached promise on a hit and forwards url and config to api.get', async () => {
    const config = { params: { page: 2 } }
    const first = cachedGet('/labels', undefined, config)
    const second = cachedGet('/labels')

    expect(second).toBe(first)
    expect((await first).data).toEqual({ url: '/labels' })
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/labels', config)
  })

  it('uses 36000 seconds by default and refetches once the entry is older than that', async () => {
    await cachedGet('/home')

    advanceSeconds(36_000)
    await cachedGet('/home')
    expect(api.get).toHaveBeenCalledTimes(1)

    advanceSeconds(36_001)
    await cachedGet('/home')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('treats null as the default TTL', async () => {
    await cachedGet('/home', null)
    advanceSeconds(36_000)
    await cachedGet('/home', null)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('honours an explicit TTL', async () => {
    await cachedGet('/x', 10)
    advanceSeconds(10)
    await cachedGet('/x', 10)
    expect(api.get).toHaveBeenCalledTimes(1)

    advanceSeconds(11)
    await cachedGet('/x', 10)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('with 0 fetches again on the next second, but not within the same second', async () => {
    await cachedGet('/home', 0)
    advanceSeconds(0.5)
    await cachedGet('/home', 0)
    expect(api.get).toHaveBeenCalledTimes(1)

    advanceSeconds(1)
    await cachedGet('/home', 0)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('a 0 call overwrites the entry, so a later default call reads it', async () => {
    await cachedGet('/server-accounts/3/domains')

    advanceSeconds(1000)
    await cachedGet('/server-accounts/3/domains', 0)
    expect(api.get).toHaveBeenCalledTimes(2)

    advanceSeconds(1001)
    await cachedGet('/server-accounts/3/domains')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('drops a rejected request so the next call retries (deliberate departure from legacy)', async () => {
    const error = new Error('Server Error')
    vi.mocked(api.get).mockRejectedValueOnce(error)

    await expect(cachedGet('/server-accounts/1/mysql/server-info')).rejects.toBe(error)

    expect((await cachedGet('/server-accounts/1/mysql/server-info')).data).toEqual({ url: '/server-accounts/1/mysql/server-info' })
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('a late rejection does not drop the newer request that replaced it', async () => {
    let reject!: (error: Error) => void
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((_, r) => {
      reject = r
    }))

    const first = cachedGet('/x', 0)
    advanceSeconds(1)
    const second = cachedGet('/x', 0)
    reject(new Error('late'))
    await expect(first).rejects.toThrow('late')

    expect(cachedGet('/x', 0)).toBe(second)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('clearCachedGet drops only that url', async () => {
    await cachedGet('/labels')
    await cachedGet('/home')

    clearCachedGet('/labels')
    await cachedGet('/labels')
    await cachedGet('/home')

    expect(api.get).toHaveBeenCalledTimes(3)
    expect(vi.mocked(api.get).mock.calls.map(call => call[0])).toEqual(['/labels', '/home', '/labels'])
  })

  it('clearCachedGetByPrefix drops the entries under the prefix only', async () => {
    await cachedGet('/a/1')
    await cachedGet('/a/2')
    await cachedGet('/b/1')

    clearCachedGetByPrefix('/a/')
    await cachedGet('/a/1')
    await cachedGet('/a/2')
    await cachedGet('/b/1')

    expect(api.get).toHaveBeenCalledTimes(5)
  })

  it('clearAllCachedGet drops every url', async () => {
    await cachedGet('/labels')
    await cachedGet('/home')

    clearAllCachedGet()
    await cachedGet('/labels')
    await cachedGet('/home')

    expect(api.get).toHaveBeenCalledTimes(4)
  })
})
