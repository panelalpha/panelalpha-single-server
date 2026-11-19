import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fromNow } from '@/shared/time/from-now'
import {
  deleteAllNotifications,
  deleteNotification,
  fetchNotifications,
  fetchNotificationsPage,
  markNotificationsAsRead,
  type NotificationDto,
} from './notifications.api'

export interface NotificationItem extends NotificationDto {
  status: 'ok' | 'error'
  created_at_text: string
}

/** Maps a notification DTO to the item the dropdown lists. */
export function toNotificationItem (item: NotificationDto): NotificationItem {
  return {
    ...item,
    status: item.type.endsWith('_failed') ? 'error' : 'ok',
    created_at_text: fromNow(item.created_at),
  }
}

/**
 * The legacy quirks are kept on purpose and pinned in the tests:
 * `allNotificationsLoaded` is decided from the length before the response (it lags one fetch), the page after an Echo push
 * is fractional, an unknown id removes the last item, and delete-all is sent only for a non-empty list.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<NotificationDto[]>([])
  const total = ref(0)
  const allNotificationsLoaded = ref(false)

  const items = computed(() => notifications.value.map(item => toNotificationItem(item)))
  const hasUnread = computed(() => notifications.value.some(item => !item.read_at))

  // Bumped by `clear()` (sign-out): a response from before it is dropped, so a slow fetch cannot refill the list of the next
  // session. Legacy did not need it (it loaded once per page load); next loads after every sign-in.
  let generation = 0

  async function load () {
    const requestGeneration = generation
    const response = await fetchNotifications()
    if (requestGeneration !== generation) {
      return
    }
    notifications.value = response.data
    total.value = response.meta.total
  }

  function loadNextPage () {
    const numberOfNotifications = notifications.value.length
    const requestGeneration = generation

    void fetchNotificationsPage(numberOfNotifications / 10 + 1).then(response => {
      if (requestGeneration !== generation) {
        return
      }
      notifications.value = notifications.value.concat(response.data)
      total.value = response.meta.total
    }).catch(() => {})

    if (numberOfNotifications >= total.value) {
      allNotificationsLoaded.value = true
    }
  }

  /** The call is sent only when an unread item exists. */
  function readAll () {
    if (!hasUnread.value) {
      return
    }
    const time = new Date().toISOString()
    void markNotificationsAsRead(time).catch(() => {})
    notifications.value = notifications.value.map(item => ({ ...item, read_at: time }))
  }

  /** An unknown id gives `findIndex -1`, and `splice(-1, 1)` removes the last item. */
  function remove (id: string | number) {
    void deleteNotification(id).catch(() => {})
    const index = notifications.value.findIndex(item => String(item.id) === String(id))
    notifications.value.splice(index, 1)
    total.value--
  }

  /** The call is sent only when the list is not empty. */
  function removeAll () {
    if (notifications.value[0]) {
      void deleteAllNotifications(new Date().toISOString()).catch(() => {})
    }
    notifications.value = []
    total.value = 0
  }

  function addNotification (notification: NotificationDto) {
    notifications.value.unshift(notification)
    total.value++
  }

  /**
   * `allNotificationsLoaded` is reset too (legacy never needed to: it loaded once per page load),
   * otherwise a second sign-in without a reload would never page.
   */
  function clear () {
    generation++
    notifications.value = []
    total.value = 0
    allNotificationsLoaded.value = false
  }

  return {
    notifications,
    total,
    allNotificationsLoaded,
    items,
    hasUnread,
    load,
    loadNextPage,
    readAll,
    remove,
    removeAll,
    addNotification,
    clear,
  }
})
