import type { EntityPayload } from '@/shared/events/app-events'
import type { BackupRow } from '@/entities/project/instance-backups.api'
import { type BackupItem, decorateBackup } from './backups-list'

// The Echo events `backup-item-changed` / `backup-item-deleted`. The payload is
// `BackupResource::toArray`, which has no instance or application id, so the backup id
// is the only filter. Pure: no request, no reactivity; the view applies the result.

export interface BackupEventResult {
  items: BackupItem[]
  /** `false` when the backup is not in the loaded list: the view then leaves the usage and the frame chip alone. */
  matched: boolean
}

/** The Echo body as a backup row. Only a numeric `id` is required; the rest is trusted from the server. */
export function asBackupRow (payload: EntityPayload): BackupRow | null {
  if (!payload || typeof payload.id !== 'number') {
    return null
  }
  return payload as unknown as BackupRow
}

/** `backup-item-changed`: the row with the same id is replaced by the decorated payload, in place. */
export function applyBackupChanged (items: BackupItem[], payload: EntityPayload): BackupEventResult {
  const row = asBackupRow(payload)
  if (!row) {
    return { items, matched: false }
  }
  const index = items.findIndex(item => item.id === row.id)
  if (index === -1) {
    return { items, matched: false }
  }
  const next = [...items]
  next[index] = decorateBackup(row)
  return { items: next, matched: true }
}

/** `backup-item-deleted`: the row with the same id leaves the list. */
export function applyBackupDeleted (items: BackupItem[], payload: EntityPayload): BackupEventResult {
  const row = asBackupRow(payload)
  if (!row) {
    return { items, matched: false }
  }
  if (!items.some(item => item.id === row.id)) {
    return { items, matched: false }
  }
  return { items: items.filter(item => item.id !== row.id), matched: true }
}
