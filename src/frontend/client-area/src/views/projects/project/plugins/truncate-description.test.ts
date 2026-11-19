import { describe, expect, it } from 'vitest'
import { truncateDescription } from './truncate-description'

describe('truncateDescription', () => {
  // Legacy keeps the last word out even for a short text: the search starts at 100 and reads past the end as empty.
  it('cuts the last word of a short description and keeps the space before the cut', () => {
    expect(truncateDescription('Short description.')).toBe('Short ')
  })

  it('cuts at the last space among the first 100 characters of a long description', () => {
    const text = `${'a'.repeat(99)} ${'b'.repeat(30)}`

    expect(truncateDescription(text)).toBe(`${'a'.repeat(99)} `)
  })

  // Legacy returned `undefined` here, so the table cell renders nothing.
  it('returns undefined when there is no space in the first 100 characters', () => {
    expect(truncateDescription('x'.repeat(150))).toBeUndefined()
    expect(truncateDescription('Oneword')).toBeUndefined()
  })

  it('treats a missing description as no space', () => {
    expect(truncateDescription(null)).toBeUndefined()
    expect(truncateDescription(undefined)).toBeUndefined()
    expect(truncateDescription('')).toBeUndefined()
  })
})
