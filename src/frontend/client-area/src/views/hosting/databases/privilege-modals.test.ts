import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { describe, expect, it } from 'vitest'
import { buildDatabasePrivilegesModal, buildUserPrivilegesModal } from './privilege-modals'

// The test translator returns the key and its parameters, so a message can be matched by its key and field.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)

function field (fields: ModalField[], name: string) {
  const found = fields.find(item => 'name' in item && item.name === name)
  if (!found) {
    throw new Error(`no field ${name}`)
  }
  return found
}

function isHidden (fields: ModalField[], name: string) {
  return Boolean(field(fields, name).hidden)
}

describe('buildUserPrivilegesModal', () => {
  it('titles the modal with the user, escaped, in a span that breaks only a name longer than the line (`text-break-long`)', () => {
    const modal = buildUserPrivilegesModal({ user: 'ex<b>', databases: [], accountDatabases: [] }, t)
    expect(modal.kind).toBe('privileges-user')
    expect(modal.title).toBe('Database Privileges: <span class="text-break-long">ex&lt;b&gt;</span>')
    expect(modal.icon).toBe('$database')
  })

  it('starts the database select at the first database of the user, with its preset and boxes', () => {
    const modal = buildUserPrivilegesModal({
      user: 'example_admin',
      databases: [
        { name: 'example_shop', privileges: ['SELECT', 'INSERT'], privileges_preset: 'custom', showTooltip: false },
        { name: 'example_blog', privileges: ['ALL PRIVILEGES'], privileges_preset: 'all', showTooltip: false },
      ],
      accountDatabases: ['example_shop', 'example_blog', 'example_forum'],
    }, t)

    expect(modal.values.database).toBe('example_shop')
    expect(modal.values.privileges_preset).toBe('custom')
    expect(modal.values.SELECT).toBe(true)
    expect(modal.values.INSERT).toBe(true)
    expect(modal.values.DELETE).toBe(false)
    // Legacy leaves ALL PRIVILEGES alone here, so the value is unset (falsy), not false
    expect(modal.values['ALL PRIVILEGES']).toBeFalsy()
  })

  it('offers the account databases in the select, and requires one', () => {
    // The options come from the account's databases; the required rule is the guard for an account without a database
    const modal = buildUserPrivilegesModal({ user: 'example_admin', databases: [], accountDatabases: ['example_shop', 'example_blog'] }, t)
    const select = field(modal.fields, 'database')
    expect(select.type).toBe('select')
    expect(select).toMatchObject({ required: true, options: [{ label: 'example_shop', value: 'example_shop' }, { label: 'example_blog', value: 'example_blog' }] })
  })

  it('falls back to the first account database for a user without databases (legacy databases[0])', () => {
    const modal = buildUserPrivilegesModal({ user: 'example_reader', databases: [], accountDatabases: ['example_shop'] }, t)
    expect(modal.values.database).toBe('example_shop')
    expect(modal.values.privileges_preset).toBe('none')
  })

  it('does not crash for an account without databases and a user without databases (R§2.3)', () => {
    // Legacy read `databases[0].value` and threw here. The modal opens with an empty select.
    const modal = buildUserPrivilegesModal({ user: 'example_reader', databases: [], accountDatabases: [] }, t)
    expect(modal.values.database).toBe('')
    expect(modal.values.privileges_preset).toBe('none')
    expect(field(modal.fields, 'database')).toMatchObject({ required: true, options: [] })
  })

  it('shows the boxes only for the custom preset', () => {
    // The checkboxes are hidden for every preset but `custom`.
    const custom = buildUserPrivilegesModal({
      user: 'u',
      databases: [{ name: 'example_shop', privileges: ['SELECT', 'INSERT'], privileges_preset: 'custom', showTooltip: false }],
      accountDatabases: ['example_shop'],
    }, t)
    const read = buildUserPrivilegesModal({
      user: 'u',
      databases: [{ name: 'example_shop', privileges: ['SELECT'], privileges_preset: 'read', showTooltip: false }],
      accountDatabases: ['example_shop'],
    }, t)

    expect(isHidden(custom.fields, 'SELECT')).toBe(false)
    expect(isHidden(custom.fields, 'ALL PRIVILEGES')).toBe(false)
    expect(isHidden(read.fields, 'SELECT')).toBe(true)
    expect(isHidden(read.fields, 'ALL PRIVILEGES')).toBe(true)
  })

  it('has the preset select with the four presets and custom, then Update and Cancel', () => {
    const modal = buildUserPrivilegesModal({ user: 'u', databases: [], accountDatabases: [] }, t)
    expect(field(modal.fields, 'privileges_preset')).toMatchObject({
      options: [
        { label: 'form.option.none', value: 'none' },
        { label: 'form.option.read', value: 'read' },
        { label: 'form.option.readWrite', value: 'read_write' },
        { label: 'form.option.full', value: 'all' },
        { label: 'form.option.custom', value: 'custom' },
      ],
    })
    expect(modal.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
  })
})

describe('buildDatabasePrivilegesModal', () => {
  it('titles the modal with the database name through the editPrivilege key', () => {
    const modal = buildDatabasePrivilegesModal({ database: 'example_shop', privileges: [] }, t)
    expect(modal.kind).toBe('privileges-database')
    expect(modal.title).toBe('heading.hosting.databases.modal.user.editPrivilege.title {"database":"example_shop"}')
    expect(modal.icon).toBe('$edit')
  })

  it('checks the boxes the user has, and leaves ALL PRIVILEGES off', () => {
    const modal = buildDatabasePrivilegesModal({ database: 'example_shop', privileges: ['SELECT', 'UPDATE'] }, t)
    expect(modal.values.SELECT).toBe(true)
    expect(modal.values.UPDATE).toBe(true)
    expect(modal.values.INSERT).toBe(false)
    expect(modal.values['ALL PRIVILEGES']).toBe(false)
  })

  it('checks every box when the user has ALL PRIVILEGES (legacy checkAll on mount)', () => {
    const modal = buildDatabasePrivilegesModal({ database: 'example_shop', privileges: ['ALL PRIVILEGES'] }, t)
    expect(Object.values(modal.values).every(Boolean)).toBe(true)
    expect(modal.values['ALL PRIVILEGES']).toBe(true)
  })

  it('shows the boxes at once, with no preset select', () => {
    const modal = buildDatabasePrivilegesModal({ database: 'example_shop', privileges: [] }, t)
    expect(modal.fields.some(item => 'name' in item && item.name === 'privileges_preset')).toBe(false)
    expect(isHidden(modal.fields, 'SELECT')).toBe(false)
  })
})
