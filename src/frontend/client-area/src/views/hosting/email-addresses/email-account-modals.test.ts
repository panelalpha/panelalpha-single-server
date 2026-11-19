import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { describe, expect, it } from 'vitest'
import {
  accountPayload,
  buildAddAccountModal,
  buildDeleteAccountModal,
  buildEditAccountModal,
  modalFieldName,
  revealPassword,
  toggleQuotaHidden,
} from './email-account-modals'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

/** The rules of a named field, run on a value: the first failing message, or `true` when all pass. */
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

describe('buildAddAccountModal', () => {
  it('asks for the address on the selected domain, a generated password, the unlimited quota and a hidden quota', () => {
    const modal = buildAddAccountModal({ domain: 'example.com' }, t)

    expect(modal.kind).toBe('add')
    expect(modal.title).toBe('heading.hosting.emailAddress.modal.add.title')
    expect(modal.icon).toBe('$plus')
    expect(modal.fields.map(field => field.type)).toEqual(['text-select', 'generatePassword', 'checkbox', 'text'])
    expect(fieldNamed(modal.fields, 'email')).toMatchObject({
      type: 'text-select',
      textName: 'email',
      selectName: 'domain',
      suffix: '@',
      options: [{ label: 'example.com', value: 'example.com' }],
      tooltip: 'tooltip.add_email_account.email',
    })
    expect(fieldNamed(modal.fields, 'quota')).toMatchObject({ hidden: true })
    expect(modal.buttons.map(button => button.id)).toEqual(['add', 'cancel'])
  })

  it('starts with the domain and an unlimited quota', () => {
    const modal = buildAddAccountModal({ domain: 'example.com' }, t)

    expect(modal.initialValues).toEqual({ domain: 'example.com', unlimited_quota: true })
  })

  it('requires a whole address (email@domain) on blur', () => {
    const email = fieldNamed(buildAddAccountModal({ domain: 'example.com' }, t).fields, 'email')

    expect(check(email, 'info@example.com')).toBe(true)
    expect(check(email, 'info')).toBe('form.validation.required:{"field":"form.label.email"}')
    expect(check(email, '')).toBe('form.validation.required:{"field":"form.label.email"}')
  })

  it('requires the password and at least 8 characters', () => {
    const password = fieldNamed(buildAddAccountModal({ domain: 'example.com' }, t).fields, 'password')

    expect(check(password, null)).toBe('form.validation.required:{"field":"form.label.password"}')
    expect(check(password, 'short')).toBe('form.validation.minLength:{"field":"form.label.password","length":8}')
    expect(check(password, 'exactly8')).toBe(true)
  })
})

describe('buildEditAccountModal', () => {
  it('titles the modal with the address escaped, since the title is trusted HTML', () => {
    // The title carries the address in a nowrap span
    const modal = buildEditAccountModal({ email: 'a<b>@example.com', disk_quota: 512 }, t)

    expect(modal.kind).toBe('edit')
    expect(modal.icon).toBe('$edit')
    expect(modal.title).toBe(
      String.raw`heading.hosting.emailAddress.modal.update.title:{"email":"<span class=\"text-break-long\">a&lt;b&gt;@example.com</span>"}`,
    )
  })

  it('starts with the password hidden behind "Set New Password", then the unlimited checkbox and the quota', () => {
    const modal = buildEditAccountModal({ email: 'info@example.com', disk_quota: 512 }, t)

    expect(modal.fields.map(field => field.type)).toEqual(['hiddenPassword', 'generatePassword', 'checkbox', 'text'])
    expect(fieldNamed(modal.fields, 'hiddenPassword')).toMatchObject({ type: 'hiddenPassword' })
    expect(fieldNamed(modal.fields, 'password')).toMatchObject({ hidden: true })
    expect(modal.buttons.map(button => button.id)).toEqual(['update', 'cancel'])
  })

  it('shows the quota of a limited account, with the disk quota as the starting value', () => {
    const modal = buildEditAccountModal({ email: 'info@example.com', disk_quota: 512 }, t)

    expect(fieldNamed(modal.fields, 'quota')).toMatchObject({ hidden: false })
    expect(modal.initialValues).toEqual({ hiddenPassword: null, password: null, unlimited_quota: false, quota: 512 })
  })

  it('hides the quota of an unlimited account and starts it empty with unlimited checked', () => {
    const modal = buildEditAccountModal({ email: 'sales@example.com', disk_quota: 'unlimited' }, t)

    expect(fieldNamed(modal.fields, 'quota')).toMatchObject({ hidden: true })
    expect(modal.initialValues).toEqual({ hiddenPassword: null, password: null, unlimited_quota: true, quota: '' })
  })

  it('accepts an untouched hidden password (null), and requires at least 8 characters once it is revealed', () => {
    const password = fieldNamed(buildEditAccountModal({ email: 'info@example.com', disk_quota: 512 }, t).fields, 'password')

    expect(check(password, null)).toBe(true)
    expect(check(password, '')).toBe('form.validation.required:{"field":"form.label.password"}')
    expect(check(password, 'short')).toBe('form.validation.minLength:{"field":"form.label.password","length":8}')
    expect(check(password, 'exactly8')).toBe(true)
  })
})

describe('accountPayload', () => {
  it('sends quota 0 for an unlimited account and keeps the other values', () => {
    expect(accountPayload({ unlimited_quota: true, quota: '', domain: 'example.com' })).toEqual({
      unlimited_quota: true,
      quota: 0,
      domain: 'example.com',
    })
  })

  it('sends the quota as typed for a limited account', () => {
    expect(accountPayload({ unlimited_quota: false, quota: 512 })).toEqual({ unlimited_quota: false, quota: 512 })
  })
})

describe('toggleQuotaHidden', () => {
  it('shows the quota field while the account is limited, and hides it while unlimited', () => {
    const modal = buildAddAccountModal({ domain: 'example.com' }, t)
    const quota = fieldNamed(modal.fields, 'quota')

    toggleQuotaHidden(modal.fields, false)
    expect(quota).toMatchObject({ hidden: false })

    toggleQuotaHidden(modal.fields, true)
    expect(quota).toMatchObject({ hidden: true })
  })
})

describe('revealPassword', () => {
  it('replaces the hidden placeholder with the generate field, as "Set New Password" does', () => {
    const modal = buildEditAccountModal({ email: 'info@example.com', disk_quota: 512 }, t)

    revealPassword(modal.fields)

    expect(fieldNamed(modal.fields, 'hiddenPassword')).toMatchObject({ hidden: true })
    expect(fieldNamed(modal.fields, 'password')).toMatchObject({ hidden: false })
  })
})

describe('buildDeleteAccountModal', () => {
  it('is the error-coloured warning modal with the Delete button first', () => {
    const modal = buildDeleteAccountModal(t)

    expect(modal).toMatchObject({
      kind: 'delete',
      title: 'heading.hosting.emailAddress.modal.delete.title',
      icon: '$alertwarning',
      color: 'error',
    })
    expect(modal.buttons.map(button => button.id)).toEqual(['delete', 'cancel'])
    expect(modal.buttons[0]).toMatchObject({ label: 'button.emailAddress.delete', color: 'error' })
  })

  it('asks for the required confirm checkbox, with the bold confirm message', () => {
    const modal = buildDeleteAccountModal(t)

    expect(modal.fields).toHaveLength(1)
    expect(modal.fields[0]).toMatchObject({
      type: 'checkbox',
      name: 'confirm',
      label: 'form.confirmDelete.emailAddress',
      message: '<b>message.confirmAction</b>',
      required: true,
    })
  })
})
