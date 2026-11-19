import type { BackupParts } from '@/entities/project/instance-backups.api'

// What a backup holds. One rule for the table, Restore and Download. Without `parts` (older Engine, other project types) the legacy
// `directory` and `database` flags decide.

interface PartsSource {
  parts?: BackupParts | null
  directory?: boolean | number | null
  database?: boolean | number | null
}

/** The backup holds code (files). */
export function hasCode (row: PartsSource): boolean {
  return row.parts ? Boolean(row.parts.files) : Boolean(row.directory)
}

/** The backup holds data (volumes or databases). */
export function hasData (row: PartsSource): boolean {
  if (row.parts) {
    return (row.parts.volumes?.length ?? 0) > 0 || (row.parts.databases?.length ?? 0) > 0
  }
  return Boolean(row.database)
}

/** The names of the volumes and databases, or `null` when the row has no `parts`. */
export function dataNames (row: PartsSource): { volumes: string[], databases: string[] } | null {
  if (!row.parts) {
    return null
  }
  return { volumes: row.parts.volumes ?? [], databases: row.parts.databases ?? [] }
}
