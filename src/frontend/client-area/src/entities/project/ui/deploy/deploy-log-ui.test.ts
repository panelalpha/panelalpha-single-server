import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatLineTimestamp,
  formatSelectDate,
  isFailedStatus,
  pickDefaultDeployLog,
  TERMINAL_STATUSES,
} from './deploy-log-ui'

describe('pickDefaultDeployLog', () => {
  const logs = [
    { id: 3, status: 'finished' },
    { id: 2, status: 'failed' },
    { id: 1, status: 'cancelled' },
  ]

  it('returns null for an empty list', () => {
    expect(pickDefaultDeployLog([])).toBeNull()
  })

  it('opens on the newest run when it is still running', () => {
    const withRunning = [{ id: 4, status: 'running' }, ...logs]
    expect(pickDefaultDeployLog(withRunning)?.id).toBe(4)
  })

  it('opens on the newest run, not an older failed or cancelled one', () => {
    expect(pickDefaultDeployLog(logs)?.id).toBe(3)
    // A finished run with warnings is `finished` too: the cancelled run before it must not win.
    expect(pickDefaultDeployLog([{ id: 5, status: 'finished' }, { id: 4, status: 'cancelled' }])?.id).toBe(5)
  })

  it('opens on the only row of a one-run list', () => {
    expect(pickDefaultDeployLog([{ id: 9, status: 'finished' }])?.id).toBe(9)
  })

  it('keeps preserveId when that row still exists', () => {
    expect(pickDefaultDeployLog(logs, 1)?.id).toBe(1)
  })

  it('re-picks the newest run when preserveId is gone', () => {
    expect(pickDefaultDeployLog(logs, 99)?.id).toBe(3)
  })

  it('treats a non-array as an empty list', () => {
    expect(pickDefaultDeployLog(null)).toBeNull()
  })
})

describe('formatters', () => {
  it('formats a select date', () => {
    expect(formatSelectDate('2026-08-20 14:01:02')).toBe('2026-08-20 14:01')
  })

  it('formats a date-only and an ISO-local select date as local time', () => {
    expect(formatSelectDate('2026-08-20')).toBe('2026-08-20 00:00')
    expect(formatSelectDate('2026-08-20T14:01:02')).toBe('2026-08-20 14:01')
  })

  it('formats a unix line timestamp', () => {
    expect(formatLineTimestamp(1_755_691_262)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('uses em dash for missing values', () => {
    expect(formatSelectDate(null)).toBe('—')
    expect(formatLineTimestamp(0)).toBe('—')
    expect(formatLineTimestamp(null)).toBe('—')
  })

  it('formats duration as at least 1s', () => {
    expect(formatDuration('2026-08-20 14:01:00', '2026-08-20 14:01:00')).toBe('1s')
    expect(formatDuration('2026-08-20 14:01:00', '2026-08-20 14:01:12')).toBe('12s')
    expect(formatDuration('2026-08-20 14:01:00', null)).toBeNull()
  })
})

describe('status helpers', () => {
  it('treats finished as terminal', () => {
    expect(TERMINAL_STATUSES).toContain('finished')
  })

  it('marks failed and cancelled as failed-family', () => {
    expect(isFailedStatus('failed')).toBe(true)
    expect(isFailedStatus('cancelled')).toBe(true)
    expect(isFailedStatus('finished')).toBe(false)
  })
})
