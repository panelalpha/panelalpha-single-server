import { api } from '@/shared/api/client'

/** `GET /notifications` item (the Echo push has the same shape). */
export interface NotificationDto {
  [key: string]: unknown
  id: string | number
  type: string
  data: { [key: string]: unknown, html_text?: string | null }
  read_at: string | null
  created_at: string
}

export interface NotificationsPage {
  data: NotificationDto[]
  meta: { total: number }
}

// Query strings are built by hand, 1:1 with legacy: the page can be fractional after an Echo push (`page=2.1`).

export async function fetchNotifications (): Promise<NotificationsPage> {
  const { data } = await api.get<NotificationsPage>('/notifications')
  return data
}

/** `page` is `len / 10 + 1`, sent as is. */
export async function fetchNotificationsPage (page: number): Promise<NotificationsPage> {
  const { data } = await api.get<NotificationsPage>('/notifications?page=' + page)
  return data
}

export async function markNotificationsAsRead (readAt: string): Promise<void> {
  await api.put(`/notifications/mark-as-read?read_at=${readAt}`)
}

export async function deleteNotification (id: string | number): Promise<void> {
  await api.delete(`/notifications/${id}`)
}

export async function deleteAllNotifications (deleteAt: string): Promise<void> {
  await api.delete(`/notifications?delete_at=${deleteAt}`)
}
