// @vitest-environment node
import type { ParityException } from './exceptions'
import { describe, expect, it } from 'vitest'
import { deriveStatus } from './status'

function exception (overrides: Partial<ParityException>): ParityException {
  return {
    state: '*',
    reason: 'accepted',
    approvedBy: 'sebastian',
    date: '2026-10-01',
    ...overrides,
  }
}

describe('deriveStatus', () => {
  it('is PASS when nothing fails, even with exceptions present', () => {
    expect(deriveStatus([], [exception({})], 'login-email', 'light-desktop')).toEqual({ status: 'PASS', exceptionsApplied: [] })
  })

  it('is FAIL when a failing item has no exception', () => {
    const result = deriveStatus([{ probe: 'title', property: 'font-size' }], [], 'login-email', 'light-desktop')
    expect(result.status).toBe('FAIL')
    expect(result.exceptionsApplied).toEqual([])
  })

  it('is ACCEPTED when every failing item is matched', () => {
    const failing = [{ property: 'pixel' }, { probe: 'title', property: 'font-size' }]
    const result = deriveStatus(failing, [exception({ property: 'pixel' }), exception({ probe: 'title' })], 'login-email', 'light-desktop')
    expect(result.status).toBe('ACCEPTED')
    expect(result.exceptionsApplied).toHaveLength(2)
  })

  it('is FAIL when only some failing items are matched', () => {
    const failing = [{ property: 'pixel' }, { probe: 'title', property: 'font-size' }]
    const result = deriveStatus(failing, [exception({ property: 'pixel' })], 'login-email', 'light-desktop')
    expect(result.status).toBe('FAIL')
    expect(result.exceptionsApplied).toHaveLength(1)
  })
})
