import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessages } from '@/shared/api/error-message'

/** The messages of a failed load, without the `key: ` prefix `getErrorMessages` gives keyed ones. */
export function loadErrorMessages (error: unknown): string[] {
  const raw = (error as { response?: { data?: { errors?: unknown } } } | null | undefined)?.response?.data?.errors
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
    return getErrorMessages(error)
  }
  return Object.values(raw as Record<string, unknown>).flatMap(list => (Array.isArray(list) ? list : [list]).map(String))
}

/** The success toast. */
export function saved (t: (key: string) => string): void {
  useAlertsStore().addAlert({ success: true, successMessage: t('settings.saved') })
}
