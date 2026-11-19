import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  forgetProjectSource,
  getProjectSource,
  PROJECT_SOURCE_TTL_MS,
  resetProjectSourceMemo,
} from './project-source.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn() },
}))

const source = { available: true, stack: { label: 'Node 20' }, database: null, last_deploy: null }

describe('project-source.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProjectSourceMemo()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gets the source endpoint of the instance and returns data.data', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: source } })

    expect(await getProjectSource(41)).toEqual(source)
    expect(api.get).toHaveBeenCalledWith('/instances/41/source')
  })

  it('shares one request within the 30 s memo window', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: source } })

    await getProjectSource(41)
    vi.advanceTimersByTime(PROJECT_SOURCE_TTL_MS - 1)
    await getProjectSource('41')

    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('bypasses the memo when fresh is requested', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: source } })
      .mockResolvedValueOnce({ data: { data: { ...source, available: false } } })

    await getProjectSource(41)
    expect(await getProjectSource(41, { fresh: true })).toEqual({ ...source, available: false })
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('requests again after the TTL has passed', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: source } })

    await getProjectSource(41)
    vi.advanceTimersByTime(PROJECT_SOURCE_TTL_MS)
    await getProjectSource(41)

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('does not remember a rejected request', async () => {
    const failure = new Error('network')
    vi.mocked(api.get)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ data: { data: source } })

    await expect(getProjectSource(41)).rejects.toBe(failure)
    await flushMicrotasks()

    expect(await getProjectSource(41)).toEqual(source)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('forgets the memo entry for an instance', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: source } })
      .mockResolvedValueOnce({ data: { data: null } })

    await getProjectSource(41)
    forgetProjectSource(41)

    expect(await getProjectSource(41)).toBeNull()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})

async function flushMicrotasks (): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}
