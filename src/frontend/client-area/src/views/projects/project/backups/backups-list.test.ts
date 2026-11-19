import type { BackupRow } from '@/entities/project/instance-backups.api'
import { describe, expect, it } from 'vitest'
import { asyncMessageKey, asyncState, backupsHeaders, buildHeaders, decorateBackup, filterBackups, hasVersionColumn, isEmpty, isNoResults, paginate, sortBackups } from './backups-list'

function row (overrides: Partial<BackupRow> = {}): BackupRow {
  return {
    id: 1,
    name: 'Nightly',
    date: 1_700_000_000,
    size: 1536,
    type: 'manual',
    mode: 'full',
    convert_from_id: null,
    version: null,
    note: 'before update',
    directory: true,
    database: true,
    async_status: { create: 'finished' },
    items: [{ id: 7, directory: true, database: false }],
    ...overrides,
  }
}

describe('decorateBackup', () => {
  it('turns the unix date into milliseconds and formats the size', () => {
    const item = decorateBackup(row())

    expect(item.date).toBe('1700000000000')
    expect(item.size).toBe('1.5 KB')
    expect(item.size_in_bytes).toBe(1536)
  })

  it('capitalises the type', () => {
    expect(decorateBackup(row({ type: 'manual' })).type).toBe('Manual')
    expect(decorateBackup(row({ type: 'automatic' })).type).toBe('Automatic')
  })

  it('does not throw on an Echo payload without type or size', () => {
    const item = decorateBackup(row({ type: undefined as unknown as BackupRow['type'], size: undefined as unknown as BackupRow['size'] }))

    expect(item.type).toBe('')
    expect(item.size_in_bytes).toBeNull()
  })

  it('carries parts through, and leaves them undefined when absent', () => {
    const parts = { files: true, volumes: ['data'], databases: ['db'] }

    expect(decorateBackup(row({ parts })).parts).toEqual(parts)
    expect(decorateBackup(row()).parts).toBeUndefined()
    expect(decorateBackup(row({ parts: null })).parts).toBeNull()
  })

  it('turns a null async status into an empty object', () => {
    expect(decorateBackup(row({ async_status: null })).async_status).toEqual({})
  })

  it('keeps the async status when the server sent one', () => {
    expect(decorateBackup(row({ async_status: { create: 'pending' } })).async_status).toEqual({ create: 'pending' })
  })

  it('turns missing items into an empty list', () => {
    expect(decorateBackup(row({ items: undefined as unknown as BackupRow['items'] })).items).toEqual([])
  })

  it('keeps the identity and the descriptive fields', () => {
    const item = decorateBackup(row({ version: '6.4', note: 'x', mode: 'incremental', convert_from_id: 4 }))

    expect(item).toMatchObject({ id: 1, name: 'Nightly', mode: 'incremental', convert_from_id: 4, version: '6.4', note: 'x' })
    expect(item.directory).toBe(true)
    expect(item.database).toBe(true)
  })

  it('shows a zero size for a backup without a size', () => {
    const item = decorateBackup(row({ size: null }))

    expect(item.size).toBe('0 B')
    expect(item.size_in_bytes).toBeNull()
  })
})

describe('isEmpty and isNoResults', () => {
  const item = decorateBackup(row())

  it('is empty only without items and without a search term', () => {
    expect(isEmpty([], '')).toBe(true)
    expect(isEmpty([], 'abc')).toBe(false)
    expect(isEmpty([item], '')).toBe(false)
  })

  it('has no results only with a search term and no items', () => {
    expect(isNoResults([], 'abc')).toBe(true)
    expect(isNoResults([], '')).toBe(false)
    expect(isNoResults([item], 'abc')).toBe(false)
  })
})

describe('hasVersionColumn', () => {
  it('shows the version column when any backup has a version', () => {
    expect(hasVersionColumn([decorateBackup(row({ version: null })), decorateBackup(row({ version: '6.4' }))])).toBe(true)
  })

  it('hides it for empty versions', () => {
    expect(hasVersionColumn([decorateBackup(row({ version: null })), decorateBackup(row({ version: '' }))])).toBe(false)
  })
})

describe('backupsHeaders', () => {
  it('has the base columns without the version', () => {
    expect(backupsHeaders(false).map(h => h.value)).toEqual([
      'select', 'date', 'database', 'directory', 'size', 'type', 'note', 'actions',
    ])
  })

  it('puts the version column before the note', () => {
    expect(backupsHeaders(true).map(h => h.value)).toEqual([
      'select', 'date', 'database', 'directory', 'size', 'type', 'version', 'note', 'actions',
    ])
  })

  it('titles the custom columns Data and Code in the same place and with the same keys', () => {
    const headers = backupsHeaders(false, true)

    expect(headers.map(h => h.value)).toEqual(backupsHeaders(false).map(h => h.value))
    expect(headers.filter(h => h.value === 'database' || h.value === 'directory').map(h => h.text)).toEqual(['data', 'code'])
    expect(backupsHeaders(false).filter(h => h.value === 'database' || h.value === 'directory').map(h => h.text)).toEqual(['database', 'directory'])
  })

  it('marks date, type and note as searchable', () => {
    expect(backupsHeaders(true).filter(h => h.searchable).map(h => h.value)).toEqual(['date', 'type', 'note'])
  })
})

describe('buildHeaders', () => {
  const t = (key: string) => `T(${key})`

  it('adds the translated titles and leaves the checkbox and actions untitled', () => {
    const headers = buildHeaders([decorateBackup(row({ version: null }))], t)

    expect(headers.map(h => h.title)).toEqual(['', 'T(table.header.date)', 'T(table.header.database)', 'T(table.header.directory)', 'T(table.header.size)', 'T(table.header.type)', 'T(table.header.note)', ''])
  })

  it('gives the custom titles Code and Data a default value, and leaves WordPress titles as they are', () => {
    const items = [decorateBackup(row({ version: null }))]
    const t2 = (key: string, options?: { defaultValue: string }) => options?.defaultValue ?? `T(${key})`

    expect(buildHeaders(items, t2, true).map(h => h.title)).toEqual(['', 'T(table.header.date)', 'Data', 'Code', 'T(table.header.size)', 'T(table.header.type)', 'T(table.header.note)', ''])
    expect(buildHeaders(items, t2).map(h => h.title)).toContain('T(table.header.database)')
  })

  it('sets a ready label for Code and Data only, because the kit sort header ignores the title', () => {
    const items = [decorateBackup(row({ version: null }))]
    const t2 = (key: string, options?: { defaultValue: string }) => options?.defaultValue ?? `T(${key})`

    const custom = buildHeaders(items, t2, true)
    expect(custom.filter(h => h.label !== undefined).map(h => h.label)).toEqual(['Data', 'Code'])
    expect(buildHeaders(items, t2).every(h => h.label === undefined)).toBe(true)
  })

  it('shows the version column when any row of the whole list has a version', () => {
    const headers = buildHeaders([decorateBackup(row({ version: null })), decorateBackup(row({ version: '6.4' }))], t)

    expect(headers.map(h => h.value)).toContain('version')
  })
})

describe('filterBackups', () => {
  const items = [
    decorateBackup(row({ id: 1, note: 'Before Update' })),
    decorateBackup(row({ id: 2, note: null })),
    decorateBackup(row({ id: 3, note: 'nightly' })),
  ]

  it('keeps everything without a search term', () => {
    expect(filterBackups(items, '').map(i => i.id)).toEqual([1, 2, 3])
  })

  it('matches the note case-insensitively and does not throw on a null note', () => {
    expect(filterBackups(items, 'update').map(i => i.id)).toEqual([1])
    expect(filterBackups(items, 'NIGHT').map(i => i.id)).toEqual([3])
  })

  it('matches nothing for a term no note contains', () => {
    expect(filterBackups(items, 'zzz')).toEqual([])
  })

  it('matches the type case-insensitively', () => {
    const typed = [
      decorateBackup(row({ id: 1, type: 'manual', note: null })),
      decorateBackup(row({ id: 2, type: 'automatic', note: null })),
    ]

    expect(filterBackups(typed, 'manual').map(i => i.id)).toEqual([1])
    expect(filterBackups(typed, 'AUTO').map(i => i.id)).toEqual([2])
  })

  it('matches the date as the table shows it, and not the raw timestamp, when the caller supplies it', () => {
    const dated = [
      decorateBackup(row({ id: 1, date: 1_700_000_000, note: null })),
      decorateBackup(row({ id: 2, date: 1_800_000_000, note: null })),
    ]
    const dateText = (item: { id: number }): string => (item.id === 1 ? '2023-11-14 22:13' : '2027-01-15 08:00')

    expect(filterBackups(dated, '2023-11', dateText).map(i => i.id)).toEqual([1])
    expect(filterBackups(dated, '08:00', dateText).map(i => i.id)).toEqual([2])
    expect(filterBackups(dated, '1700000000', dateText)).toEqual([])
    expect(filterBackups(dated, '2023-11')).toEqual([])
  })
})

describe('sortBackups', () => {
  const items = [
    decorateBackup(row({ id: 1, date: 1_700_000_000, size: 2048 })),
    decorateBackup(row({ id: 2, date: 1_800_000_000, size: 512 })),
    decorateBackup(row({ id: 3, date: 1_750_000_000, size: 1024 })),
  ]
  const byDate = { text: 'date', value: 'date', sortable: true }
  const bySize = { text: 'size', value: 'size', sortable: true }

  it('sorts by date descending, as legacy does by default', () => {
    expect(sortBackups(items, byDate, true).map(i => i.id)).toEqual([2, 3, 1])
  })

  it('sorts by date ascending', () => {
    expect(sortBackups(items, byDate, false).map(i => i.id)).toEqual([1, 3, 2])
  })

  it('sorts size by its formatted text, as legacy localeCompare does', () => {
    // '1 KB' (1024) < '2 KB' (2048) < '512 Bytes' (512) by localeCompare on the formatted strings.
    expect(sortBackups(items, bySize, false).map(i => i.id)).toEqual([3, 1, 2])
  })

  it('keeps the order without a sort column and does not change the input', () => {
    const copy = [...items]

    expect(sortBackups(items, false, true).map(i => i.id)).toEqual([1, 2, 3])
    expect(items).toEqual(copy)
  })
})

describe('paginate', () => {
  const list = [1, 2, 3, 4, 5]

  it('gives the rows of the page', () => {
    expect(paginate(list, 1, 2)).toEqual([1, 2])
    expect(paginate(list, 3, 2)).toEqual([5])
  })

  it('accepts a per-page count as a string', () => {
    expect(paginate(list, 1, '3')).toEqual([1, 2, 3])
  })

  it('gives nothing past the last page', () => {
    expect(paginate(list, 4, 2)).toEqual([])
  })
})

describe('asyncState', () => {
  it('reports a pending create', () => {
    expect(asyncState({ async_status: { create: 'pending' } })).toEqual({ action: 'create', status: 'pending' })
  })

  it('reports an in-progress restore', () => {
    expect(asyncState({ async_status: { restore: 'in_progress' } })).toEqual({ action: 'restore', status: 'in_progress' })
  })

  it('reports a failed delete', () => {
    expect(asyncState({ async_status: { delete: 'failed' } })).toEqual({ action: 'delete', status: 'failed' })
  })

  it('prefers an action in progress over a failed one', () => {
    expect(asyncState({ async_status: { create: 'failed', delete: 'pending' } })).toEqual({ action: 'delete', status: 'pending' })
  })

  it('returns null for a finished or unknown status', () => {
    expect(asyncState({ async_status: { create: 'finished' } })).toBeNull()
    expect(asyncState({ async_status: {} })).toBeNull()
  })

  it('returns null for a null async status', () => {
    expect(asyncState({ async_status: null })).toBeNull()
  })

  it('maps in-progress to the pending message and failed to the failed message', () => {
    expect(asyncMessageKey({ action: 'create', status: 'in_progress' })).toBe('message.status.backup.create.pending')
    expect(asyncMessageKey({ action: 'restore', status: 'failed' })).toBe('message.status.backup.restore.failed')
  })
})
