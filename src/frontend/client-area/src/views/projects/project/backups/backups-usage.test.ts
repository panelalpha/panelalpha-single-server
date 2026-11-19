import type { BackupItem } from './backups-list'
import type { BackupsUsage } from '@/entities/project/instance-backups.api'
import { describe, expect, it } from 'vitest'
import { decorateBackup } from './backups-list'
import {
  addNewLimitKey,
  canCreateManualBackup,
  isManualLimitReached,
  isSizeLimitReached,
  recountUsage,
  usageChips,
} from './backups-usage'

const GIB = 1024 * 1024 * 1024

function item (type: 'manual' | 'automatic', size: number | null): BackupItem {
  return decorateBackup({
    id: Math.random(),
    name: null,
    date: 1_700_000_000,
    size,
    type,
    mode: null,
    convert_from_id: null,
    version: null,
    note: null,
    directory: true,
    database: true,
    async_status: null,
    items: [],
  })
}

describe('usageChips', () => {
  it('returns the chips in legacy order, whatever the order of the keys', () => {
    const usage: BackupsUsage = {
      backups_size: { total: '1.00', max: 5 },
      automatic_backups_number: { total: 2, max: null },
      manual_backups_number: { total: 1, max: 3 },
    }

    expect(usageChips(usage).map(chip => chip.name)).toEqual([
      'manual_backups_number',
      'automatic_backups_number',
      'backups_size',
    ])
  })

  it('skips the keys that are absent or null', () => {
    const usage: BackupsUsage = {
      manual_backups_number: null,
      backups_size: { total: '0.00', max: 2 },
    }

    expect(usageChips(usage).map(chip => chip.name)).toEqual(['backups_size'])
  })

  it('returns no chips for WP Cloud usage keys', () => {
    const usage: BackupsUsage = {
      database_manual_backups_number: { total: 1, max: 4 },
      directory_manual_backups_number: { total: 0, max: 4 },
    }

    expect(usageChips(usage)).toEqual([])
  })
})

describe('limits', () => {
  it('reaches the manual limit when the total equals the max', () => {
    expect(isManualLimitReached({ manual_backups_number: { total: 5, max: 5 } })).toBe(true)
    expect(isManualLimitReached({ manual_backups_number: { total: 4, max: 5 } })).toBe(false)
  })

  it('never reaches an unlimited limit', () => {
    expect(isManualLimitReached({ manual_backups_number: { total: 99, max: null } })).toBe(false)
    expect(isSizeLimitReached({ backups_size: { total: '99.00', max: null } })).toBe(false)
  })

  it('reaches the size limit by comparing the numbers', () => {
    expect(isSizeLimitReached({ backups_size: { total: '2.00', max: 2 } })).toBe(true)
    expect(isSizeLimitReached({ backups_size: { total: '1.99', max: 2 } })).toBe(false)
  })

  it('names the manual count first, then the size, for the disabled button', () => {
    expect(addNewLimitKey({
      manual_backups_number: { total: 3, max: 3 },
      backups_size: { total: '9.00', max: 1 },
    })).toBe('heading.instance.backups.limit.manual_count')

    expect(addNewLimitKey({ backups_size: { total: '1.00', max: 1 } })).toBe('heading.instance.backups.limit.size')
    expect(addNewLimitKey({ manual_backups_number: { total: 1, max: 3 } })).toBeNull()
  })

  it('allows a new backup only when neither limit is reached', () => {
    expect(canCreateManualBackup({ manual_backups_number: { total: 3, max: 3 } })).toBe(false)
    expect(canCreateManualBackup({ backups_size: { total: '2.00', max: 2 } })).toBe(false)
    expect(canCreateManualBackup({})).toBe(true)
  })
})

describe('recountUsage', () => {
  const usage: BackupsUsage = {
    manual_backups_number: { total: 9, max: 5 },
    automatic_backups_number: { total: 9, max: null },
    backups_size: { total: '9.00', max: 10 },
  }

  it('counts the manual and automatic backups by type', () => {
    const next = recountUsage(usage, [item('manual', 1), item('manual', 2), item('automatic', 3)])

    expect(next.manual_backups_number).toEqual({ total: 2, max: 5 })
    expect(next.automatic_backups_number).toEqual({ total: 1, max: null })
  })

  it('sums the size in bytes into GB with two decimals, treating a missing size as zero', () => {
    const next = recountUsage(usage, [item('manual', GIB), item('automatic', GIB / 2), item('manual', null)])

    expect(next.backups_size).toEqual({ total: '1.50', max: 10 })
  })

  it('counts only the keys the server sent', () => {
    const next = recountUsage({ backups_size: { total: '0.00', max: 1 } }, [item('manual', GIB)])

    expect(next).toEqual({ backups_size: { total: '1.00', max: 1 } })
  })

  it('returns a new object and leaves the input alone', () => {
    const before = structuredClone(usage)
    const next = recountUsage(usage, [item('manual', 1)])

    expect(next).not.toBe(usage)
    expect(usage).toEqual(before)
  })
})
