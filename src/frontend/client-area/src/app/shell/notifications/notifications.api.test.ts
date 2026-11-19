import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  deleteAllNotifications,
  deleteNotification,
  fetchNotifications,
  fetchNotificationsPage,
  markNotificationsAsRead,
} from './notifications.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('notifications.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: { data: [], meta: { total: 0 } } })
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: {} })
    vi.mocked(api.delete).mockReset().mockResolvedValue({ data: {} })
  })

  it('GET /notifications returns the response body', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ id: 'a' }], meta: { total: 1 } } })

    await expect(fetchNotifications()).resolves.toEqual({ data: [{ id: 'a' }], meta: { total: 1 } })
    expect(api.get).toHaveBeenCalledWith('/notifications')
  })

  it('GET /notifications?page=N keeps a fractional page as is', async () => {
    await fetchNotificationsPage(2)
    await fetchNotificationsPage(2.1)

    expect(api.get).toHaveBeenNthCalledWith(1, '/notifications?page=2')
    expect(api.get).toHaveBeenNthCalledWith(2, '/notifications?page=2.1')
  })

  it('PUT /notifications/mark-as-read sends read_at in the query', async () => {
    await markNotificationsAsRead('2026-10-05T10:00:00.000Z')

    expect(api.put).toHaveBeenCalledWith('/notifications/mark-as-read?read_at=2026-10-05T10:00:00.000Z')
  })

  it('DELETE /notifications/{id}', async () => {
    await deleteNotification('abc')

    expect(api.delete).toHaveBeenCalledWith('/notifications/abc')
  })

  it('DELETE /notifications?delete_at=', async () => {
    await deleteAllNotifications('2026-10-05T10:00:00.000Z')

    expect(api.delete).toHaveBeenCalledWith('/notifications?delete_at=2026-10-05T10:00:00.000Z')
  })
})
