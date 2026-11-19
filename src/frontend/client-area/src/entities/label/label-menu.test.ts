import { describe, expect, it } from 'vitest'
import { isSameLabel, LABEL_COLORS, labelMenuLeft, labelMenuTop, labelsToAssign, validateNewLabel } from './label-menu'

describe('labelsToAssign', () => {
  it('drops account labels already on the instance, matched by title', () => {
    const account = [
      { id: 1, title: 'Production', color: '#07C07E' },
      { id: 2, title: 'Client', color: '#2F80ED' },
      { id: 3, title: 'Staging', color: '#F2994A' },
    ]
    expect(labelsToAssign(account, [{ title: 'Client' }])).toEqual([account[0], account[2]])
  })

  it('matches by title only, so a label with another id but the same title is still assigned', () => {
    const account = [{ id: 9, title: 'Production', color: '#000000' }]
    expect(labelsToAssign(account, [{ title: 'Production' }])).toEqual([])
  })

  it('returns everything when the instance has no labels', () => {
    const account = [{ title: 'Alpha' }, { title: 'Beta' }]
    expect(labelsToAssign(account, [])).toEqual(account)
  })
})

describe('isSameLabel', () => {
  it('compares by id when both sides carry one, even if the colour differs', () => {
    expect(isSameLabel({ id: 1, title: 'A', color: '#111111' }, { id: 1, title: 'A', color: '#222222' })).toBe(true)
    expect(isSameLabel({ id: 1, title: 'A' }, { id: 2, title: 'A' })).toBe(false)
  })

  it('falls back to title and colour when an id is missing', () => {
    expect(isSameLabel({ title: 'A', color: '#111111' }, { title: 'A', color: '#111111' })).toBe(true)
    expect(isSameLabel({ title: 'A', color: '#111111' }, { title: 'A', color: '#222222' })).toBe(false)
    expect(isSameLabel({ id: 1, title: 'A' }, { title: 'A' })).toBe(true)
  })
})

describe('validateNewLabel', () => {
  it('rejects a title shorter than 3 characters and accepts 3', () => {
    expect(validateNewLabel({ title: 'ab', color: '#EB6464' })).toBe('min-length')
    expect(validateNewLabel({ title: 'abc', color: '#EB6464' })).toBeNull()
  })

  it('rejects a title longer than 18 characters and accepts 18', () => {
    expect(validateNewLabel({ title: 'a'.repeat(18), color: '#EB6464' })).toBeNull()
    expect(validateNewLabel({ title: 'a'.repeat(19), color: '#EB6464' })).toBe('max-length')
  })

  it('requires a colour once the title is valid', () => {
    expect(validateNewLabel({ title: 'abc', color: '' })).toBe('color-required')
    expect(validateNewLabel({ title: 'abc' })).toBe('color-required')
  })

  it('checks the title before the colour, as the legacy form does', () => {
    expect(validateNewLabel({ title: 'a' })).toBe('min-length')
    expect(validateNewLabel({ title: 'a'.repeat(19) })).toBe('max-length')
  })
})

describe('labelMenuTop', () => {
  it('opens under the activator when the content fits', () => {
    expect(labelMenuTop(100, 170, 812)).toBe(108)
  })

  it('moves up to end 12px above the viewport bottom when it would overflow', () => {
    expect(labelMenuTop(670, 170, 812)).toBe(630)
  })
})

describe('labelMenuLeft', () => {
  it('keeps the activator left when the content fits', () => {
    expect(labelMenuLeft(40, 200, 375)).toBe(40)
  })

  it('shifts left so the content ends 12px before the viewport edge', () => {
    expect(labelMenuLeft(40, 354, 375)).toBe(9)
  })
})

describe('LABEL_COLORS', () => {
  it('has the 18 legacy colours in legacy order', () => {
    expect(LABEL_COLORS).toHaveLength(18)
    expect(LABEL_COLORS[0]).toBe('#EB6464')
    expect(LABEL_COLORS[17]).toBe('#D72E23')
  })
})
