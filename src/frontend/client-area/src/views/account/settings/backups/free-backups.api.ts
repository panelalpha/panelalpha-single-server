import type { BackupDefaultsPayload } from './backup-defaults'
import { api } from '@/shared/api/client'

// The bodies are flat: legacy reads `response.data`.

export interface FreeBackupStore {
  id: number
  name: string
  driver: string
  location: string
}

/** What happened to the store the panel had chosen when it was replaced or removed. */
export interface FreeBackupCleanup {
  id: number
  container: 'deleted' | 'kept'
  reason: 'in_use' | 'not_ours' | 'error' | null
}

/** The default schedule for new projects. `hour`, `day_of_week` and `day_of_month` are UTC. */
export interface FreeBackupDefaults {
  auto_enable: boolean
  frequency: string
  hour: number | null
  day_of_week: number | null
  day_of_month: number | null
  keep_last: number
}

export interface FreeBackups {
  store: FreeBackupStore | null
  /** The owner chose the store in the panel; the Engine's own store is not a choice. */
  store_selected?: boolean
  /** The chosen store's Engine container was made by this panel (only such a one is ever deleted). */
  store_created?: boolean
  defaults: FreeBackupDefaults
  drivers?: string[]
  default_local_location?: string
}

/** A store write or remove answers the settings with what happened to the previous store. */
export interface FreeBackupsChange extends FreeBackups {
  cleanup: FreeBackupCleanup | null
}

export interface FreeBackupStoreUpdate {
  driver: string
  location: string
  credentials?: Record<string, unknown>
}

/** `GET /community/backups` (calls the Engine, so it may fail while the settings load). */
export async function getFreeBackups (): Promise<FreeBackups> {
  const { data } = await api.get<FreeBackups>('/community/backups')
  return data
}

/** `PUT /community/backups`: the default schedule, in UTC. Takes the camelCase `payload()` of the form, the body is snake_case. */
export async function updateFreeBackups (payload: BackupDefaultsPayload): Promise<{ defaults: FreeBackupDefaults }> {
  const { data } = await api.put<{ defaults: FreeBackupDefaults }>('/community/backups', {
    auto_enable: payload.autoEnable,
    frequency: payload.frequency,
    hour: payload.hour,
    day_of_week: payload.dayOfWeek,
    day_of_month: payload.dayOfMonth,
    keep_last: payload.keepLast,
  })
  return data
}

/** `PUT /community/backups/store`. */
export async function updateFreeBackupStore ({ driver, location, credentials }: FreeBackupStoreUpdate): Promise<FreeBackupsChange> {
  const { data } = await api.put<FreeBackupsChange>('/community/backups/store', { driver, location, credentials })
  return data
}

/** `DELETE /community/backups/store`: the panel chooses no store again, so the Engine's own store applies. */
export async function removeFreeBackupStore (): Promise<FreeBackupsChange> {
  const { data } = await api.delete<FreeBackupsChange>('/community/backups/store')
  return data
}
