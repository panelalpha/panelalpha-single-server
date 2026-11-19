import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { assignLabel, createLabel, deleteLabel, getLabels, unassignLabel } from './labels.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    defaults: { baseURL: '/api' },
  },
  apiBaseUrl: () => '/api',
}))

describe('labels.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getLabels', () => {
    it('caches GET /labels for 36000 seconds', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
      vi.mocked(api.get).mockResolvedValue({ data: { data: [{ title: 'Prod', color: '#fff', in_use: true }] } })

      const first = await getLabels()
      const second = await getLabels()
      expect(first).toEqual([{ title: 'Prod', color: '#fff', in_use: true }])
      expect(second).toEqual(first)
      expect(api.get).toHaveBeenCalledTimes(1)
      expect(api.get).toHaveBeenCalledWith('/labels', undefined)

      vi.setSystemTime(new Date('2026-10-05T22:00:02Z'))
      await getLabels()
      expect(api.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('label mutations', () => {
    it('createLabel posts the new label to /labels', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ data: { title: 'Prod', color: '#07C07E' } })

      await expect(createLabel({ title: 'Prod', color: '#07C07E' })).resolves.toEqual({ title: 'Prod', color: '#07C07E' })
      expect(api.post).toHaveBeenCalledWith('/labels', { title: 'Prod', color: '#07C07E' })
    })

    it('assignLabel posts the label as the body of /instances/{id}/labels', async () => {
      const label = { id: 3, title: 'Prod', color: '#07C07E' }
      vi.mocked(api.post).mockResolvedValueOnce({ data: label })

      await assignLabel(7, label)
      expect(api.post).toHaveBeenCalledWith('/instances/7/labels', label)
    })

    it('unassignLabel sends the label as { data } of a DELETE and returns the body with in_use', async () => {
      const label = { title: 'Prod', color: '#07C07E' }
      vi.mocked(api.delete).mockResolvedValueOnce({ data: { title: 'Prod', in_use: false } })

      await expect(unassignLabel(7, label)).resolves.toEqual({ title: 'Prod', in_use: false })
      expect(api.delete).toHaveBeenCalledWith('/instances/7/labels', { data: label })
    })

    it('deleteLabel sends the label as { data } of a DELETE to /labels', async () => {
      const label = { id: 3, title: 'Prod', color: '#07C07E' }
      vi.mocked(api.delete).mockResolvedValueOnce({ data: {} })

      await deleteLabel(label)
      expect(api.delete).toHaveBeenCalledWith('/labels', { data: label })
    })

    it('rejects when the server fails, so the caller can read the message', async () => {
      const failure = { response: { data: { message: 'Label is in use' } } }
      vi.mocked(api.post).mockRejectedValueOnce(failure)

      await expect(assignLabel(7, { title: 'Prod' })).rejects.toBe(failure)
    })
  })
})
