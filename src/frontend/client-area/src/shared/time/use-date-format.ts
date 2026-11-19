import type { DateValue, FormatDateOptions } from './date-format'
import { computed } from 'vue'
import { useSessionStore } from '@/shared/session/session.store'
import { formatDate } from './date-format'

// The format is read from `home.app.default_date_format` in the session. An explicit `format`
// option wins over the session value.
export function useDateFormat (): (value: DateValue, options?: FormatDateOptions) => string {
  const session = useSessionStore()
  const configured = computed(() => session.home?.app?.default_date_format)

  return (value, options = {}) => formatDate(value, { ...options, format: options.format ?? configured.value })
}
