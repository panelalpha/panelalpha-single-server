import type { AutoUpdatesBody, AutoUpdatesSettings } from './auto-updates.api'
import type { InstanceResource } from '@/entities/project/instance-resource'

// The pure parts of `data`, `computed` and `methods`: the options, the `v-if` of the WordPress card, the body of each
// save, the blocked-by list and the partial text. Lite sends neither `updater_blocked_by` nor `plugins`.

export interface AutoUpdateOption {
  value: number
  labelKey: string
}

/** The two WordPress core options in legacy order. The view translates `labelKey`. */
export const AUTO_UPDATE_OPTIONS: readonly AutoUpdateOption[] = [
  { value: 1, labelKey: 'heading.instance.advanced.autoUpdates.upgrade.option.latest' },
  { value: 2, labelKey: 'heading.instance.advanced.autoUpdates.upgrade.option.minor' },
]

export type AutoUpdateToggleField = 'auto_update' | 'auto_update_plugins' | 'auto_update_themes'

/** The card is shown only when `can_auto_updates.wordpress` is truthy. */
export function hasWordpressAutoUpdates (autoUpdates: InstanceResource['auto_updates']): boolean {
  return !!autoUpdates?.wordpress
}

/**
 * The full body from the current
 * state, with the toggled field reversed. `undefined` (an empty state) reverses to `1`, as legacy `!undefined ? 1 : 0` does.
 */
export function toggleBody (settings: AutoUpdatesSettings, field: AutoUpdateToggleField): AutoUpdatesBody {
  return {
    ...baseBody(settings),
    [field]: settings[field] ? 0 : 1,
  }
}

/** The full body with `auto_update` set to the selected option. */
export function selectBody (settings: AutoUpdatesSettings, value: number): AutoUpdatesBody {
  return {
    ...baseBody(settings),
    auto_update: value,
  }
}

/** App only (`updater_blocked_by`): the list of blocking constants, or `[]` when the field is missing or not a list. */
export function updaterBlockedBy (settings: AutoUpdatesSettings): string[] {
  return Array.isArray(settings.updater_blocked_by) ? settings.updater_blocked_by as string[] : []
}

/** App only (`plugins`): `'partial'` means only some plugins have auto-updates enabled. */
export function isPluginsPartial (settings: AutoUpdatesSettings): boolean {
  return settings.plugins === 'partial'
}

function baseBody (settings: AutoUpdatesSettings): AutoUpdatesBody {
  return {
    auto_update: settings.auto_update,
    auto_update_plugins: settings.auto_update_plugins,
    auto_update_themes: settings.auto_update_themes,
  }
}
