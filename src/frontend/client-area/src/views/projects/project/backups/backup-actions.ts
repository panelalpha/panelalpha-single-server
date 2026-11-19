import type { BackupItem } from './backups-list'
import type { DateValue } from '@/shared/time/date-format'
import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import type { ActionModal } from '@/entities/project/action-modal'
import type { BackupItemFile, RestoreBackupBody } from '@/entities/project/instance-backups.api'
import { backupDownloadUrl } from '@/entities/project/instance-backups.api'
import { escapeHtml } from '@/shared/format/escape-html'
import { EMPTY_DATE, formatTime } from '@/shared/time/date-format'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'
import { hasCode, hasData } from './backup-parts'

// Pure builders and runners: the view owns the dialog and the
// row state.

/** The alerts and the translator the runners need (`MassActionDeps` of the instance screen, minus the instance requests). */
export interface BackupActionDeps {
  restoreBackup: (instanceId: number, backupId: number, body: RestoreBackupBody) => Promise<unknown>
  deleteBackup: (instanceId: number, backupId: number) => Promise<unknown>
  addSuccessAlert: (message: string) => void
  addErrorAlert: (message: string) => void
  getErrorMessage: (error: unknown) => string
  t: Translate
}

/** The date of the delete copy: the date in bold and the time after it, both escaped; a dash alone for an empty date. */
export function backupName (date: DateValue, formatDate: (value: DateValue) => string): string {
  const day = formatDate(date)
  if (day === EMPTY_DATE) {
    return escapeHtml(day)
  }
  return `<span class="font-weight-bold">${escapeHtml(day)}</span> ${escapeHtml(formatTime(date))}`
}

/**
 * A checkbox per part the backup holds. The files checkbox starts checked and
 * is only offered for a backup with files.
 */
export function restoreModal (item: Pick<BackupItem, 'database' | 'directory' | 'parts'>, t: Translate, options?: { custom?: boolean }): ActionModal {
  const custom = Boolean(options?.custom)
  const fields: ModalField[] = []
  if (custom) {
    // A project with its own containers: data first, then code (the order of the legacy fields), both unticked, no delete-existing-files.
    if (hasData(item)) {
      fields.push({ label: t('form.label.restoreData', { defaultValue: 'Restore data (volumes and databases)' }), name: 'restoreDatabase', type: 'checkbox' })
    }
    if (hasCode(item)) {
      fields.push({ label: t('form.label.restoreCode', { defaultValue: 'Restore code' }), name: 'restoreDirectory', type: 'checkbox' })
    }
  } else {
    if (item.database) {
      fields.push({ label: t('form.label.restoreDatabase'), name: 'restoreDatabase', type: 'checkbox' })
    }
    if (item.directory) {
      fields.push(
        { label: t('form.label.restoreDirectory'), name: 'restoreDirectory', type: 'checkbox' },
        {
          label: t('form.label.deleteExistingFiles'),
          name: 'deleteExistingFiles',
          type: 'checkbox',
          // A tooltip is an i18n key here; the field renderer translates it.
          tooltip: 'heading.instance.backups.restore.deleteExistingFiles.tooltip',
        },
      )
    }
  }

  // While no offered part is ticked the server refuses the restore, so Restore stays off with the panel's sentence.
  const partNames = fields.flatMap(field => ('name' in field && (field.name === 'restoreDatabase' || field.name === 'restoreDirectory') ? [field.name] : []))

  return {
    type: 'backup-restore',
    props: {
      title: t('heading.instance.backups.restore.title'),
      message: '',
      icon: '$restore',
      buttons: [{ id: 'submit', label: t('button.restore'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
      ...(custom
        ? {
            alert: t('message.backup.custom.restoreWarning', {
              defaultValue: 'The project is stopped while the backup is restored. Restoring code replaces all files in the project directory. Restoring data replaces the volumes and databases from this backup.',
            }),
          }
        : {}),
    },
    ...(partNames.length > 0
      ? {
          choice: {
            names: partNames,
            reason: custom
              ? t('notification.instance.backup.restore.choice', { defaultValue: 'Select Restore data or Restore code to continue.' })
              : t('notification.instance.backup.restore.error'),
          },
        }
      : {}),
    fields,
    width: MODAL_WIDTH,
    persistent: false,
    values: !custom && item.directory ? { deleteExistingFiles: true } : {},
  }
}

/**
 * The copy names the backup by its date and time; a required confirm checkbox
 * gates the button (the host reads `confirm`).
 */
export function deleteModal (item: Pick<BackupItem, 'date'>, t: Translate, formatDate: (value: DateValue) => string): ActionModal {
  return {
    type: 'backup-delete',
    props: {
      title: t('heading.instance.backups.delete.title', { count: 1 }),
      // The name is built from escaped parts with markup, so the translator must not escape it again (`escapeValue: false`).
      message: t('heading.instance.backups.delete.message', { count: 1, name: backupName(item.date, formatDate) }),
      icon: '$alertwarning',
      color: 'error',
      buttons: [{ id: 'submit', label: t('button.delete'), color: 'error' }, cancelButton(t)],
      confirmRequired: true,
    },
    fields: [
      {
        message: `<b>${t('message.confirmAction')}</b>`,
        label: t('form.confirmDelete.backup', { count: 1 }),
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/** The body of the restore request: the three flags, as JSON booleans (the row itself is not sent). */
export function restoreBody (values: Record<string, unknown>): RestoreBackupBody {
  return {
    restoreDatabase: Boolean(values.restoreDatabase),
    restoreDirectory: Boolean(values.restoreDirectory),
    deleteExistingFiles: Boolean(values.deleteExistingFiles),
  }
}

/** At least one of the two parts must be ticked. */
export function hasRestoreTarget (values: Record<string, unknown>): boolean {
  return Boolean(values.restoreDatabase || values.restoreDirectory)
}

/**
 * A request without a part to restore is not sent, the alert names it and the dialog stays open. A success
 * closes the dialog (the caller does); a failure keeps it open, as legacy did.
 */
export async function runRestore (
  instanceId: number,
  item: Pick<BackupItem, 'id'>,
  values: Record<string, unknown>,
  deps: BackupActionDeps,
): Promise<'success' | 'error' | 'nothing'> {
  if (!hasRestoreTarget(values)) {
    deps.addErrorAlert(deps.t('notification.instance.backup.restore.error'))
    return 'nothing'
  }
  try {
    await deps.restoreBackup(instanceId, item.id, restoreBody(values))
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.backup.restore.success'))
  return 'success'
}

/** The copy of the demo guard: a hardcoded English string in legacy, kept as is. */
export const DEMO_MODE_MESSAGE = 'Action not available in demo mode.'

/** English literal like DEMO_MODE_MESSAGE: no i18n key exists for it yet. */
export const POPUP_BLOCKED_MESSAGE = 'The browser blocked the download window. Allow pop-ups for this site and try again.'

/** The mass delete needs the single-row deps, plus the demo check and the progress log line sink of the dialog. */
export interface MassDeleteDeps extends BackupActionDeps {
  isDemoMode: () => boolean
  /** Appends one line to the dialog's progress log (`modal.props.submittingProgressLog`). */
  log: (line: string) => void
}

/**
 * No confirm checkbox, the Delete button is active at once (the single delete keeps
 * its checkbox, which legacy has too). The copy is the plural one; the count is the number of selected rows.
 */
export function massDeleteModal (items: ReadonlyArray<Pick<BackupItem, 'id'>>, t: Translate): ActionModal {
  const count = items.length
  return {
    type: 'backup-mass-delete',
    props: {
      title: t('heading.instance.backups.delete.title', { count }),
      message: t('heading.instance.backups.delete.message', { count }),
      // The mass delete sets neither an icon nor a colour; only the single delete has both.
      icon: '',
      buttons: [{ id: 'submit', label: t('button.delete'), color: 'error' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

export type BackupMassDeleteOutcome = 'deleted' | 'error' | 'demo'

/**
 * The rows go one by one, each with its progress line; the first failure stops
 * the run (its message goes to the log and to an error alert). A full success shows the completed alert. In demo mode nothing is sent.
 * The caller closes the dialog and reloads the list after `deleted` and `error`, and clears the selection after `deleted` only.
 */
export async function runBackupMassDelete (
  instanceId: number,
  ids: readonly number[],
  deps: MassDeleteDeps,
): Promise<BackupMassDeleteOutcome> {
  if (deps.isDemoMode()) {
    deps.addErrorAlert(DEMO_MODE_MESSAGE)
    return 'demo'
  }

  const total = ids.length
  for (const [index, id] of ids.entries()) {
    const position = `${index + 1}/${total}`
    deps.log(`\n ${deps.t('heading.instance.backups.delete.info')} ${position}...`)
    try {
      await deps.deleteBackup(instanceId, id)
    } catch (error) {
      const message = deps.getErrorMessage(error)
      deps.log(`\n ${deps.t('heading.instance.backups.delete.error')} ${position}: ${message}`)
      deps.addErrorAlert(message)
      return 'error'
    }
    deps.log(`\n ${deps.t('heading.instance.backups.delete.success')} ${position}.`)
  }

  deps.addSuccessAlert(deps.t('notification.instance.backup.delete.completed'))
  return 'deleted'
}

/**
 * The alert names the outcome, and the dialog closes whatever the outcome. The caller marks the
 * row pending on a success only.
 */
export async function runDelete (
  instanceId: number,
  item: Pick<BackupItem, 'id'>,
  deps: BackupActionDeps,
): Promise<'success' | 'error'> {
  try {
    await deps.deleteBackup(instanceId, item.id)
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.backup.delete.success'))
  return 'success'
}

/** The parts the file holds. The `Item #id` fallback is legacy's own text, kept as it is. */
export function backupItemLabel (
  file: Pick<BackupItemFile, 'id' | 'directory' | 'database'> & Partial<Pick<BackupItemFile, 'type' | 'name'>>,
  t: Translate,
  options?: { custom?: boolean },
): string {
  if (options?.custom) {
    if (file.type === 'files') {
      return t('form.label.backupItem.code', { defaultValue: 'Code' })
    }
    if (file.type === 'volume' && file.name) {
      return t('form.label.backupItem.volume', { defaultValue: 'Volume: {{name}}', name: file.name })
    }
    if (file.type === 'database' && file.name) {
      return t('form.label.backupItem.database', { defaultValue: 'Database: {{name}}', name: file.name })
    }
  }
  const hasDirectory = Boolean(file.directory)
  const hasDatabase = Boolean(file.database)
  if (hasDirectory && hasDatabase) {
    return `${t('general.files')} & ${t('general.database')}`
  }
  if (hasDirectory) {
    return t('general.files')
  }
  if (hasDatabase) {
    return t('general.database')
  }
  return `Item #${file.id}`
}

/**
 * A backup with more than one file asks which one to download. The first file is preselected;
 * the download button is the first button, the cancel button follows.
 */
export function downloadModal (backup: Pick<BackupItem, 'items'>, t: Translate, options?: { custom?: boolean }): ActionModal {
  return {
    type: 'backup-download',
    props: {
      title: t('heading.instance.backups.download.title'),
      message: t('heading.instance.backups.download.message'),
      icon: '$update',
      buttons: [{ id: 'submit', label: t('button.backup.download'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [
      {
        label: t('form.label.backupDownloadItem'),
        name: 'backupItemId',
        type: 'select',
        required: true,
        options: backup.items.map(file => ({ label: backupItemLabel(file, t, options), value: file.id })),
      },
    ],
    width: MODAL_WIDTH,
    persistent: false,
    values: { backupItemId: backup.items[0]?.id ?? null },
  }
}

export interface DownloadDeps {
  isDemoMode: () => boolean
  addErrorAlert: (message: string) => void
  t: Translate
}

/**
 * In demo mode the alert names the block and nothing is opened; otherwise the file opens in a new
 * window. Returns whether the window was opened.
 */
export function downloadItem (instanceId: number, backupId: number, file: Pick<BackupItemFile, 'id'>, deps: DownloadDeps): boolean {
  if (deps.isDemoMode()) {
    deps.addErrorAlert(DEMO_MODE_MESSAGE)
    return false
  }
  const opened = window.open(backupDownloadUrl(instanceId, backupId, file.id), '_blank')
  if (!opened) {
    deps.addErrorAlert(POPUP_BLOCKED_MESSAGE)
    return false
  }
  opened.opener = null
  return true
}

/**
 * No file is an alert and nothing else; one file opens at once; more files need the choice, so
 * the caller opens the dialog returned here (`null` when nothing is left to ask).
 */
export function startDownload (
  instanceId: number,
  backup: Pick<BackupItem, 'id' | 'items'>,
  deps: DownloadDeps,
  options?: { custom?: boolean },
): ActionModal | null {
  const [first] = backup.items
  if (!first) {
    deps.addErrorAlert(deps.t('notification.instance.backup.download.no_items'))
    return null
  }
  if (backup.items.length === 1) {
    downloadItem(instanceId, backup.id, first, deps)
    return null
  }
  return downloadModal(backup, deps.t, options)
}
