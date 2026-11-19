import type { DnsRow } from './dns'
import { describe, expect, it } from 'vitest'
import {
  buildAddRecordModal,
  buildDeleteRecordModal,
  buildEditRecordModal,
  buildProxyWarningModal,
  PROXY_ENABLE_BUTTON_ID,
  RECORD_ADD_BUTTON_ID,
  RECORD_DELETE_BUTTON_ID,
  RECORD_UPDATE_BUTTON_ID,
} from './dns-modals'
import { ADD_ITEM } from './dns-record-fields'

const t = (key: string, options?: Record<string, unknown>) => options ? `${key} ${JSON.stringify(options)}` : key

const recordTypes = [{ label: 'A', value: 'A' }, { label: 'TXT', value: 'TXT' }]
const context = { zoneName: 'a<b>.example.com', allowProxy: true, recordTypes }

function row (overrides: Partial<DnsRow>): DnsRow {
  return { name: 'www.example.com', ttl: 3600, type: 'A', content: '1.2.3.4', line: 1, loading: false, ...overrides }
}

describe('buildProxyWarningModal', () => {
  it('builds the warning with the legacy title, message and alert keys, the warning icon and colour', () => {
    const modal = buildProxyWarningModal(t)

    expect(modal.kind).toBe('proxyWarning')
    expect(modal.title).toBe('heading.hosting.dns.modal.proxy-warning.title')
    expect(modal.message).toBe('heading.hosting.dns.modal.proxy-warning.info')
    expect(modal.alert).toBe('heading.hosting.dns.modal.proxy-warning.alert')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('warning')
    expect(modal.fields).toEqual([])
    expect(modal.initialValues).toEqual({})
  })

  it('has the primary enable button first and the cancel button last', () => {
    const { buttons } = buildProxyWarningModal(t)

    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toMatchObject({ id: PROXY_ENABLE_BUTTON_ID, label: 'button.dns.proxy.enable', color: 'primary' })
    expect(buttons[1]).toMatchObject({ id: 'cancel', label: 'button.cancel', type: 'cancel' })
  })
})

describe('buildAddRecordModal', () => {
  it('builds the Add modal with the plus icon, the add title and the legacy start values', () => {
    const modal = buildAddRecordModal(t, context)

    expect(modal.kind).toBe('add')
    expect(modal.title).toBe('heading.hosting.dns.modal.add.title')
    expect(modal.icon).toBe('$plus')
    expect(modal.initialValues).toMatchObject({ type: 'A', ttl: '14400', tag: 'issue', name: null, address: null })
    expect(modal.initialValues).toEqual(expect.objectContaining(ADD_ITEM))
  })

  it('escapes the zone name in the message and keeps the legacy zone wrapper', () => {
    const modal = buildAddRecordModal(t, context)

    expect(modal.message).toBe(`heading.hosting.dns.modal.update.message {"zone":"<strong>a&lt;b&gt;.example.com</strong>"}`)
  })

  it('has the primary add button first and the cancel button last', () => {
    const { buttons } = buildAddRecordModal(t, context)

    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toMatchObject({ id: RECORD_ADD_BUTTON_ID, label: 'button.dns.add', color: 'primary' })
    expect(buttons[1]).toMatchObject({ id: 'cancel', label: 'button.cancel' })
  })

  it('builds the fields for an A record with the type select editable', () => {
    const { fields } = buildAddRecordModal(t, context)
    const typeField = fields.find(field => 'name' in field && field.name === 'type')
    const addressField = fields.find(field => 'name' in field && field.name === 'address')

    expect(typeField).toMatchObject({ readonly: false })
    expect(addressField).toMatchObject({ hidden: false })
  })
})

describe('buildEditRecordModal', () => {
  it('builds the Edit modal with the edit icon, the update title and the update button', () => {
    const modal = buildEditRecordModal(t, row({}), context)

    expect(modal.kind).toBe('edit')
    expect(modal.title).toBe('heading.hosting.dns.modal.update.title')
    expect(modal.icon).toBe('$edit')
    expect(modal.buttons[0]).toMatchObject({ id: RECORD_UPDATE_BUTTON_ID, label: 'button.update', color: 'primary' })
    expect(modal.buttons[1]).toMatchObject({ id: 'cancel' })
  })

  it('uses the same escaped zone message as Add', () => {
    expect(buildEditRecordModal(t, row({}), context).message).toBe(buildAddRecordModal(t, context).message)
  })

  it('makes the type readonly and builds the fields of the record type', () => {
    const { fields } = buildEditRecordModal(t, row({ type: 'TXT', txtdata: 'v=spf1' }), context)
    const typeField = fields.find(field => 'name' in field && field.name === 'type')
    const txtField = fields.find(field => 'name' in field && field.name === 'txtdata')

    expect(typeField).toMatchObject({ readonly: true })
    expect(txtField).toMatchObject({ hidden: false })
  })

  it('starts with the record values and strips the quotes of a TXT value on a copy only', () => {
    const record = row({ type: 'TXT', name: 'txt.example.com', txtdata: '"v=spf1"' })
    const modal = buildEditRecordModal(t, record, context)

    expect(modal.initialValues).toMatchObject({ type: 'TXT', name: 'txt.example.com', txtdata: 'v=spf1', line: 1 })
    expect(record.txtdata).toBe('"v=spf1"')
  })

  it('keeps a TXT value without quotes as it is', () => {
    const modal = buildEditRecordModal(t, row({ type: 'TXT', txtdata: 'plain' }), context)

    expect(modal.initialValues).toMatchObject({ txtdata: 'plain' })
  })

  it('fills the fields the record does not have with null', () => {
    const modal = buildEditRecordModal(t, row({}), context)

    expect(modal.initialValues).toMatchObject({ address: null, tag: null, preference: null })
  })
})

describe('buildDeleteRecordModal', () => {
  it('builds the warning with the legacy title, the error colour and the warning icon, and no record in the message', () => {
    const modal = buildDeleteRecordModal(t)

    expect(modal.kind).toBe('delete')
    expect(modal.title).toBe('heading.hosting.dns.modal.delete.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('error')
    expect(modal.message).toBeUndefined()
    expect(modal.initialValues).toEqual({})
  })

  it('has the error Delete button first and the cancel button last', () => {
    const { buttons } = buildDeleteRecordModal(t)

    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toMatchObject({ id: RECORD_DELETE_BUTTON_ID, label: 'button.delete', color: 'error' })
    expect(buttons[1]).toMatchObject({ id: 'cancel', label: 'button.cancel', type: 'cancel' })
  })

  it('has one required confirm checkbox with the legacy label and the bold confirm message', () => {
    const { fields } = buildDeleteRecordModal(t)

    expect(fields).toEqual([
      {
        type: 'checkbox',
        label: 'form.confirmDelete.dns',
        name: 'confirm',
        message: '<b>message.confirmAction</b>',
        required: true,
      },
    ])
  })
})
