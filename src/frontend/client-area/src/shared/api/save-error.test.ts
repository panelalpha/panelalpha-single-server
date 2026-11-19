import { describe, expect, it } from 'vitest'
import { splitSaveError } from './save-error'

const failure = (data: unknown) => ({ response: { status: 422, data } })

const FIELDS = ['name', 'default_language']

describe('splitSaveError', () => {
  it('puts the keys of the form under their field, without a prefix, and the rest on the list', () => {
    const result = splitSaveError(failure({ errors: { name: ['Taken.'], url: ['Wrong.', 'Odd.'] } }), FIELDS)
    expect(result).toEqual({ fields: { name: ['Taken.'] }, messages: ['Wrong.', 'Odd.'] })
  })

  it('moves a field the form does not show to the list', () => {
    const result = splitSaveError(failure({ errors: { name: ['Taken.'], default_language: ['Bad.'] } }), FIELDS, key => key !== 'name')
    expect(result).toEqual({ fields: { default_language: ['Bad.'] }, messages: ['Taken.'] })
  })

  it('lists a 422 with only a message', () => {
    expect(splitSaveError(failure({ message: 'Invalid.' }), FIELDS)).toEqual({ fields: {}, messages: ['Invalid.'] })
  })

  it('gives null for anything but a 422', () => {
    expect(splitSaveError({ response: { status: 500, data: {} } }, FIELDS)).toBeNull()
    expect(splitSaveError(new Error('offline'), FIELDS)).toBeNull()
  })
})
