import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'

// The card colours. Pure function, so the card template only reads it. The description
// cut is shared with themes (`@/entities/project/wordpress-items`).

export interface PluginCardVariant {
  /** Active plugin: green top border. */
  green: boolean
  /** Active plugin with an update: red top border. */
  red: boolean
  /** Update icon and tooltip. */
  updateAvailable: boolean
}

export function pluginCardVariant (plugin: Pick<InstalledPlugin, 'status' | 'update'>): PluginCardVariant {
  const active = plugin.status === 'active'
  const updateAvailable = plugin.update === 'available'
  return { green: active, red: active && updateAvailable, updateAvailable }
}
