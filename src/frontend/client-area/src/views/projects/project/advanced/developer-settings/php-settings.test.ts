import type { PhpSettingRow, SuggestedDirective } from './developer-settings.api'
import { describe, expect, it } from 'vitest'
import { applySuggestedMeta, enrichDirective, newDirectiveRow, onDirectiveChange, workingCopy } from './php-settings'

const SUGGESTED: SuggestedDirective[] = [
  { directive: 'session.save_handler', type: 'select', options: ['files', 'redis'] },
  { directive: 'memory_limit' },
]

describe('enrichDirective', () => {
  it('sets select type and options from a select suggestion', () => {
    const row: PhpSettingRow = { directive: 'session.save_handler', value: 'files' }

    expect(enrichDirective(row, SUGGESTED)).toEqual({
      directive: 'session.save_handler',
      value: 'files',
      editing: false,
      type: 'select',
      options: ['files', 'redis'],
    })
  })

  it('sets text type and empty options from a suggestion without a type', () => {
    const row: PhpSettingRow = { directive: 'memory_limit', value: '256M' }

    expect(enrichDirective(row, SUGGESTED)).toEqual({
      directive: 'memory_limit',
      value: '256M',
      editing: false,
      type: 'text',
      options: [],
    })
  })

  it('leaves type and options unset when there is no suggestion', () => {
    const enriched = enrichDirective({ directive: 'custom.flag', value: 'on' }, SUGGESTED)

    expect(enriched.editing).toBe(false)
    expect(enriched).not.toHaveProperty('type')
    expect(enriched).not.toHaveProperty('options')
  })

  it('does not mutate the input row', () => {
    const row: PhpSettingRow = { directive: 'memory_limit', value: '256M' }

    enrichDirective(row, SUGGESTED)

    expect(row).toEqual({ directive: 'memory_limit', value: '256M' })
  })
})

describe('applySuggestedMeta', () => {
  it('flattens a suggestion object to its name and sets its meta', () => {
    const row = { directive: { directive: 'session.save_handler' }, value: '' } as unknown as PhpSettingRow

    applySuggestedMeta(row, SUGGESTED)

    expect(row.directive).toBe('session.save_handler')
    expect(row.type).toBe('select')
    expect(row.options).toEqual(['files', 'redis'])
  })

  it('sets text and empty options for a name that is not suggested', () => {
    const row: PhpSettingRow = { directive: 'custom.flag', value: 'on', type: 'select', options: ['on'] }

    applySuggestedMeta(row, SUGGESTED)

    expect(row.directive).toBe('custom.flag')
    expect(row.type).toBe('text')
    expect(row.options).toEqual([])
  })
})

describe('onDirectiveChange', () => {
  it('clears the value when a select is switched to a value outside its options', () => {
    const row: PhpSettingRow = { directive: 'session.save_handler', value: 'memcached' }

    onDirectiveChange(row, SUGGESTED)

    expect(row.type).toBe('select')
    expect(row.value).toBe('')
  })

  it('keeps the value when it is one of the select options', () => {
    const row: PhpSettingRow = { directive: 'session.save_handler', value: 'redis' }

    onDirectiveChange(row, SUGGESTED)

    expect(row.value).toBe('redis')
  })

  it('keeps the value when the select has no options', () => {
    const suggested: SuggestedDirective[] = [{ directive: 'opt.empty', type: 'select', options: [] }]
    const row: PhpSettingRow = { directive: 'opt.empty', value: 'anything' }

    onDirectiveChange(row, suggested)

    expect(row.type).toBe('select')
    expect(row.value).toBe('anything')
  })

  it('keeps the value for a text directive', () => {
    const row: PhpSettingRow = { directive: 'memory_limit', value: '512M' }

    onDirectiveChange(row, SUGGESTED)

    expect(row.type).toBe('text')
    expect(row.value).toBe('512M')
  })
})

describe('newDirectiveRow', () => {
  it('returns an empty custom row in edit mode', () => {
    expect(newDirectiveRow()).toEqual({ directive: '', value: '', editing: true, type: 'text', options: [] })
  })
})

describe('workingCopy', () => {
  it('copies rows and their options so edits do not reach the original', () => {
    const original: PhpSettingRow[] = [
      { directive: 'session.save_handler', value: 'files', editing: false, type: 'select', options: ['files', 'redis'] },
    ]

    const copy = workingCopy(original)
    copy[0].value = 'redis'
    copy[0].options?.push('memcached')
    copy[0].editing = true

    expect(original[0].value).toBe('files')
    expect(original[0].options).toEqual(['files', 'redis'])
    expect(original[0].editing).toBe(false)
    expect(copy[0].options).toEqual(['files', 'redis', 'memcached'])
  })

  it('returns rows without options unchanged in shape', () => {
    const copy = workingCopy([{ directive: 'memory_limit', value: '256M' }])

    expect(copy).toEqual([{ directive: 'memory_limit', value: '256M' }])
    expect(copy[0]).not.toHaveProperty('options')
  })
})
