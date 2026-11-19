import { describe, expect, it } from 'vitest'
import { isIndeterminate, pendingBodyName, progressValue } from './instance-pending'

describe('instance-pending', () => {
  it('names the message block step only while a bar runs', () => {
    expect(pendingBodyName('in_progress', 'indeterminate')).toBe('step')
    expect(pendingBodyName('in_progress', 40)).toBe('step')
    expect(pendingBodyName('in_progress', undefined)).toBe('text')
    expect(pendingBodyName('error', 100)).toBe('text')
    expect(pendingBodyName('success', undefined)).toBe('text')
  })

  it('reads the bar state', () => {
    expect(isIndeterminate('indeterminate')).toBe(true)
    expect(isIndeterminate(0)).toBe(false)
    expect(isIndeterminate(undefined)).toBe(false)
    expect(progressValue(40)).toBe(40)
    expect(progressValue(0)).toBe(0)
    expect(progressValue('indeterminate')).toBe(0)
    expect(progressValue(undefined)).toBe(0)
  })
})
