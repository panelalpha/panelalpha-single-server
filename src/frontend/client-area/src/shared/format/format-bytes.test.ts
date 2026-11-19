import { describe, expect, it } from 'vitest'
import { formatBytes } from './format-bytes'

describe('formatBytes (legacy Helper.formatBytes)', () => {
  it('formats zero and null as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes('0')).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
  })

  it('keeps one decimal and the long unit under one byte', () => {
    expect(formatBytes(0.5)).toBe('0.5 Bytes')
  })

  it('uses base 1024 and the unit of the largest fitting power', () => {
    expect(formatBytes(1)).toBe('1 Bytes')
    expect(formatBytes(1023)).toBe('1023 Bytes')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 ** 2)).toBe('1 MB')
    expect(formatBytes(1024 ** 3)).toBe('1 GB')
    expect(formatBytes(5_368_709_120)).toBe('5 GB')
    expect(formatBytes(5 * 1024 ** 4)).toBe('5 TB')
  })

  it('rounds to two decimals and drops trailing zeros', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 ** 3 * 1.2345)).toBe('1.23 GB')
    expect(formatBytes(1024 ** 3 * 1.23456)).toBe('1.23 GB')
    expect(formatBytes(1024 ** 2 * 2.001)).toBe('2 MB')
  })

  it('honours the decimals argument', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB')
    expect(formatBytes(1024 ** 3 * 1.2345, 0)).toBe('1 GB')
    expect(formatBytes(1024 ** 3 * 1.23456, 3)).toBe('1.235 GB')
  })
})
