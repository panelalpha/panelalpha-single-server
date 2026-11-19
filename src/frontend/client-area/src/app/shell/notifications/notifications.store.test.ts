import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './notifications.api'
import { toNotificationItem, useNotificationsStore } from './notifications.store'

vi.mock('./notifications.api', () => ({
  fetchNotifications: vi.fn(),
  fetchNotificationsPage: vi.fn(),
  markNotificationsAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
}))

function dto (id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'instance_created',
    data: { html_text: `<b>${id}</b>` },
    read_at: '2026-10-05T09:00:00.000Z' as string | null,
    created_at: '2026-10-05T09:00:00.000Z',
    ...overrides,
  }
}

function many (count: number, prefix = 'n') {
  return Array.from({ length: count }, (_, i) => dto(`${prefix}${i}`))
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('notifications store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.fetchNotifications).mockReset().mockResolvedValue({ data: [], meta: { total: 0 } })
    vi.mocked(api.fetchNotificationsPage).mockReset().mockResolvedValue({ data: [], meta: { total: 0 } })
    vi.mocked(api.markNotificationsAsRead).mockReset().mockResolvedValue()
    vi.mocked(api.deleteNotification).mockReset().mockResolvedValue()
    vi.mocked(api.deleteAllNotifications).mockReset().mockResolvedValue()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('mapping', () => {
    it('status is error only for types ending with _failed', () => {
      expect(toNotificationItem(dto('a', { type: 'backup_create_failed' })).status).toBe('error')
      expect(toNotificationItem(dto('a', { type: 'backup_failed_later' })).status).toBe('ok')
      expect(toNotificationItem(dto('a')).status).toBe('ok')
    })

    it('created_at_text is the relative time of created_at', () => {
      const created = new Date(Date.now() - 5 * 60_000).toISOString()

      expect(toNotificationItem(dto('a', { created_at: created })).created_at_text).toBe('5 minutes ago')
    })
  })

  describe('load', () => {
    it('GET /notifications fills the list and the total', async () => {
      vi.mocked(api.fetchNotifications).mockResolvedValue({ data: many(3), meta: { total: 25 } })
      const store = useNotificationsStore()

      await store.load()

      expect(store.notifications).toHaveLength(3)
      expect(store.total).toBe(25)
      expect(store.items[0]!.status).toBe('ok')
    })
  })

  describe('paging', () => {
    it('asks for page len / 10 + 1 and appends the result', async () => {
      const store = useNotificationsStore()
      vi.mocked(api.fetchNotifications).mockResolvedValue({ data: many(10), meta: { total: 25 } })
      await store.load()
      vi.mocked(api.fetchNotificationsPage).mockResolvedValue({ data: many(10, 'p'), meta: { total: 26 } })

      store.loadNextPage()
      await flush()

      expect(api.fetchNotificationsPage).toHaveBeenCalledWith(2)
      expect(store.notifications).toHaveLength(20)
      expect(store.total).toBe(26)
      expect(store.allNotificationsLoaded).toBe(false)
    })

    it('allNotificationsLoaded lags one fetch: it compares the length before the response with the total', async () => {
      const store = useNotificationsStore()
      vi.mocked(api.fetchNotifications).mockResolvedValue({ data: many(10), meta: { total: 15 } })
      await store.load()
      vi.mocked(api.fetchNotificationsPage).mockResolvedValue({ data: many(5, 'p'), meta: { total: 15 } })

      store.loadNextPage()
      await flush()
      // All 15 are in the list now, but the flag was decided from 10 >= 15 before the response.
      expect(store.notifications).toHaveLength(15)
      expect(store.allNotificationsLoaded).toBe(false)

      store.loadNextPage()
      expect(store.allNotificationsLoaded).toBe(true)
    })

    it('after an Echo push the page is fractional and is sent that way', async () => {
      const store = useNotificationsStore()
      vi.mocked(api.fetchNotifications).mockResolvedValue({ data: many(10), meta: { total: 30 } })
      await store.load()
      store.addNotification(dto('pushed'))

      store.loadNextPage()

      expect(api.fetchNotificationsPage).toHaveBeenCalledWith(11 / 10 + 1)
      expect(11 / 10 + 1).toBe(2.1)
    })
  })

  describe('readAll', () => {
    it('sends PUT mark-as-read with read_at and marks every item when one is unread', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'))
      const store = useNotificationsStore()
      store.notifications = [dto('a', { read_at: null }), dto('b')]

      store.readAll()

      expect(api.markNotificationsAsRead).toHaveBeenCalledWith('2026-10-05T10:00:00.000Z')
      expect(store.notifications.every(item => item.read_at === '2026-10-05T10:00:00.000Z')).toBe(true)
      expect(store.hasUnread).toBe(false)
    })

    it('sends nothing when every item is read, or the list is empty', () => {
      const store = useNotificationsStore()
      store.readAll()
      store.notifications = [dto('a'), dto('b')]
      store.readAll()

      expect(api.markNotificationsAsRead).not.toHaveBeenCalled()
      expect(store.notifications[0]!.read_at).toBe('2026-10-05T09:00:00.000Z')
    })
  })

  describe('remove', () => {
    it('sends DELETE /notifications/{id}, drops the item and decrements the total', () => {
      const store = useNotificationsStore()
      store.notifications = [dto('a'), dto('b'), dto('c')]
      store.total = 3

      store.remove('b')

      expect(api.deleteNotification).toHaveBeenCalledWith('b')
      expect(store.notifications.map(item => item.id)).toEqual(['a', 'c'])
      expect(store.total).toBe(2)
    })

    it('an unknown id removes the last item (legacy indexOf -1 splice)', () => {
      const store = useNotificationsStore()
      store.notifications = [dto('a'), dto('b'), dto('c')]
      store.total = 3

      store.remove('missing')

      expect(api.deleteNotification).toHaveBeenCalledWith('missing')
      expect(store.notifications.map(item => item.id)).toEqual(['a', 'b'])
      expect(store.total).toBe(2)
    })
  })

  describe('removeAll', () => {
    it('sends DELETE /notifications?delete_at= and empties the list', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'))
      const store = useNotificationsStore()
      store.notifications = [dto('a')]
      store.total = 40

      store.removeAll()

      expect(api.deleteAllNotifications).toHaveBeenCalledWith('2026-10-05T10:00:00.000Z')
      expect(store.notifications).toEqual([])
      expect(store.total).toBe(0)
    })

    it('does not call the API when the list is already empty', () => {
      const store = useNotificationsStore()
      store.total = 5

      store.removeAll()

      expect(api.deleteAllNotifications).not.toHaveBeenCalled()
      expect(store.total).toBe(0)
    })
  })

  describe('addNotification and clear', () => {
    it('addNotification puts the push first and counts it', () => {
      const store = useNotificationsStore()
      store.notifications = [dto('a')]
      store.total = 1

      store.addNotification(dto('pushed', { read_at: null }))

      expect(store.notifications.map(item => item.id)).toEqual(['pushed', 'a'])
      expect(store.total).toBe(2)
      expect(store.hasUnread).toBe(true)
    })

    it('clear empties the list, the total and the paging flag', () => {
      const store = useNotificationsStore()
      store.notifications = [dto('a')]
      store.total = 1
      store.allNotificationsLoaded = true

      store.clear()

      expect(store.notifications).toEqual([])
      expect(store.total).toBe(0)
      expect(store.allNotificationsLoaded).toBe(false)
    })

    it('a load still in flight when clear runs (sign-out) does not refill the list', async () => {
      let resolve!: (value: Awaited<ReturnType<typeof api.fetchNotifications>>) => void
      vi.mocked(api.fetchNotifications).mockReturnValue(new Promise(r => {
        resolve = r
      }))
      const store = useNotificationsStore()

      const pending = store.load()
      store.clear()
      resolve({ data: many(3), meta: { total: 3 } })
      await pending

      expect(store.notifications).toEqual([])
      expect(store.total).toBe(0)
    })

    it('a next page still in flight when clear runs does not append to the list', async () => {
      let resolve!: (value: Awaited<ReturnType<typeof api.fetchNotificationsPage>>) => void
      vi.mocked(api.fetchNotificationsPage).mockReturnValue(new Promise(r => {
        resolve = r
      }))
      const store = useNotificationsStore()
      store.notifications = many(10)
      store.total = 20

      store.loadNextPage()
      store.clear()
      resolve({ data: many(10, 'p'), meta: { total: 20 } })
      await flush()

      expect(store.notifications).toEqual([])
      expect(store.total).toBe(0)
    })
  })
})
