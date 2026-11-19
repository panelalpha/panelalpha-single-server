import { describe, expect, it } from 'vitest'
import { effectiveTransferRecord, transferOutcome } from './transfer-domain'

describe('transferOutcome', () => {
  it('asks for the record again while verification is required', () => {
    const record = { type: 'TXT', name: '_x.example.org', content: 'abc' }
    expect(transferOutcome({ verification_required: true, verification_record: record })).toEqual({ kind: 'record-required', record })
  })

  it('goes on to the add when no verification is required', () => {
    expect(transferOutcome({ verification_required: false })).toEqual({ kind: 'transfer' })
    expect(transferOutcome({})).toEqual({ kind: 'transfer' })
    expect(transferOutcome(undefined)).toEqual({ kind: 'transfer' })
  })
})

describe('effectiveTransferRecord', () => {
  it('prefers the record of the last check', () => {
    expect(effectiveTransferRecord({ content: 'new' }, { content: 'old' })).toEqual({ content: 'new' })
  })

  it('falls back to the record of the Add check, then to nothing', () => {
    expect(effectiveTransferRecord(null, { content: 'old' })).toEqual({ content: 'old' })
    expect(effectiveTransferRecord(null, undefined)).toBeNull()
  })
})
