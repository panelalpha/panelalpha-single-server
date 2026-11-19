import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { describe, expect, it } from 'vitest'
import { buttonState } from '@/shared/ui/modal/basic-modal-buttons'
import {
  buildAddDatabaseModal,
  buildDeleteDatabaseModal,
  buildRenameDatabaseModal,
  DATABASE_NAME_MAX_LENGTH,
  databaseNameWithoutPrefix,
} from './database-modals'

// The test translator returns the key and its parameters, so a message can be matched by its key and field.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)

function textField (fields: ModalField[]) {
  const field = fields[0]
  if (!field || field.type !== 'text') {
    throw new Error('expected a text field')
  }
  return field
}

function ruleResults (field: ModalField, value: unknown) {
  return (field.rules ?? []).map(rule => rule(value))
}

describe('buildAddDatabaseModal', () => {
  it('asks for one name with the account prefix, starting empty', () => {
    const modal = buildAddDatabaseModal('example_', t)

    expect(modal.kind).toBe('add')
    expect(modal.title).toBe('heading.hosting.databases.modal.database.add.title')
    expect(modal.icon).toBe('$plus')
    expect(modal.values).toEqual({})
    expect(modal.confirmRequired).toBe(false)
    const field = textField(modal.fields)
    expect(field.name).toBe('name')
    expect(field.prefix).toBe('example_')
    expect(field.tooltip).toBe('tooltip.add_database.name')
  })

  it('requires a non-empty name with no spaces and at most 64 characters, as legacy', () => {
    const field = textField(buildAddDatabaseModal('example_', t).fields)

    expect(ruleResults(field, '')[0]).toBe('form.validation.required {"field":"form.label.database"}')
    expect(ruleResults(field, 'shop')).toEqual([true, true, true])
    expect(ruleResults(field, 'a'.repeat(DATABASE_NAME_MAX_LENGTH))[1]).toBe(true)
    expect(ruleResults(field, 'a'.repeat(DATABASE_NAME_MAX_LENGTH + 1))[1]).toBe(
      `form.validation.maxLength ${JSON.stringify({ field: 'form.label.database', length: 64 })}`,
    )
    expect(ruleResults(field, 'my shop')[2]).toBe('form.validation.space {"field":"form.label.database"}')
  })

  it('has a primary submit and the cancel button, and the submit is not gated by a checkbox', () => {
    const modal = buildAddDatabaseModal('example_', t)

    expect(modal.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.buttons[0]).toMatchObject({ label: 'button.database.add', color: 'primary' })
    expect(buttonState(modal.buttons[0]!, { confirmRequired: modal.confirmRequired, confirmed: false }).disabled).toBe(false)
  })
})

describe('buildRenameDatabaseModal', () => {
  it('prefills the name without the account prefix', () => {
    const modal = buildRenameDatabaseModal('example_', { database: 'example_shop' }, t)

    expect(modal.kind).toBe('rename')
    expect(modal.values).toEqual({ name: 'shop' })
    expect(textField(modal.fields).prefix).toBe('example_')
    expect(textField(modal.fields).tooltip).toBe('tooltip.rename_database.name')
  })

  it('adds the different rule on top of the name rules', () => {
    const field = textField(buildRenameDatabaseModal('example_', { database: 'example_shop' }, t).fields)

    expect(field.rules).toHaveLength(4)
    expect(ruleResults(field, 'blog')).toEqual([true, true, true, true])
    // Legacy compares the typed value with the full database name, so the typed name never equals it.
    expect(ruleResults(field, 'example_shop')[3]).toBe('form.validation.different {"field":"form.label.newName"}')
  })

  it('labels the field as the new name and requires it, as legacy', () => {
    const field = textField(buildRenameDatabaseModal('example_', { database: 'example_shop' }, t).fields)

    expect(field.label).toBe('form.label.newName')
    expect(ruleResults(field, '')[0]).toBe('form.validation.required {"field":"form.label.newName"}')
  })

  it('prefills the full name when the account has no prefix', () => {
    expect(buildRenameDatabaseModal('', { database: 'shop' }, t).values).toEqual({ name: 'shop' })
  })
})

describe('buildDeleteDatabaseModal', () => {
  it('asks for a confirm checkbox and keeps the error-coloured submit disabled until it is ticked', () => {
    const modal = buildDeleteDatabaseModal(t)
    const [submit] = modal.buttons

    expect(modal.kind).toBe('delete')
    expect(modal.color).toBe('error')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.confirmRequired).toBe(true)
    expect(modal.fields).toHaveLength(1)
    const confirm = modal.fields[0]!
    expect(confirm).toMatchObject({ type: 'checkbox', name: 'confirm', required: true, message: '<b>message.confirmAction</b>' })
    expect(confirm.rules?.[0]?.(false)).toBe('form.validation.confirm')
    expect(confirm.rules?.[0]?.(true)).toBe(true)
    expect(buttonState(submit!, { confirmRequired: true, confirmed: false }).disabled).toBe(true)
    expect(buttonState(submit!, { confirmRequired: true, confirmed: true }).disabled).toBe(false)
  })
})

describe('databaseNameWithoutPrefix', () => {
  it('strips the account prefix only where the name starts with it', () => {
    expect(databaseNameWithoutPrefix('example_shop', 'example_')).toBe('shop')
    expect(databaseNameWithoutPrefix('other_shop', 'example_')).toBe('other_shop')
    expect(databaseNameWithoutPrefix('shop', '')).toBe('shop')
  })
})
