import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { echoClient } from '@/shared/realtime/echo-client'
import * as api from './notifications/notifications.api'
import { useNotificationsStore } from './notifications/notifications.store'
import { useShellSessionLifecycle, watchSessionLifecycle } from './session-lifecycle'

vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connect: vi.fn(), disconnect: vi.fn() } }))

vi.mock('./notifications/notifications.api', () => ({
  fetchNotifications: vi.fn(),
  fetchNotificationsPage: vi.fn(),
  markNotificationsAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
}))

function setup () {
  const user = ref<{ id: number } | null>(null)
  const onSignIn = vi.fn()
  const onSignOut = vi.fn()
  mount(defineComponent({
    setup () {
      watchSessionLifecycle(() => user.value, { onSignIn, onSignOut })
      return () => null
    },
  }))
  return { user, onSignIn, onSignOut }
}

describe('watchSessionLifecycle', () => {
  it('signs in on null -> user and out on user -> null', async () => {
    const { user, onSignIn, onSignOut } = setup()
    expect(onSignIn).not.toHaveBeenCalled()

    user.value = { id: 1 }
    await nextTick()
    expect(onSignIn).toHaveBeenCalledTimes(1)

    user.value = null
    await nextTick()
    expect(onSignOut).toHaveBeenCalledTimes(1)

    user.value = { id: 1 }
    await nextTick()
    expect(onSignIn).toHaveBeenCalledTimes(2)
  })

  it('ignores a swapped user object while signed in (a /home refresh)', async () => {
    const { user, onSignIn, onSignOut } = setup()
    user.value = { id: 1 }
    await nextTick()
    user.value = { id: 1 }
    await nextTick()

    expect(onSignIn).toHaveBeenCalledTimes(1)
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('treats a user that exists at setup as a sign-in (cold start with a session)', () => {
    const onSignIn = vi.fn()
    mount(defineComponent({
      setup () {
        watchSessionLifecycle(() => ({ id: 1 }), { onSignIn, onSignOut: vi.fn() })
        return () => null
      },
    }))

    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
})

describe('useShellSessionLifecycle', () => {
  const item = { id: 'a', type: 'x', data: {}, read_at: null, created_at: new Date().toISOString() }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.fetchNotifications).mockReset().mockResolvedValue({ data: [item], meta: { total: 1 } })
    vi.mocked(echoClient.connect).mockReset().mockResolvedValue(undefined)
    vi.mocked(echoClient.disconnect).mockReset()
  })

  // Idle time comes at once here; the deferred case has its own test below.
  const immediately = (run: () => void) => {
    run()
    return () => {}
  }

  function mountShell (user: () => unknown, idle: (run: () => void) => () => void = immediately) {
    mount(defineComponent({
      setup () {
        useShellSessionLifecycle(user, idle)
        return () => null
      },
    }))
  }

  it('loads notifications on every null -> user and clears them on user -> null', async () => {
    const user = ref<{ id: number } | null>(null)
    mountShell(() => user.value)
    const store = useNotificationsStore()
    expect(api.fetchNotifications).not.toHaveBeenCalled()

    user.value = { id: 1 }
    await vi.waitFor(() => expect(store.notifications).toHaveLength(1))
    expect(api.fetchNotifications).toHaveBeenCalledTimes(1)

    user.value = null
    await nextTick()
    expect(store.notifications).toEqual([])
    expect(store.total).toBe(0)

    user.value = { id: 1 }
    await vi.waitFor(() => expect(store.notifications).toHaveLength(1))
    expect(api.fetchNotifications).toHaveBeenCalledTimes(2)
  })

  it('loads on a cold start that already has a session', async () => {
    mountShell(() => ({ id: 1 }))

    await vi.waitFor(() => expect(useNotificationsStore().notifications).toHaveLength(1))
  })

  it('swallows a failed load', async () => {
    vi.mocked(api.fetchNotifications).mockRejectedValue(new Error('boom'))
    const user = ref<{ id: number } | null>(null)
    mountShell(() => user.value)

    user.value = { id: 1 }
    await nextTick()

    expect(api.fetchNotifications).toHaveBeenCalledTimes(1)
  })

  it('connects Echo on every null -> user and disconnects on user -> null', async () => {
    const user = ref<{ id: number } | null>(null)
    mountShell(() => user.value)
    expect(echoClient.connect).not.toHaveBeenCalled()

    user.value = { id: 1 }
    await nextTick()
    expect(echoClient.connect).toHaveBeenCalledTimes(1)
    expect(echoClient.disconnect).not.toHaveBeenCalled()

    user.value = null
    await nextTick()
    expect(echoClient.disconnect).toHaveBeenCalledTimes(1)

    user.value = { id: 1 }
    await nextTick()
    expect(echoClient.connect).toHaveBeenCalledTimes(2)
  })

  it('connects Echo in idle time and drops a pending connect on sign-out (audit A9)', async () => {
    const pending: Array<() => void> = []
    const cancelled = vi.fn()
    const idle = (run: () => void) => {
      pending.push(run)
      return cancelled
    }
    const user = ref<{ id: number } | null>(null)
    mountShell(() => user.value, idle)

    user.value = { id: 1 }
    await nextTick()
    expect(api.fetchNotifications).toHaveBeenCalledTimes(1)
    expect(echoClient.connect).not.toHaveBeenCalled()
    expect(pending).toHaveLength(1)

    user.value = null
    await nextTick()
    expect(cancelled).toHaveBeenCalledTimes(1)

    user.value = { id: 1 }
    await nextTick()
    pending.at(-1)!()
    expect(echoClient.connect).toHaveBeenCalledTimes(1)
  })

  it('hands Echo a handler that puts a pushed notification on the bell list', async () => {
    const user = ref<{ id: number } | null>(null)
    mountShell(() => user.value)
    user.value = { id: 1 }
    await vi.waitFor(() => expect(useNotificationsStore().notifications).toHaveLength(1))

    const options = vi.mocked(echoClient.connect).mock.calls[0][1]
    options!.addNotification!({ id: 'pushed', type: 'x', data: {} as never, read_at: null, created_at: new Date().toISOString() })

    expect(useNotificationsStore().notifications.map(n => n.id)).toEqual(['pushed', 'a'])
  })
})
