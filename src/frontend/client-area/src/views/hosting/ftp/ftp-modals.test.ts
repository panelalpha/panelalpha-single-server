import { describe, expect, it } from 'vitest'
import {
  addFtpModal,
  buildCreatePayload,
  deleteFtpModal,
  editFtpModal,
  ftpPasswordRefusal,
  infoFtpModal,
  isUsernameValid,
  modalFieldName,
  toggleQuotaHidden,
  withoutFtpPasswordMessage,
} from './ftp-modals'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

const domains = [{ domain: 'example.com' }, { domain: 'shop.example.com' }]

describe('addFtpModal', () => {
  it('opens with the legacy fields when usage is supported, the quota hidden and the seed domain', () => {
    const modal = addFtpModal(t, { domains, homedir: '/home/example/', usageSupported: true })

    expect(modal.title).toBe('heading.hosting.ftp.modal.add.title')
    expect(modal.icon).toBe('$plus')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['add', 'button.ftp.add', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields.map(field => [field.type, modalFieldName(field)])).toEqual([
      ['text-select', 'user'],
      ['generatePassword', 'password'],
      ['text', 'directory'],
      ['checkbox', 'unlimited_quota'],
      ['text', 'quota'],
    ])
    expect(modal.fields[0]).toMatchObject({
      suffix: '@',
      selectName: 'domain',
      options: [{ label: 'example.com', value: 'example.com' }, { label: 'shop.example.com', value: 'shop.example.com' }],
    })
    expect(modal.fields[2]).toMatchObject({ prefix: '/home/example/' })
    expect(modal.fields[4]).toMatchObject({ hidden: true })
    expect(modal.initialValues).toEqual({ domain: 'example.com', unlimited_quota: true })
  })

  it('drops the unlimited and quota fields when usage is not supported, keeping the seed', () => {
    const modal = addFtpModal(t, { domains, usageSupported: false })

    expect(modal.fields.map(field => modalFieldName(field))).toEqual(['user', 'password', 'directory'])
    expect(modal.initialValues).toEqual({ domain: 'example.com', unlimited_quota: true })
  })
})

describe('isUsernameValid', () => {
  it('accepts a user and a domain', () => {
    expect(isUsernameValid(t, 'shop', 'example.com')).toBe(true)
  })

  it('rejects an empty user (the value is only the domain)', () => {
    expect(isUsernameValid(t, '', 'example.com')).toBe(false)
  })

  it('rejects a missing domain', () => {
    expect(isUsernameValid(t, 'shop', '')).toBe(false)
  })

  it('rejects an @ in the user part', () => {
    expect(isUsernameValid(t, 'a@b', 'example.com')).toBe(false)
  })
})

describe('buildCreatePayload', () => {
  it('sends quota 0 for an unlimited account and keeps the other values', () => {
    const values = { domain: 'example.com', user: 'shop', password: 'secret123', directory: '/shop', unlimited_quota: true, quota: '' }

    expect(buildCreatePayload(values)).toEqual({ ...values, quota: 0 })
    expect(values.quota).toBe('')
  })

  it('keeps the quota typed for a limited account', () => {
    const values = { domain: 'example.com', user: 'shop', password: 'secret123', directory: '/shop', unlimited_quota: false, quota: '512' }

    expect(buildCreatePayload(values)).toEqual(values)
  })
})

describe('infoFtpModal', () => {
  const item = { user: 'shop@example.com' }

  it('lists username, host and port and escapes every API value', () => {
    const modal = infoFtpModal(t, { user: '<i>shop</i>@example.com' }, { host: 'ftp.example.com', port: 21 })

    expect(modal.kind).toBe('info')
    expect(modal.icon).toBe('$help')
    expect(modal.title).toBe(String.raw`heading.hosting.ftp.modal.show.title:{"user":"<span class=\"text-break-long\">&lt;i&gt;shop&lt;/i&gt;@example.com</span>"}`)
    expect(modal.message).toBe(
      '<ul>'
      + '<li><strong class="d-inline-block">heading.hosting.ftp.modal.show.info.username:</strong> <span class="d-inline-block">&lt;i&gt;shop&lt;/i&gt;@example.com</span></li>'
      + '<li><strong class="d-inline-block">heading.hosting.ftp.modal.show.info.host:</strong> <span class="d-inline-block">ftp.example.com</span></li>'
      + '<li><strong class="d-inline-block">heading.hosting.ftp.modal.show.info.port:</strong> <span class="d-inline-block">21</span></li>'
      + '</ul>',
    )
  })

  it('has only the Cancel button and no fields', () => {
    const modal = infoFtpModal(t, item, { host: 'ftp.example.com', port: 21 })

    expect(modal.buttons.map(button => button.id)).toEqual(['cancel'])
    expect(modal.fields).toEqual([])
  })

  it('escapes a host that carries markup', () => {
    const modal = infoFtpModal(t, item, { host: '"><script>', port: 21 })

    expect(modal.message).toContain('<span class="d-inline-block">&quot;&gt;&lt;script&gt;</span>')
  })
})

describe('deleteFtpModal', () => {
  it('is an error modal with a required confirm checkbox and the Delete and Cancel buttons', () => {
    const modal = deleteFtpModal(t)

    expect(modal.kind).toBe('delete')
    expect(modal.color).toBe('error')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.title).toBe('heading.hosting.ftp.modal.delete.title')
    expect(modal.fields).toEqual([{
      type: 'checkbox',
      label: 'form.confirmDelete.ftp',
      name: 'confirm',
      message: '<b>message.confirmAction</b>',
      required: true,
    }])
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['delete', 'button.delete', 'error'],
      ['cancel', 'button.cancel', 'normal'],
    ])
  })
})

describe('toggleQuotaHidden', () => {
  it('hides the quota field while the account is unlimited and shows it otherwise', () => {
    const modal = addFtpModal(t, { domains, usageSupported: true })

    toggleQuotaHidden(modal.fields, true)
    expect(modal.fields.find(field => modalFieldName(field) === 'quota')?.hidden).toBe(true)

    toggleQuotaHidden(modal.fields, false)
    expect(modal.fields.find(field => modalFieldName(field) === 'quota')?.hidden).toBe(false)
  })
})

describe('editFtpModal', () => {
  it('changes the password of the named account: one password field, Update and Cancel', () => {
    const modal = editFtpModal(t, { user: 'shop@example.com' })

    expect(modal.kind).toBe('edit')
    expect(modal.icon).toBe('$edit')
    expect(modal.title).toBe('heading.hosting.ftp.modal.update.title')
    expect(modal.message).toBe('<b>heading.hosting.ftp.modal.update.info:</b> shop@example.com')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['update', 'button.update', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields).toHaveLength(1)
    expect(modal.fields[0]).toMatchObject({
      type: 'generatePassword',
      name: 'password',
      label: 'form.label.password',
      tooltip: 'tooltip.edit_ftp_account.password',
    })
    expect(modal.initialValues).toEqual({ password: null })
  })

  it('escapes an account name that carries markup', () => {
    const modal = editFtpModal(t, { user: '"><script>@example.com' })

    expect(modal.message).toContain('&quot;&gt;&lt;script&gt;@example.com')
  })

  it('applies the password rules of the update request: required, at least 8 and at most 255 characters', () => {
    const rules = editFtpModal(t, { user: 'shop@example.com' }).fields[0]!.rules!

    expect(rules.map(rule => rule(''))).toEqual(['form.validation.required:{"field":"form.label.password"}', 'form.validation.minLength:{"field":"form.label.password","length":8}', true])
    expect(rules.map(rule => rule('short'))).toEqual([true, 'form.validation.minLength:{"field":"form.label.password","length":8}', true])
    expect(rules.map(rule => rule('x'.repeat(256)))).toEqual([true, true, 'form.validation.maxLength:{"field":"form.label.password","length":255}'])
    expect(rules.map(rule => rule('long-enough'))).toEqual([true, true, true])
  })
})

describe('ftpPasswordRefusal', () => {
  it('returns the messages of a 422 that names the password field', () => {
    const error = { response: { status: 422, data: { errors: { password: ['The password field is too long.'] } } } }

    expect(ftpPasswordRefusal(error)).toEqual(['The password field is too long.'])
  })

  it('returns null for a failure that names no password', () => {
    expect(ftpPasswordRefusal({ response: { status: 500, data: { message: 'Server error' } } })).toBeNull()
    expect(ftpPasswordRefusal({ response: { status: 422, data: { errors: { quota: ['The quota field is invalid.'] } } } })).toBeNull()
    expect(ftpPasswordRefusal({ response: { status: 422, data: {} } })).toBeNull()
    expect(ftpPasswordRefusal(new Error('network'))).toBeNull()
  })
})

describe('withoutFtpPasswordMessage', () => {
  it('clears the message a refusal held under the password and leaves a modal without one as it is', () => {
    const modal = editFtpModal(t, { user: 'shop@example.com' })
    const held = { ...modal, fields: [{ ...modal.fields[0]!, errorMessages: ['refused'] }] }

    expect(withoutFtpPasswordMessage(held).fields[0]).toMatchObject({ errorMessages: [] })
    expect(withoutFtpPasswordMessage(modal)).toBe(modal)
  })
})
