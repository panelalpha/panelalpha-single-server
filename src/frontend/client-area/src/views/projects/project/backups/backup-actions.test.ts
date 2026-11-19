import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backupDownloadUrl } from '@/entities/project/instance-backups.api'
import { type BackupActionDeps, backupItemLabel, backupName, deleteModal, DEMO_MODE_MESSAGE, type DownloadDeps, downloadItem, downloadModal, hasRestoreTarget, type MassDeleteDeps, massDeleteModal, POPUP_BLOCKED_MESSAGE, restoreBody, restoreModal, runBackupMassDelete, runDelete, runRestore, startDownload } from './backup-actions'

const t = (key: string, options?: Record<string, unknown>): string => (options ? `${key}${JSON.stringify(options)}` : key)

function deps (overrides: Partial<BackupActionDeps> = {}): BackupActionDeps {
  return {
    restoreBackup: vi.fn().mockResolvedValue(undefined),
    deleteBackup: vi.fn().mockResolvedValue(undefined),
    addSuccessAlert: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: vi.fn(() => 'api error'),
    t,
    ...overrides,
  }
}

describe('restoreModal', () => {
  it('offers the database checkbox only for a backup with a database', () => {
    const modal = restoreModal({ database: true, directory: false }, t)

    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toEqual(['restoreDatabase'])
    expect(modal.values).toEqual({})
  })

  it('offers the directory checkbox and the delete-existing-files checkbox for a backup with files, which starts checked', () => {
    const modal = restoreModal({ database: false, directory: true }, t)

    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toEqual(['restoreDirectory', 'deleteExistingFiles'])
    expect(modal.fields[1]).toMatchObject({ tooltip: 'heading.instance.backups.restore.deleteExistingFiles.tooltip' })
    expect(modal.values).toEqual({ deleteExistingFiles: true })
  })

  it('offers both checkboxes for a backup with a database and files', () => {
    const modal = restoreModal({ database: true, directory: true }, t)

    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toEqual([
      'restoreDatabase',
      'restoreDirectory',
      'deleteExistingFiles',
    ])
  })

  it('uses the restore title, the restore icon and the primary button', () => {
    const modal = restoreModal({ database: true, directory: false }, t)

    expect(modal.type).toBe('backup-restore')
    expect(modal.props.title).toBe('heading.instance.backups.restore.title')
    expect(modal.props.icon).toBe('$restore')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.restore', color: 'primary' })
  })

  it('waits for one of the parts it offers and quotes the panel\'s own refusal as the reason', () => {
    const modal = restoreModal({ database: true, directory: true }, t)

    expect(modal.choice).toEqual({ names: ['restoreDatabase', 'restoreDirectory'], reason: 'notification.instance.backup.restore.error' })
    expect(restoreModal({ database: true, directory: false }, t).choice?.names).toEqual(['restoreDatabase'])
    expect(restoreModal({ database: false, directory: true }, t).choice?.names).toEqual(['restoreDirectory'])
  })

  it('has no part choice for a backup that offers none', () => {
    expect(restoreModal({ database: false, directory: false }, t).choice).toBeUndefined()
  })
})

describe('restoreModal for a custom project', () => {
  const names = (modal: ReturnType<typeof restoreModal>) => modal.fields.map(field => ('name' in field ? field.name : undefined))

  it('has data and code checkboxes with the new labels, unticked, without delete-existing-files', () => {
    const modal = restoreModal({ database: false, directory: false, parts: { files: true, volumes: ['v'], databases: [] } }, t, { custom: true })

    expect(names(modal)).toEqual(['restoreDatabase', 'restoreDirectory'])
    expect(modal.fields[0]).toMatchObject({ label: expect.stringContaining('form.label.restoreData'), type: 'checkbox' })
    expect(modal.fields[1]).toMatchObject({ label: expect.stringContaining('form.label.restoreCode'), type: 'checkbox' })
    expect(modal.values).toEqual({})
  })

  it('never presets delete-existing-files, even when the backup has files', () => {
    const modal = restoreModal({ database: true, directory: true, parts: { files: true, volumes: ['v'], databases: [] } }, t, { custom: true })

    expect(modal.values).toEqual({})
    expect(names(modal)).not.toContain('deleteExistingFiles')
  })

  it('sets the warning alert', () => {
    const modal = restoreModal({ database: true, directory: true }, t, { custom: true })

    expect(modal.props.alert).toContain('message.backup.custom.restoreWarning')
    expect(restoreModal({ database: true, directory: true }, t).props.alert).toBeUndefined()
  })

  it('asks for data or code in the words of the labels it shows', () => {
    const modal = restoreModal({ database: true, directory: true }, t, { custom: true })

    expect(modal.props.alert).toBeTruthy()
    expect(modal.choice?.names).toEqual(['restoreDatabase', 'restoreDirectory'])
    expect(modal.choice?.reason).toContain('notification.instance.backup.restore.choice')
    expect(modal.choice?.reason).toContain('Select Restore data or Restore code to continue.')
  })

  it('offers only the parts the backup holds', () => {
    expect(names(restoreModal({ database: true, directory: true, parts: { files: true, volumes: [], databases: [] } }, t, { custom: true }))).toEqual(['restoreDirectory'])
    expect(names(restoreModal({ database: false, directory: false, parts: { files: false, volumes: [], databases: ['db'] } }, t, { custom: true }))).toEqual(['restoreDatabase'])
  })

  it('falls back to the flags without parts', () => {
    expect(names(restoreModal({ database: true, directory: false }, t, { custom: true }))).toEqual(['restoreDatabase'])
    expect(names(restoreModal({ database: false, directory: true }, t, { custom: true }))).toEqual(['restoreDirectory'])
  })
})

describe('restoreBody', () => {
  it('sends only the three flags as JSON booleans', () => {
    expect(restoreBody({ restoreDatabase: true, restoreDirectory: null, deleteExistingFiles: true, name: 'x' })).toEqual({
      restoreDatabase: true,
      restoreDirectory: false,
      deleteExistingFiles: true,
    })
  })

  it('reads a missing flag as false', () => {
    expect(restoreBody({})).toEqual({ restoreDatabase: false, restoreDirectory: false, deleteExistingFiles: false })
  })
})

describe('hasRestoreTarget', () => {
  it('needs the database or the directory to be ticked', () => {
    expect(hasRestoreTarget({ restoreDatabase: false, restoreDirectory: false, deleteExistingFiles: true })).toBe(false)
    expect(hasRestoreTarget({ restoreDatabase: false, restoreDirectory: true })).toBe(true)
  })
})

describe('runRestore', () => {
  it('sends no request and shows the restore error when no part is ticked', async () => {
    const d = deps()

    const outcome = await runRestore(9, { id: 3 }, { restoreDatabase: false, restoreDirectory: false }, d)

    expect(outcome).toBe('nothing')
    expect(d.restoreBackup).not.toHaveBeenCalled()
    expect(d.addErrorAlert).toHaveBeenCalledWith('notification.instance.backup.restore.error')
  })

  it('sends the three flags and shows the success alert', async () => {
    const d = deps()

    const outcome = await runRestore(9, { id: 3 }, { restoreDatabase: true, restoreDirectory: false, deleteExistingFiles: true }, d)

    expect(outcome).toBe('success')
    expect(d.restoreBackup).toHaveBeenCalledWith(9, 3, { restoreDatabase: true, restoreDirectory: false, deleteExistingFiles: true })
    expect(d.addSuccessAlert).toHaveBeenCalledWith('notification.instance.backup.restore.success')
  })

  it('shows the error message of a failed request', async () => {
    const d = deps({ restoreBackup: vi.fn().mockRejectedValue(new Error('boom')) })

    const outcome = await runRestore(9, { id: 3 }, { restoreDatabase: true }, d)

    expect(outcome).toBe('error')
    expect(d.getErrorMessage).toHaveBeenCalled()
    expect(d.addErrorAlert).toHaveBeenCalledWith('api error')
    expect(d.addSuccessAlert).not.toHaveBeenCalled()
  })
})

describe('deleteModal', () => {
  const formatDate = (value: unknown) => `${String(value)}-day`

  it('names the backup in the message, escaping the date and the time', () => {
    // A translator that fills `{{name}}` in, as i18next does with `escapeValue: false`.
    const fill = (key: string, options?: Record<string, unknown>): string => (typeof options?.name === 'string' ? options.name : key)

    const modal = deleteModal({ date: '1700000000000' }, fill, () => '<b>x</b>')

    expect(modal.props.message).toMatch(/^<span class="font-weight-bold">&lt;b&gt;x&lt;\/b&gt;<\/span> \d{2}:\d{2}$/)
    expect(modal.props.message).not.toContain('<b>x</b>')
  })

  it('keeps the dash alone for an empty date', () => {
    expect(backupName('', () => '—')).toBe('—')
  })

  it('requires the confirm checkbox and gates the button with it', () => {
    const modal = deleteModal({ date: '1700000000000' }, t, formatDate)

    expect(modal.type).toBe('backup-delete')
    expect(modal.props.confirmRequired).toBe(true)
    expect(modal.fields).toEqual([
      expect.objectContaining({ name: 'confirm', type: 'checkbox', required: true, label: 'form.confirmDelete.backup{"count":1}' }),
    ])
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.delete', color: 'error' })
  })
})

describe('runDelete', () => {
  it('deletes the backup and shows the success alert', async () => {
    const d = deps()

    expect(await runDelete(9, { id: 3 }, d)).toBe('success')
    expect(d.deleteBackup).toHaveBeenCalledWith(9, 3)
    expect(d.addSuccessAlert).toHaveBeenCalledWith('notification.instance.backup.delete.success')
  })

  it('shows the error message of a failed request', async () => {
    const d = deps({ deleteBackup: vi.fn().mockRejectedValue(new Error('boom')) })

    expect(await runDelete(9, { id: 3 }, d)).toBe('error')
    expect(d.addErrorAlert).toHaveBeenCalledWith('api error')
  })
})

describe('massDeleteModal', () => {
  it('uses the plural copy and the error button, with no confirm checkbox and no gate (legacy)', () => {
    const modal = massDeleteModal([{ id: 1 }, { id: 2 }], t)

    expect(modal.type).toBe('backup-mass-delete')
    expect(modal.props.title).toBe('heading.instance.backups.delete.title{"count":2}')
    expect(modal.props.message).toBe('heading.instance.backups.delete.message{"count":2}')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.delete', color: 'error' })
    expect(modal.props.confirmRequired).toBe(false)
    expect(modal.fields).toEqual([])
  })
})

describe('runBackupMassDelete', () => {
  function massDeps (overrides: Partial<MassDeleteDeps> = {}) {
    const log: string[] = []
    const massDependencies: MassDeleteDeps = {
      ...deps(),
      isDemoMode: () => false,
      log: line => log.push(line),
      ...overrides,
    }
    return { deps: massDependencies, log }
  }

  it('deletes the rows one by one, in order, with a progress line for each step', async () => {
    const calls: number[] = []
    const { deps, log } = massDeps({
      deleteBackup: vi.fn(async (_instance: number, id: number) => {
        calls.push(id)
      }),
    })

    const outcome = await runBackupMassDelete(9, [3, 1], deps)

    expect(outcome).toBe('deleted')
    expect(calls).toEqual([3, 1])
    expect(log).toEqual([
      '\n heading.instance.backups.delete.info 1/2...',
      '\n heading.instance.backups.delete.success 1/2.',
      '\n heading.instance.backups.delete.info 2/2...',
      '\n heading.instance.backups.delete.success 2/2.',
    ])
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.backup.delete.completed')
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
  })

  it('stops at the first failure, logs its message and shows an error alert', async () => {
    const deleteBackup = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const { deps, log } = massDeps({ deleteBackup })

    const outcome = await runBackupMassDelete(9, [1, 2, 3], deps)

    expect(outcome).toBe('error')
    expect(deleteBackup).toHaveBeenCalledTimes(2)
    expect(deps.getErrorMessage).toHaveBeenCalledWith(expect.any(Error))
    expect(log.at(-1)).toBe('\n heading.instance.backups.delete.error 2/3: api error')
    expect(deps.addErrorAlert).toHaveBeenCalledWith('api error')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })

  it('sends nothing and shows the demo alert in demo mode', async () => {
    const { deps, log } = massDeps({ isDemoMode: () => true })

    const outcome = await runBackupMassDelete(9, [1], deps)

    expect(outcome).toBe('demo')
    expect(deps.deleteBackup).not.toHaveBeenCalled()
    expect(log).toEqual([])
    expect(deps.addErrorAlert).toHaveBeenCalledWith(DEMO_MODE_MESSAGE)
  })
})

describe('backupItemLabel', () => {
  it('names the parts the file holds', () => {
    expect(backupItemLabel({ id: 1, directory: true, database: true }, t)).toBe('general.files & general.database')
    expect(backupItemLabel({ id: 1, directory: true, database: false }, t)).toBe('general.files')
    expect(backupItemLabel({ id: 1, directory: null, database: 1 }, t)).toBe('general.database')
  })

  it('falls back to the item number when the file holds neither part', () => {
    expect(backupItemLabel({ id: 5, directory: false, database: null }, t)).toBe('Item #5')
  })
})

describe('backupItemLabel for a custom project', () => {
  const custom = { custom: true }
  const base = { directory: false, database: false }

  it('names a code item, a volume and a database from their type', () => {
    expect(backupItemLabel({ id: 1, ...base, type: 'files', name: null }, t, custom))
      .toBe('form.label.backupItem.code' + JSON.stringify({ defaultValue: 'Code' }))
    expect(backupItemLabel({ id: 2, ...base, type: 'volume', name: 'uploads' }, t, custom))
      .toBe('form.label.backupItem.volume' + JSON.stringify({ defaultValue: 'Volume: {{name}}', name: 'uploads' }))
    expect(backupItemLabel({ id: 3, ...base, type: 'database', name: 'main' }, t, custom))
      .toBe('form.label.backupItem.database' + JSON.stringify({ defaultValue: 'Database: {{name}}', name: 'main' }))
  })

  it('keeps today label for an item without type, with an unknown type or a named type without name', () => {
    expect(backupItemLabel({ id: 4, directory: true, database: false }, t, custom)).toBe('general.files')
    expect(backupItemLabel({ id: 5, ...base, type: 'other', name: 'x' }, t, custom)).toBe('Item #5')
    expect(backupItemLabel({ id: 6, ...base, type: 'volume', name: null }, t, custom)).toBe('Item #6')
    expect(backupItemLabel({ id: 7, ...base, type: 'database' }, t, custom)).toBe('Item #7')
  })

  it('ignores the type for a WordPress project', () => {
    expect(backupItemLabel({ id: 8, directory: true, database: true, type: 'files', name: 'x' }, t)).toBe('general.files & general.database')
    expect(backupItemLabel({ id: 9, ...base, type: 'volume', name: 'uploads' }, t, { custom: false })).toBe('Item #9')
  })

  it('passes the custom option through downloadModal and startDownload', () => {
    const items = [{ id: 1, ...base, type: 'files', name: null }, { id: 2, ...base, type: 'volume', name: 'uploads' }]
    const labels = (modal: ReturnType<typeof downloadModal> | null) => (modal?.fields?.[0] as { options: { label: string }[] }).options.map(o => o.label)
    const expected = [
      'form.label.backupItem.code' + JSON.stringify({ defaultValue: 'Code' }),
      'form.label.backupItem.volume' + JSON.stringify({ defaultValue: 'Volume: {{name}}', name: 'uploads' }),
    ]

    expect(labels(downloadModal({ items }, t, custom))).toEqual(expected)
    expect(labels(startDownload(9, { id: 7, items }, { isDemoMode: () => false, addErrorAlert: vi.fn(), t }, custom))).toEqual(expected)
    expect(labels(downloadModal({ items }, t))).toEqual(['Item #1', 'Item #2'])
  })
})

describe('downloadModal', () => {
  const backup = { items: [{ id: 11, directory: true, database: false }, { id: 12, directory: false, database: true }] }

  it('asks which file to download, with the first one preselected', () => {
    const modal = downloadModal(backup, t)

    expect(modal.type).toBe('backup-download')
    expect(modal.props.title).toBe('heading.instance.backups.download.title')
    expect(modal.props.message).toBe('heading.instance.backups.download.message')
    expect(modal.props.icon).toBe('$update')
    expect(modal.fields).toEqual([
      expect.objectContaining({
        name: 'backupItemId',
        type: 'select',
        required: true,
        label: 'form.label.backupDownloadItem',
        options: [
          { label: 'general.files', value: 11 },
          { label: 'general.database', value: 12 },
        ],
      }),
    ])
    expect(modal.values).toEqual({ backupItemId: 11 })
  })

  it('puts the download button first and the cancel button after it', () => {
    const modal = downloadModal(backup, t)

    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.backup.download', color: 'primary' })
    expect(modal.props.buttons[1]).toMatchObject({ id: 'cancel' })
  })
})

describe('startDownload', () => {
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({ opener: 'page' }) as unknown as Window)
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  function downloadDeps (overrides: Partial<DownloadDeps> = {}): DownloadDeps {
    return { isDemoMode: () => false, addErrorAlert: vi.fn(), t, ...overrides }
  }

  it('shows the no-items alert with its key and opens nothing when the backup has no file', () => {
    const d = downloadDeps()

    expect(startDownload(9, { id: 7, items: [] }, d)).toBeNull()
    expect(d.addErrorAlert).toHaveBeenCalledWith('notification.instance.backup.download.no_items')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('opens the single file at once in a new window', () => {
    const d = downloadDeps()

    expect(startDownload(9, { id: 7, items: [{ id: 3, directory: true, database: false }] }, d)).toBeNull()
    expect(openSpy).toHaveBeenCalledWith(backupDownloadUrl(9, 7, 3), '_blank')
    expect(d.addErrorAlert).not.toHaveBeenCalled()
  })

  it('returns the file choice when the backup has more than one file, and opens nothing yet', () => {
    const d = downloadDeps()
    const items = [{ id: 3, directory: true, database: false }, { id: 4, directory: false, database: true }]

    const modal = startDownload(9, { id: 7, items }, d)

    expect(modal?.type).toBe('backup-download')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('blocks the single-file download in demo mode with the demo alert and opens nothing', () => {
    const d = downloadDeps({ isDemoMode: () => true })

    expect(startDownload(9, { id: 7, items: [{ id: 3, directory: true, database: false }] }, d)).toBeNull()
    expect(d.addErrorAlert).toHaveBeenCalledWith(DEMO_MODE_MESSAGE)
    expect(openSpy).not.toHaveBeenCalled()
  })
})

describe('downloadItem', () => {
  it('opens the file URL in a new window and reports it', () => {
    const opened = { opener: 'page' }
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => opened as unknown as Window)
    const d: DownloadDeps = { isDemoMode: () => false, addErrorAlert: vi.fn(), t }

    expect(downloadItem(9, 7, { id: 3 }, d)).toBe(true)
    expect(openSpy).toHaveBeenCalledWith(backupDownloadUrl(9, 7, 3), '_blank')
    expect(opened.opener).toBeNull()
    openSpy.mockRestore()
  })

  it('reports a blocked popup with an alert and returns false', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const d: DownloadDeps = { isDemoMode: () => false, addErrorAlert: vi.fn(), t }

    expect(downloadItem(9, 7, { id: 3 }, d)).toBe(false)
    expect(d.addErrorAlert).toHaveBeenCalledWith(POPUP_BLOCKED_MESSAGE)
    openSpy.mockRestore()
  })
})
