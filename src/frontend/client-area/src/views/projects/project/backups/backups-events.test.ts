import type { BackupRow } from '@/entities/project/instance-backups.api'
import { describe, expect, it } from 'vitest'
import { applyBackupChanged, applyBackupDeleted, asBackupRow } from './backups-events'
import { decorateBackup } from './backups-list'

function row (overrides: Partial<BackupRow> = {}): BackupRow {
  return {
    id: 1,
    name: null,
    date: 1_700_000_000,
    size: 1024,
    type: 'manual',
    mode: 'full',
    convert_from_id: null,
    version: null,
    note: 'before update',
    directory: true,
    database: true,
    async_status: null,
    items: [],
    ...overrides,
  }
}

const list = () => [decorateBackup(row({ id: 1 })), decorateBackup(row({ id: 2, note: 'second' }))]

describe('applyBackupChanged', () => {
  it('replaces the row with the same id, decorated', () => {
    const result = applyBackupChanged(list(), row({ id: 2, note: 'renamed', async_status: { create: 'finished' } }))

    expect(result.matched).toBe(true)
    expect(result.items.map(item => item.id)).toEqual([1, 2])
    expect(result.items[1]?.note).toBe('renamed')
    expect(result.items[1]?.date).toBe('1700000000000')
    expect(result.items[1]?.async_status).toEqual({ create: 'finished' })
  })

  it('reports a backup that is not in the list as unmatched, with the list unchanged', () => {
    const items = list()
    const result = applyBackupChanged(items, row({ id: 99 }))

    expect(result.matched).toBe(false)
    expect(result.items).toBe(items)
  })

  it('ignores a payload without a numeric id', () => {
    const result = applyBackupChanged(list(), { id: '2', note: 'string id' })

    expect(result.matched).toBe(false)
  })

  it('ignores an absent payload', () => {
    expect(applyBackupChanged(list(), undefined).matched).toBe(false)
  })

  it('does not change the row it replaces in the input list', () => {
    const items = list()
    applyBackupChanged(items, row({ id: 1, note: 'changed' }))

    expect(items[0]?.note).toBe('before update')
  })
})

describe('applyBackupDeleted', () => {
  it('removes the row with the same id', () => {
    const result = applyBackupDeleted(list(), row({ id: 1 }))

    expect(result.matched).toBe(true)
    expect(result.items.map(item => item.id)).toEqual([2])
  })

  it('reports an id outside the list as unmatched', () => {
    const items = list()
    const result = applyBackupDeleted(items, row({ id: 42 }))

    expect(result.matched).toBe(false)
    expect(result.items).toBe(items)
  })

  it('ignores a payload without a numeric id', () => {
    expect(applyBackupDeleted(list(), { name: 'no id' }).matched).toBe(false)
  })
})

describe('asBackupRow', () => {
  it('accepts a body with a numeric id and no instance or application id', () => {
    const body = { id: 5, type: 'manual', date: 1 }

    expect(asBackupRow(body)).toBe(body)
  })

  it('rejects an absent body and a missing id', () => {
    expect(asBackupRow(undefined)).toBeNull()
    expect(asBackupRow({ type: 'manual' })).toBeNull()
  })
})
