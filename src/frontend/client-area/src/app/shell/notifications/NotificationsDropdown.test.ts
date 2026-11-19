import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountKit } from '@/test/mount-kit'
import * as api from './notifications.api'
import { useNotificationsStore } from './notifications.store'
import NotificationsDropdown from './NotificationsDropdown.vue'

vi.mock('./notifications.api', () => ({
  fetchNotifications: vi.fn(),
  fetchNotificationsPage: vi.fn(),
  markNotificationsAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
}))

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void
let observerCallback: ObserverCallback | null = null
let observed: Element[] = []

class IntersectionObserverStub {
  constructor (callback: ObserverCallback) {
    observerCallback = callback
  }

  observe (element: Element) {
    observed.push(element)
  }

  unobserve () {}
  disconnect () {}
}

function dto (id: string, readAt: string | null = '2026-10-05T09:00:00.000Z') {
  return {
    id,
    type: 'instance_created',
    data: { html_text: `<b>${id}</b> text` },
    read_at: readAt,
    created_at: new Date().toISOString(),
  }
}

describe('NotificationsDropdown', () => {
  let host: HTMLDivElement
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    observerCallback = null
    observed = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    vi.mocked(api.fetchNotificationsPage).mockReset().mockResolvedValue({ data: [], meta: { total: 0 } })
    vi.mocked(api.markNotificationsAsRead).mockReset().mockResolvedValue()
    vi.mocked(api.deleteNotification).mockReset().mockResolvedValue()
    vi.mocked(api.deleteAllNotifications).mockReset().mockResolvedValue()
    host = document.createElement('div')
    document.body.append(host)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    host.remove()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  async function open () {
    wrapper = await mountKit(NotificationsDropdown, { attachTo: host })
    await wrapper.get('[data-testid="shell-bell"]').trigger('click')
    await nextTick()
    await nextTick()
  }

  it('shows the empty state for an empty list', async () => {
    await open()

    expect(document.querySelector('[data-testid="shell-notifications-empty"]')).not.toBeNull()
    expect(document.body.textContent).toContain('message.emptyTable.notification.title')
  })

  it('renders the unread dot while an item is unread, and opening marks everything read once', async () => {
    const store = useNotificationsStore()
    store.notifications = [dto('a', null), dto('b')]
    wrapper = await mountKit(NotificationsDropdown, { attachTo: host })
    expect(wrapper.find('[data-testid="shell-bell-unread"]').exists()).toBe(true)

    await wrapper.get('[data-testid="shell-bell"]').trigger('click')
    await nextTick()

    expect(api.markNotificationsAsRead).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="shell-bell-unread"]').exists()).toBe(false)

    // Closing click: nothing unread any more, so no second request.
    await wrapper.get('[data-testid="shell-bell"]').trigger('click')
    await nextTick()
    expect(api.markNotificationsAsRead).toHaveBeenCalledTimes(1)
  })

  it('does not call mark-as-read when nothing is unread', async () => {
    useNotificationsStore().notifications = [dto('a')]

    await open()

    expect(api.markNotificationsAsRead).not.toHaveBeenCalled()
  })

  it('renders html_text, falls back to the type, and dismisses by item id', async () => {
    const store = useNotificationsStore()
    store.notifications = [dto('a'), { ...dto('b'), data: {} }]
    store.total = 2
    await open()

    const items = document.querySelectorAll('.notification')
    expect(items).toHaveLength(2)
    expect(items[0]!.querySelector('b')?.textContent).toBe('a')
    expect(items[1]!.textContent).toContain('instance_created')

    const dismiss = items[0]!.querySelector('.notification__info button') as HTMLButtonElement
    dismiss.click()
    await nextTick()

    expect(api.deleteNotification).toHaveBeenCalledWith('a')
    expect(store.notifications.map(item => item.id)).toEqual(['b'])
  })

  // The bell shows only an icon (plus the unread dot): it needs a name of its own (a11y).
  it('names the bell button', async () => {
    wrapper = await mountKit(NotificationsDropdown, { attachTo: host })

    expect(wrapper.get('[data-testid="shell-bell"]').attributes('aria-label')).toBe('button.notifications')
  })

  // The dismiss X is icon-only and its tooltip is a description, not a name (a11y).
  it('names the Dismiss button of a notification', async () => {
    useNotificationsStore().notifications = [dto('a')]
    await open()

    const dismiss = document.querySelector('.notification__info button')
    expect(dismiss?.getAttribute('aria-label')).toBe('button.dismiss')
  })

  it('clear all calls the store', async () => {
    const store = useNotificationsStore()
    store.notifications = [dto('a')]
    store.total = 1
    await open()

    const clear = document.querySelector('.notifications-manager__clear button') as HTMLButtonElement
    expect(clear.textContent).toContain('button.notification.clear')
    clear.click()
    await nextTick()

    expect(api.deleteAllNotifications).toHaveBeenCalledTimes(1)
    expect(store.notifications).toEqual([])
  })

  it('observes the load-more sentinel only from 10 items and loads the next page on intersection', async () => {
    const store = useNotificationsStore()
    store.notifications = Array.from({ length: 9 }, (_, i) => dto(`n${i}`))
    store.total = 30
    await open()
    expect(document.querySelector('.infinite-loader')).toBeNull()
    wrapper?.unmount()
    wrapper = null

    store.notifications = Array.from({ length: 10 }, (_, i) => dto(`n${i}`))
    await open()
    expect(document.querySelector('.infinite-loader')).not.toBeNull()
    expect(observed).toHaveLength(1)

    observerCallback?.([{ isIntersecting: false }])
    expect(api.fetchNotificationsPage).not.toHaveBeenCalled()
    observerCallback?.([{ isIntersecting: true }])
    expect(api.fetchNotificationsPage).toHaveBeenCalledWith(2)
  })

  it('hides the sentinel once allNotificationsLoaded is set', async () => {
    const store = useNotificationsStore()
    store.notifications = Array.from({ length: 10 }, (_, i) => dto(`n${i}`))
    store.allNotificationsLoaded = true
    await open()

    expect(document.querySelector('.infinite-loader')).toBeNull()
  })
})
