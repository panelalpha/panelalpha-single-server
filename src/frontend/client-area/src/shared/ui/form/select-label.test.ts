import { describe, expect, it } from 'vitest'
import { getItemLabel, getSelectionLabel, type SelectLabelOptions } from './select-label'

const t = (key: string) => `t:${key}`

function options (extra: Partial<SelectLabelOptions> = {}): SelectLabelOptions {
  return {
    items: [{ text: 'one', value: 'a' }, { text: 'two', value: 'b' }],
    itemValue: 'value',
    placeholder: 'Pick',
    t,
    ...extra,
  }
}

describe('getItemLabel', () => {
  it('returns an empty string for null and undefined', () => {
    expect(getItemLabel(null, options())).toBe('')
    expect(getItemLabel(undefined, options())).toBe('')
  })

  it('translates the text of an object item with form.option.<text>', () => {
    expect(getItemLabel({ text: 'one', value: 'a' }, options())).toBe('t:form.option.one')
  })

  it('returns the raw text when rawItemText is set, or an empty string without text', () => {
    expect(getItemLabel({ text: 'one' }, options({ rawItemText: true }))).toBe('one')
    expect(getItemLabel({ value: 'a' }, options({ rawItemText: true }))).toBe('')
  })

  it('returns an object without text as is', () => {
    const item = { value: 'a' }
    expect(getItemLabel(item, options())).toBe(item)
  })

  it('resolves a primitive through itemValue to its item label', () => {
    expect(getItemLabel('b', options())).toBe('t:form.option.two')
    expect(getItemLabel('b', options({ rawItemText: true }))).toBe('two')
  })

  it('returns an unmatched primitive unchanged', () => {
    expect(getItemLabel('zzz', options())).toBe('zzz')
    expect(getItemLabel(5, options())).toBe(5)
  })

  it('never matches a primitive when itemValue is not set', () => {
    expect(getItemLabel('b', options({ itemValue: undefined }))).toBe('b')
  })

  it('does not throw on primitive or null entries in items', () => {
    expect(getItemLabel('b', options({ items: ['b', null] }))).toBe('b')
  })
})

describe('getSelectionLabel', () => {
  it('shows the placeholder for null, undefined and empty string', () => {
    expect(getSelectionLabel(null, options())).toBe('Pick')
    expect(getSelectionLabel(undefined, options())).toBe('Pick')
    expect(getSelectionLabel('', options())).toBe('Pick')
  })

  it('shows an empty string when there is no placeholder', () => {
    expect(getSelectionLabel('', options({ placeholder: undefined }))).toBe('')
  })

  it('keeps 0 as a selected value', () => {
    expect(getSelectionLabel(0, options())).toBe(0)
  })

  it('delegates to getItemLabel otherwise', () => {
    expect(getSelectionLabel({ text: 'one' }, options())).toBe('t:form.option.one')
  })
})
