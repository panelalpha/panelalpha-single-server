import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { describe, expect, it } from 'vitest'
import { modalFieldName } from '@/views/hosting/email-addresses/email-account-modals'
import { buildAddForwarderModal, buildDeleteForwarderModal } from './email-forwarder-modals'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

/** The rules of a field, run on a value: the first failing message, or `true` when all pass. */
function check (field: ModalField | undefined, value: unknown): boolean | string {
  const rules = field && 'rules' in field ? (field.rules ?? []) : []
  for (const rule of rules) {
    const result = rule(value)
    if (result !== true) {
      return result
    }
  }
  return true
}

function fieldNamed (fields: ModalField[], name: string): ModalField | undefined {
  return fields.find(field => modalFieldName(field) === name)
}

describe('buildAddForwarderModal', () => {
  it('has the add title, the plus icon and the Add and Cancel buttons', () => {
    const modal = buildAddForwarderModal({ domain: 'example.com' }, t)

    expect(modal.kind).toBe('add')
    expect(modal.title).toBe('heading.hosting.emailForwarders.modal.add.title')
    expect(modal.icon).toBe('$plus')
    expect(modal.buttons.map(button => [button.id, button.label])).toEqual([
      ['add', 'button.emailForwarder.add'],
      ['cancel', 'button.cancel'],
    ])
  })

  it('asks for the address on the selected domain, then the destination, with their tooltips', () => {
    const modal = buildAddForwarderModal({ domain: 'example.com' }, t)

    expect(modal.fields.map(field => field.type)).toEqual(['text-select', 'text'])
    expect(fieldNamed(modal.fields, 'email')).toMatchObject({
      type: 'text-select',
      textName: 'email',
      selectName: 'domain',
      suffix: '@',
      options: [{ label: 'example.com', value: 'example.com' }],
      tooltip: 'tooltip.add_forwarder.email',
    })
    expect(fieldNamed(modal.fields, 'destination')).toMatchObject({ type: 'text', tooltip: 'tooltip.add_forwarder.destination' })
  })

  it('requires a whole address (text@domain) with the required message', () => {
    const email = fieldNamed(buildAddForwarderModal({ domain: 'example.com' }, t).fields, 'email')

    expect(check(email, 'a@example.com')).toBe(true)
    expect(check(email, '@example.com')).toBe('form.validation.required:{"field":"form.label.email"}')
  })

  it('requires the destination first, then an address with an @', () => {
    const destination = fieldNamed(buildAddForwarderModal({ domain: 'example.com' }, t).fields, 'destination')

    expect(check(destination, '')).toBe('form.validation.required:{"field":"form.label.destination"}')
    expect(check(destination, 'abc')).toBe('form.validation.email:{"field":"form.label.destination"}')
    expect(check(destination, 'a@b')).toBe(true)
  })

  it('starts with the domain', () => {
    expect(buildAddForwarderModal({ domain: 'example.com' }, t).initialValues).toEqual({ domain: 'example.com' })
  })
})

describe('buildDeleteForwarderModal', () => {
  it('is an error modal with a required confirm checkbox and the Delete and Cancel buttons', () => {
    const modal = buildDeleteForwarderModal(t)

    expect(modal.kind).toBe('delete')
    expect(modal.title).toBe('heading.hosting.emailForwarders.modal.delete.title')
    expect(modal.color).toBe('error')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['delete', 'button.emailForwarder.delete', 'error'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields).toEqual([
      {
        type: 'checkbox',
        label: 'form.confirmDelete.emailForwarder',
        name: 'confirm',
        message: '<b>message.confirmAction</b>',
        required: true,
      },
    ])
    expect(modal.initialValues).toEqual({})
  })
})
