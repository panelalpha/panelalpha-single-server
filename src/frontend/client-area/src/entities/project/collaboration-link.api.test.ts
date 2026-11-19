import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getCollaborationLink } from './collaboration-link.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

describe('collaboration-link.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the top-level url of the collaboration link response', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { url: 'https://atarim.example.test/x' } })

    expect(await getCollaborationLink(9)).toBe('https://atarim.example.test/x')
    expect(api.get).toHaveBeenCalledWith('/instances/9/collaboration-link')
  })

  it('returns an empty string when the server sends no url', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { url: null } })
    expect(await getCollaborationLink(9)).toBe('')
  })

  it('rejects when the request fails', async () => {
    const failure = new Error('network')
    vi.mocked(api.get).mockRejectedValueOnce(failure)
    await expect(getCollaborationLink(9)).rejects.toBe(failure)
  })
})
