import type { WordpressConfigItem } from './wordpress-config.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// Shared by the desktop table, the mobile card, the sort header and the view, so the keys live in one place.

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** Columns in legacy order. `text` is the legacy header name, `label` the translated title that `TableCustomSort` shows. */
export function configsHeaders (t: Translate): LegacySortHeader[] {
  return [
    { text: 'name', label: t('table.header.name'), value: 'name', sortable: true },
    { text: 'value', label: t('table.header.value'), value: 'value', sortable: true },
    { text: 'type', label: t('table.header.type'), value: 'type', sortable: true },
    { text: '', label: '', value: 'actions', sortable: false },
  ]
}

/** The columns the search reads (legacy `searchable: true`). `type` is not searched. */
export const CONFIGS_SEARCH_KEYS = ['name', 'value']

/**
 * Legacy sorts with `toString().localeCompare(...)`, so values sort as text ("10" before "2"). A `null` name or value
 * (the engine allows it) must not throw, so it compares as an empty string.
 */
function compareAsText (a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''))
}

export const CONFIGS_CUSTOM_KEY_SORT: Record<string, (a: unknown, b: unknown) => number> = {
  name: compareAsText,
  value: compareAsText,
  type: compareAsText,
}

/** The name, or `---` when it is empty (desktop only; the mobile card shows the raw name). */
export function displayConfigName (item: Pick<WordpressConfigItem, 'name'>): string {
  return item.name || '---'
}

/** Value cell: `---` only for a missing value (`null`, `''`), a bullet mask for `secret`, the value as text otherwise. */
export function displayConfigValue (item: Pick<WordpressConfigItem, 'value' | 'type'>): string {
  const value = item.value
  if (value === '' || value == null) {
    return '---'
  }

  const text = typeof value === 'string' ? value : String(value)
  if (item.type === 'secret') {
    return '•'.repeat(text.length + 1)
  }

  return text
}
