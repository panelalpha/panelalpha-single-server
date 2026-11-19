import { describe, expect, it } from 'vitest'
import { dataNames, hasCode, hasData } from '@/views/projects/project/backups/backup-parts'

describe('backup-parts', () => {
  it('reads parts when present', () => {
    const row = { parts: { files: true, volumes: ['v1'], databases: [] }, directory: false, database: false }
    expect(hasCode(row)).toBe(true)
    expect(hasData(row)).toBe(true)
    expect(dataNames(row)).toEqual({ volumes: ['v1'], databases: [] })
  })

  it('treats databases alone as data', () => {
    expect(hasData({ parts: { files: false, volumes: [], databases: ['db'] } })).toBe(true)
  })

  it('treats empty lists as no data, whatever the flags say', () => {
    const row = { parts: { files: false, volumes: [], databases: [] }, directory: true, database: true }
    expect(hasCode(row)).toBe(false)
    expect(hasData(row)).toBe(false)
    expect(dataNames(row)).toEqual({ volumes: [], databases: [] })
  })

  it('falls back to the flags with parts null', () => {
    const row = { parts: null, directory: true, database: false }
    expect(hasCode(row)).toBe(true)
    expect(hasData(row)).toBe(false)
    expect(dataNames(row)).toBeNull()
  })

  it('falls back to the flags without the field, numeric flags', () => {
    expect(hasCode({ directory: 1, database: 0 })).toBe(true)
    expect(hasData({ directory: 1, database: 0 })).toBe(false)
    expect(hasCode({ directory: 0, database: 1 })).toBe(false)
    expect(hasData({ directory: 0, database: 1 })).toBe(true)
    expect(dataNames({ directory: 1 })).toBeNull()
  })
})
