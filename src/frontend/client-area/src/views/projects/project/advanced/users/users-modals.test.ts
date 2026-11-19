import type { InstanceAppUser } from './users.api'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import { describe, expect, it } from 'vitest'
import { createUserModal, deleteUserModal, resetPasswordModal, type UsersModalField } from './users-modals'

// Keys come back as `key` (the mountKit convention), with the options appended so the messages are checkable.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}${JSON.stringify(options)}` : key)

function fieldNamed (name: string): UsersModalField {
  const modal = createUserModal(t, ['administrator', 'editor'])
  const field = modal.fields.find(item => 'name' in item && item.name === name)
  if (!field) {
    throw new Error(`no field ${name}`)
  }
  return field
}

/** The first failing rule message for a value, or `undefined` when every rule passes. */
function firstError (field: UsersModalField, value: unknown): unknown {
  const rules: FieldRule[] = field.rules ?? []
  return rules.map(rule => rule(value)).find(result => result !== true)
}

describe('createUserModal', () => {
  it('builds the Create modal: title, icon, buttons and the four fields in legacy order', () => {
    const modal = createUserModal(t, ['administrator'])

    expect(modal.kind).toBe('create')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.create.title')
    expect(modal.icon).toBe('$edit')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['create', 'button.create', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields.map(field => [field.type, 'name' in field ? field.name : undefined])).toEqual([
      ['text', 'username'],
      ['text', 'email'],
      ['password', 'password'],
      ['select', 'role'],
    ])
  })

  it('gives placeholders only to the text fields and tooltips as i18n keys', () => {
    const modal = createUserModal(t, [])
    const [username, email, password, role] = modal.fields

    expect(username).toMatchObject({ placeholder: 'form.placeholder.username', tooltip: 'tooltip.instance.user.field.username' })
    expect(email).toMatchObject({ placeholder: 'form.placeholder.email', tooltip: 'tooltip.instance.user.field.email' })
    expect(password).toMatchObject({ tooltip: 'tooltip.instance.user.field.password' })
    expect(password).not.toHaveProperty('placeholder')
    expect(role).toMatchObject({ tooltip: 'tooltip.instance.user.field.role' })
  })

  it('takes the role options from the list and marks the select as plain text', () => {
    const role = fieldNamed('role')

    expect(role).toMatchObject({
      type: 'select',
      plainOptions: true,
      options: [{ label: 'administrator', value: 'administrator' }, { label: 'editor', value: 'editor' }],
    })
    expect(firstError(role, 'editor')).toBeUndefined()
    expect(firstError(role, '')).toBe('form.validation.required{"field":"form.label.role"}')
  })

  it('limits the username to 60 characters and requires it', () => {
    const username = fieldNamed('username')

    expect(firstError(username, 'a'.repeat(60))).toBeUndefined()
    expect(firstError(username, 'a'.repeat(61))).toBe('form.validation.maxLength{"field":"form.label.username","length":60}')
    expect(firstError(username, '')).toBe('form.validation.required{"field":"form.label.username"}')
  })

  it('accepts a@b.c and rejects a@b for the email', () => {
    const email = fieldNamed('email')

    expect(firstError(email, 'a@b.c')).toBeUndefined()
    expect(firstError(email, 'a@b')).toBe('form.validation.valid{"field":"form.label.email"}')
    expect(firstError(email, '')).toBe('form.validation.required{"field":"form.label.email"}')
  })

  it('requires a password of at least 8 characters', () => {
    const password = fieldNamed('password')

    expect(firstError(password, '12345678')).toBeUndefined()
    expect(firstError(password, '1234567')).toBe('form.validation.minLength{"field":"form.label.password","length":8}')
    expect(firstError(password, '')).toBe('form.validation.required{"field":"form.label.password"}')
  })
})

describe('resetPasswordModal', () => {
  it('builds the reset modal: warning icon, reset and cancel buttons, one password field', () => {
    const modal = resetPasswordModal(t)

    expect(modal.kind).toBe('reset')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.resetPassword.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('warning')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['reset', 'button.resetPassword', 'warning'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields).toHaveLength(1)
    expect(modal.fields[0]).toMatchObject({ type: 'password', name: 'password', tooltip: 'tooltip.instance.user.field.password' })
  })

  it('requires a password of at least 8 characters, with the passwordNew label', () => {
    const password = resetPasswordModal(t).fields[0]!

    expect(firstError(password, '12345678')).toBeUndefined()
    expect(firstError(password, '1234567')).toBe('form.validation.minLength{"field":"form.label.passwordNew","length":8}')
    expect(firstError(password, '')).toBe('form.validation.required{"field":"form.label.passwordNew"}')
  })
})

describe('deleteUserModal', () => {
  const user: InstanceAppUser = { id: '2', username: 'editor', email: 'editor@example.com', role: 'editor' }

  it('builds the delete modal: error icon, delete and cancel buttons, one required confirm checkbox', () => {
    const modal = deleteUserModal(t, user)

    expect(modal.kind).toBe('delete')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.delete.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('error')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['delete', 'button.delete', 'error'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields).toEqual([{
      type: 'checkbox',
      label: 'form.confirmDelete.user',
      name: 'confirm',
      message: '<b>message.confirmAction</b>',
      required: true,
    }])
  })

  it('puts the email in the message and escapes it, since the message is v-html', () => {
    const modal = deleteUserModal(t, { ...user, email: '"><img src=x>@example.com' })

    expect(modal.message).toBe('heading.instance.advanced.users.modal.delete.message{"email":"&quot;&gt;&lt;img src=x&gt;@example.com"}')
  })

  it('uses an empty email in the message when the API sends none', () => {
    const modal = deleteUserModal(t, { ...user, email: null })

    expect(modal.message).toBe('heading.instance.advanced.users.modal.delete.message{"email":""}')
  })
})
