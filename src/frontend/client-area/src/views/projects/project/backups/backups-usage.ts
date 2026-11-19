import type { BackupItem } from './backups-list'
import type { BackupsUsage, BackupsUsageEntry } from '@/entities/project/instance-backups.api'

// Usage chips, limit checks and the usage recount of the backups list.

/** The usage keys the chips show, in the order legacy shows them. WP Cloud sends other keys, so it gets no chips. */
export const USAGE_KEYS = ['manual_backups_number', 'automatic_backups_number', 'backups_size'] as const

export type UsageKey = typeof USAGE_KEYS[number]

export interface UsageChip {
  name: UsageKey
  data: BackupsUsageEntry
}

/** The chips to show: the known keys the server sent, in legacy order. A missing or `null` entry is skipped. */
export function usageChips (usage: BackupsUsage): UsageChip[] {
  const chips: UsageChip[] = []
  for (const key of USAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(usage, key)) {
      continue
    }
    const data = usage[key]
    if (data !== null && data !== undefined) {
      chips.push({ name: key, data })
    }
  }
  return chips
}

function reached (entry: BackupsUsageEntry | null | undefined): boolean {
  if (!entry || entry.max === null || entry.max === undefined) {
    return false
  }
  return Number(entry.total) >= Number(entry.max)
}

/** The manual backup count has reached its plan limit. An unlimited count (`max` `null`) never has. */
export function isManualLimitReached (usage: BackupsUsage): boolean {
  return reached(usage.manual_backups_number)
}

/** The shared backup size has reached its plan limit. An unlimited size (`max` `null`) never has. */
export function isSizeLimitReached (usage: BackupsUsage): boolean {
  return reached(usage.backups_size)
}

/**
 * The translation key of the disabled "Add new" tooltip, or `null` when a backup can be created. The manual count wins over the size,
 * as in legacy.
 */
export function addNewLimitKey (usage: BackupsUsage): 'heading.instance.backups.limit.manual_count' | 'heading.instance.backups.limit.size' | null {
  if (isManualLimitReached(usage)) {
    return 'heading.instance.backups.limit.manual_count'
  }
  if (isSizeLimitReached(usage)) {
    return 'heading.instance.backups.limit.size'
  }
  return null
}

/** Neither limit is reached. */
export function canCreateManualBackup (usage: BackupsUsage): boolean {
  return addNewLimitKey(usage) === null
}

/**
 * The counts and the size of the usage, from the list. Only the keys the server sent are counted, and
 * the input is not changed. The size is in GB with two decimals, as the server sends it.
 */
export function recountUsage (usage: BackupsUsage, allItems: readonly BackupItem[]): BackupsUsage {
  const next: BackupsUsage = { ...usage }
  const bytes = allItems.reduce((sum, backup) => sum + (backup.size_in_bytes ?? 0), 0)

  if (next.manual_backups_number) {
    next.manual_backups_number = {
      ...next.manual_backups_number,
      total: allItems.filter(backup => backup.type.toLowerCase() === 'manual').length,
    }
  }

  if (next.automatic_backups_number) {
    next.automatic_backups_number = {
      ...next.automatic_backups_number,
      total: allItems.filter(backup => backup.type.toLowerCase() === 'automatic').length,
    }
  }

  if (next.backups_size) {
    next.backups_size = {
      ...next.backups_size,
      total: (bytes / 1024 / 1024 / 1024).toFixed(2),
    }
  }

  return next
}
