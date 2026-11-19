// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { pickFromSequence } from './sequence'

describe('pickFromSequence', () => {
  it('answers every call with a single value', () => {
    expect(pickFromSequence('hold', 0)).toBe('hold')
    expect(pickFromSequence('hold', 5)).toBe('hold')
  })

  it('walks a sequence and repeats the last element', () => {
    const sequence = ['a', 'b', 'hold'] as const
    expect([0, 1, 2, 3, 10].map(index => pickFromSequence(sequence, index))).toEqual(['a', 'b', 'hold', 'hold', 'hold'])
  })

  it('treats a one-element sequence like a single value', () => {
    expect(pickFromSequence(['only'], 3)).toBe('only')
  })

  it('does not unwrap plain objects', () => {
    const spec = { json: [1, 2, 3] }
    expect(pickFromSequence(spec, 1)).toBe(spec)
  })

  it('rejects an empty sequence', () => {
    expect(() => pickFromSequence([], 0)).toThrow('empty handler sequence')
  })
})
