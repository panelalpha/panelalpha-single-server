import { describe, expect, it } from 'vitest'
import { formatBytes } from '@/shared/format/format-bytes'
import { fromNow } from '@/shared/time/from-now'
import { DATABASE_HEADERS, databaseRowClass, toDatabaseRows, toUserRows, USER_HEADERS, userRowClass } from './databases-table'

const NOW = new Date('2026-10-08T12:00:00Z')

const response = {
  data: [
    { id: 1, database: 'example_shop', disk_usage: 5_242_880, created_at: null, updated_at: '2026-10-06T12:00:00Z' },
    { database: 'example_blog', disk_usage: 0, created_at: null, updated_at: null },
  ],
  meta: { actions: { rename: true } },
}

describe('databases-table', () => {
  it('keeps the legacy header keys: database, size (disk_usage), updated (updated_at), actions', () => {
    expect(DATABASE_HEADERS.map(header => [header.text, header.value])).toEqual([
      ['database', 'database'],
      ['size', 'disk_usage'],
      ['updated', 'updated_at'],
      ['actions', 'actions'],
    ])
    expect(DATABASE_HEADERS[3]!.sortable).toBeUndefined()
  })

  it('replaces disk_usage with the formatted size, so sort and search read the text', () => {
    const [first] = toDatabaseRows(response, NOW)
    expect(first!.disk_usage).toBe(formatBytes(5_242_880))
    expect(first!.disk_usage).not.toBe(5_242_880)
  })

  it('keeps updated_at raw and adds the fromNow text (or "-" without a date)', () => {
    const [first, second] = toDatabaseRows(response, NOW)
    expect(first!.updated_at).toBe('2026-10-06T12:00:00Z')
    expect(first!.updated_at_text).toBe(fromNow('2026-10-06T12:00:00Z', NOW))
    expect(second!.updated_at).toBeNull()
    expect(second!.updated_at_text).toBe('-')
  })

  it('marks every row as renameable only when meta.actions.rename is true', () => {
    expect(toDatabaseRows(response, NOW).map(row => row.can_rename)).toEqual([true, true])
    expect(toDatabaseRows({ data: response.data, meta: {} }, NOW).map(row => row.can_rename)).toEqual([false, false])
    expect(toDatabaseRows({ data: response.data, meta: { actions: { rename: false } } }, NOW)[0]!.can_rename).toBe(false)
  })

  it('does not mutate the response rows', () => {
    toDatabaseRows(response, NOW)
    expect(response.data[0]!.disk_usage).toBe(5_242_880)
  })

  it('gives the highlighted database the highlight class and every other row none', () => {
    expect(databaseRowClass({ database: 'example_shop' }, 'example_shop')).toBe('highlight')
    expect(databaseRowClass({ database: 'example_blog' }, 'example_shop')).toBe('')
    expect(databaseRowClass({ database: 'example_shop' }, undefined)).toBe('')
  })

  it('keeps the legacy user header keys: user, assignedDatabases (not sortable), updated (updated_at), actions', () => {
    expect(USER_HEADERS.map(header => [header.text, header.value, header.sortable ?? false])).toEqual([
      ['user', 'user', true],
      ['assignedDatabases', 'databases', false],
      ['updated', 'updated_at', true],
      ['actions', 'actions', false],
    ])
  })

  it('maps each user to its database names and the fromNow text (or "-" without a date)', () => {
    const [first, second] = toUserRows({
      data: [
        { user: 'example_admin', databases: ['example_shop', 'example_blog'], created_at: null, updated_at: '2026-10-06T12:00:00Z' },
        { user: 'example_reader', databases: [], created_at: null, updated_at: null },
      ],
      meta: { require_database_to_create: false, privileges_supported: true, rename_supported: true },
    }, NOW)

    // Privileges null and showTooltip false until a tooltip or the modal fetches them
    expect(first!.databases).toEqual([
      { name: 'example_shop', privileges: null, showTooltip: false },
      { name: 'example_blog', privileges: null, showTooltip: false },
    ])
    expect(first!.updated_at).toBe('2026-10-06T12:00:00Z')
    expect(first!.updated_at_text).toBe(fromNow('2026-10-06T12:00:00Z', NOW))
    expect(second!.databases).toEqual([])
    expect(second!.updated_at_text).toBe('-')
  })

  it('gives the highlighted user the highlight class and every other row none', () => {
    expect(userRowClass({ user: 'example_admin' }, 'example_admin')).toBe('highlight')
    expect(userRowClass({ user: 'example_reader' }, 'example_admin')).toBe('')
    expect(userRowClass({ user: 'example_admin' }, undefined)).toBe('')
  })
})
