import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { describe, expect, it } from 'vitest'
import { buildAddUserModal, buildDeleteUserModal, buildEditUserModal, buildUserInfoModal, revealPassword } from './user-modals'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

const databases = [
  { database: 'example_shop', disk_usage: 1, created_at: null, updated_at: null },
  { database: 'example_blog', disk_usage: 2, created_at: null, updated_at: null },
]

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
  return fields.find(field => 'name' in field && field.name === name)
}

describe('buildAddUserModal', () => {
  it('asks for the user name with the account prefix, then a generated password', () => {
    const modal = buildAddUserModal({ prefix: 'example_', databases, requireDatabase: false }, t)

    expect(modal.kind).toBe('add-user')
    expect(modal.title).toBe('heading.hosting.databases.modal.user.add.title')
    expect(modal.fields.map(field => ('name' in field ? field.name : field.type))).toEqual(['name', 'password'])
    expect(fieldNamed(modal.fields, 'name')).toMatchObject({ type: 'text', prefix: 'example_', tooltip: 'tooltip.add_user.username' })
    expect(fieldNamed(modal.fields, 'password')).toMatchObject({ type: 'generatePassword', tooltip: 'tooltip.add_user.password' })
    expect(modal.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
  })

  it('rejects a user name longer than 16 with the maxLength message, not the legacy minLength one', () => {
    // Legacy said `minLength`; the message is `maxLength` instead.
    const name = fieldNamed(buildAddUserModal({ prefix: '', databases, requireDatabase: false }, t).fields, 'name')

    expect(check(name, 'a'.repeat(16))).toBe(true)
    expect(check(name, 'a'.repeat(17))).toBe('form.validation.maxLength:{"field":"form.label.username","length":16}')
  })

  it('requires the user name and rejects spaces in it', () => {
    const name = fieldNamed(buildAddUserModal({ prefix: '', databases, requireDatabase: false }, t).fields, 'name')

    expect(check(name, null)).toBe('form.validation.required:{"field":"form.label.username"}')
    expect(check(name, 'a b')).toBe('form.validation.space:{"field":"form.label.username"}')
    expect(check(name, 'shop')).toBe(true)
  })

  it('requires the password and limits it to 64 characters without spaces', () => {
    const password = fieldNamed(buildAddUserModal({ prefix: '', databases, requireDatabase: false }, t).fields, 'password')

    expect(check(password, null)).toBe('form.validation.required:{"field":"form.label.password"}')
    expect(check(password, 'x'.repeat(65))).toBe('form.validation.maxLength:{"field":"form.label.password","length":64}')
    expect(check(password, 'pass word')).toBe('form.validation.space:{"field":"form.label.password"}')
    expect(check(password, 'Secret1!')).toBe(true)
  })

  it('adds the database select first, with one option per database, only when the backend requires a database', () => {
    const modal = buildAddUserModal({ prefix: '', databases, requireDatabase: true }, t)

    expect(modal.fields[0]).toMatchObject({
      type: 'select',
      name: 'database',
      tooltip: 'tooltip.add_user.database',
      options: [
        { label: 'example_shop', value: 'example_shop' },
        { label: 'example_blog', value: 'example_blog' },
      ],
    })
    expect(modal.fields).toHaveLength(3)
  })
})

describe('buildEditUserModal', () => {
  const user = { user: 'example_admin' }

  it('starts with the hidden password placeholder and the password field hidden, with the name without the prefix as value', () => {
    const modal = buildEditUserModal({ prefix: 'example_', user, renameSupported: false }, t)

    expect(modal.kind).toBe('edit-user')
    expect(modal.fields.map(field => ('name' in field ? field.name : field.type))).toEqual(['hiddenPassword', 'password'])
    expect(fieldNamed(modal.fields, 'hiddenPassword')).toMatchObject({ type: 'hiddenPassword' })
    expect(fieldNamed(modal.fields, 'password')).toMatchObject({ type: 'generatePassword', hidden: true })
    expect(modal.values).toEqual({ name: 'admin' })
  })

  it('shows the user name field only when the backend supports the rename, and rejects the unchanged full name', () => {
    const without = buildEditUserModal({ prefix: 'example_', user, renameSupported: false }, t)
    const withRename = buildEditUserModal({ prefix: 'example_', user, renameSupported: true }, t)

    expect(fieldNamed(without.fields, 'name')).toBeUndefined()
    const name = fieldNamed(withRename.fields, 'name')
    expect(name).toMatchObject({ type: 'text', prefix: 'example_' })
    expect(check(name, 'example_admin')).toBe('form.validation.different:{"field":"form.label.username"}')
    expect(check(name, 'admin')).toBe(true)
  })

  it('accepts an untouched hidden password (null) and checks a revealed one for length and spaces', () => {
    const password = fieldNamed(buildEditUserModal({ prefix: '', user, renameSupported: false }, t).fields, 'password')

    expect(check(password, null)).toBe(true)
    expect(check(password, '')).toBe('form.validation.maxLength:{"field":"form.label.password","length":64}')
    expect(check(password, 'x'.repeat(65))).toBe('form.validation.maxLength:{"field":"form.label.password","length":64}')
    expect(check(password, 'pass word')).toBe('form.validation.space:{"field":"form.label.password"}')
    expect(check(password, 'Secret1!')).toBe(true)
  })

  it('reveal shows the password field and hides the placeholder, as legacy onButtonClick does', () => {
    const modal = buildEditUserModal({ prefix: '', user, renameSupported: false }, t)

    revealPassword(modal.fields)

    expect(fieldNamed(modal.fields, 'hiddenPassword')!.hidden).toBe(true)
    expect(fieldNamed(modal.fields, 'password')!.hidden).toBe(false)
  })
})

describe('buildUserInfoModal', () => {
  it('lists the user, host and port in a <ul>, with the values escaped', () => {
    const modal = buildUserInfoModal({ user: 'ex<b>' }, { host: 'localhost', port: 3306 }, t)

    expect(modal.kind).toBe('info-user')
    expect(modal.title).toBe('heading.hosting.databases.modal.user.show.title')
    expect(modal.icon).toBe('$help')
    expect(modal.message).toBe(
      '<ul>'
      + '<li><strong class="d-inline-block">heading.hosting.databases.modal.user.show.user:</strong> <span class="d-inline-block">ex&lt;b&gt;</span></li>'
      + '<li><strong class="d-inline-block">heading.hosting.databases.modal.user.show.host:</strong> <span class="d-inline-block">localhost</span></li>'
      + '<li><strong class="d-inline-block">heading.hosting.databases.modal.user.show.port:</strong> <span class="d-inline-block">3306</span></li>'
      + '</ul>',
    )
    expect(modal.buttons.map(button => button.id)).toEqual(['cancel'])
  })
})

describe('buildDeleteUserModal', () => {
  it('is an error-coloured dialog whose submit waits for the confirm checkbox', () => {
    const modal = buildDeleteUserModal(t)

    expect(modal).toMatchObject({ kind: 'delete-user', color: 'error', icon: '$alertwarning', confirmRequired: true })
    expect(modal.fields[0]).toMatchObject({ type: 'checkbox', name: 'confirm', label: 'form.confirmDelete.databases.user', required: true })
    expect(check(modal.fields[0], false)).toBe('form.validation.confirm')
    expect(check(modal.fields[0], true)).toBe(true)
    expect(modal.buttons[0]).toMatchObject({ id: 'submit', label: 'button.delete', color: 'error' })
  })
})
