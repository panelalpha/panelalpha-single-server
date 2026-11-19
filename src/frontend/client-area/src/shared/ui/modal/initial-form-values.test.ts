import { describe, expect, it } from 'vitest'
import { initialFormValues } from './initial-form-values'

describe('initialFormValues', () => {
  it('starts every named field at null, as BasicModal did', () => {
    expect(initialFormValues([
      { label: 'Remove data', name: 'remove_data', type: 'checkbox' },
      { label: 'Confirm', name: 'confirm', type: 'checkbox', required: true },
    ])).toEqual({ remove_data: null, confirm: null })
  })

  it('skips fields without a name and returns an empty object for no fields', () => {
    expect(initialFormValues([{ message: '<b>Confirm</b>', type: 'checkbox' } as never])).toEqual({})
    expect(initialFormValues([])).toEqual({})
  })
})
