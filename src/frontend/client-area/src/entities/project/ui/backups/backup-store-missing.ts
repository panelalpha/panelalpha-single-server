// The texts shown while no backup store is set up (`isBackupStoreMissing`). The keys are new (not in the legacy fixtures), so each carries
// its English `defaultValue`. Only a Free panel sets the store in Settings; any other panel gets the provider line instead.

export interface BackupStoreMissingLine {
  key: string
  defaultValue: string
  /** The first line of a tooltip says what is wrong and is bold; the next one says what to do. */
  strong?: boolean
}

export const BACKUP_STORE_MISSING_STATUS: BackupStoreMissingLine = { key: 'message.backup.noStore.status', defaultValue: 'Unavailable' }
export const BACKUP_STORE_MISSING_HINT: BackupStoreMissingLine = { key: 'message.backup.noStore.hint', defaultValue: 'No backup store is set up.' }
export const BACKUP_STORE_SET_UP_SHORT: BackupStoreMissingLine = { key: 'message.backup.noStore.setUpShort', defaultValue: 'Set up store' }
export const BACKUP_STORE_SET_UP: BackupStoreMissingLine = { key: 'message.backup.noStore.setUp', defaultValue: 'Set up backup store' }

const CONTACT_PROVIDER: BackupStoreMissingLine = { key: 'message.backup.noStore.contactProvider', defaultValue: 'Contact your provider to enable backups.' }

/**
 * The tooltip lines. `tab`: the Backups tab chip, which covers creating and scheduling (it replaces the "enable automatic backups" advice,
 * which cannot be followed without a store). `create`: a disabled Create backup / Add new button.
 */
export function backupStoreMissingTooltip (scope: 'tab' | 'create', freePanel: boolean): BackupStoreMissingLine[] {
  if (scope === 'tab') {
    return [
      { key: 'message.backup.noStore.tabTitle', defaultValue: 'Backups are unavailable: no backup store is set up.', strong: true },
      freePanel
        ? { key: 'message.backup.noStore.tabSettings', defaultValue: 'Set up a backup store in Settings to create and schedule backups.' }
        : CONTACT_PROVIDER,
    ]
  }
  return [
    { ...BACKUP_STORE_MISSING_HINT, strong: true },
    freePanel
      ? { key: 'message.backup.noStore.createDisabled', defaultValue: 'Set up a backup store in Settings to create backups.' }
      : CONTACT_PROVIDER,
  ]
}
