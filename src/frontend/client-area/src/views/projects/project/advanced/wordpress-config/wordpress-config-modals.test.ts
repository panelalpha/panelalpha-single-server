import type { FieldRule } from '@/shared/ui/form/field-rule'
import { describe, expect, it } from 'vitest'
import {
  createConfigModal,
  deleteConfigModal,
  editConfigModal,
  refusedConfigModal,
  removeByNameConfigModal,
  withoutConfigFieldMessage,
  type WordpressConfigModalField,
} from './wordpress-config-modals'

// Keys come back as `key` (the mountKit convention), with the options appended so the messages are checkable.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}${JSON.stringify(options)}` : key)

function fieldNamed (name: string): WordpressConfigModalField {
  const field = createConfigModal(t).fields.find(item => 'name' in item && item.name === name)
  if (!field) {
    throw new Error(`no field ${name}`)
  }
  return field
}

/** The first failing rule message for a value, or `undefined` when every rule passes. */
function firstError (field: WordpressConfigModalField, value: unknown): unknown {
  const rules: FieldRule[] = field.rules ?? []
  return rules.map(rule => rule(value)).find(result => result !== true)
}

describe('createConfigModal', () => {
  it('builds the Create modal: title, icon, buttons and the three fields in legacy order', () => {
    const modal = createConfigModal(t)

    expect(modal.kind).toBe('create')
    expect(modal.title).toBe('heading.instance.advanced.wordpressConfig.modal.create.title')
    expect(modal.icon).toBe('$edit')
    expect(modal.color).toBeUndefined()
    expect(modal.message).toBeUndefined()
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['create', 'button.create', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields.map(field => [field.type, 'name' in field ? field.name : undefined])).toEqual([
      ['text', 'name'],
      ['text', 'value'],
      ['select', 'type'],
    ])
  })

  it('takes the labels, the tooltip keys and the placeholders of the Create modal', () => {
    const [name, value, type] = createConfigModal(t).fields

    expect(name).toMatchObject({
      label: 'form.label.name',
      placeholder: 'form.label.name',
      tooltip: 'tooltip.create_config.name',
    })
    expect(value).toMatchObject({
      label: 'form.label.value',
      placeholder: 'form.placeholder.value',
      tooltip: 'tooltip.create_config.value',
    })
    expect(type).toMatchObject({ label: 'form.label.type', tooltip: 'tooltip.create_config.type' })
    expect(type).not.toHaveProperty('placeholder')
  })

  it('offers the constant and variable types with their legacy labels', () => {
    expect(fieldNamed('type')).toMatchObject({
      options: [
        { label: 'form.option.constant', value: 'constant' },
        { label: 'form.option.variable', value: 'variable' },
      ],
    })
  })

  it('requires every field, with the field label in the message', () => {
    expect(firstError(fieldNamed('name'), '')).toBe('form.validation.required{"field":"form.label.name"}')
    expect(firstError(fieldNamed('name'), 'WP_DEBUG')).toBeUndefined()
    expect(firstError(fieldNamed('value'), '')).toBe('form.validation.required{"field":"form.label.value"}')
    expect(firstError(fieldNamed('value'), '1')).toBeUndefined()
    expect(firstError(fieldNamed('type'), null)).toBe('form.validation.required{"field":"form.label.type"}')
    expect(firstError(fieldNamed('type'), 'constant')).toBeUndefined()
  })

  it('refuses a name the Engine wp/config route cannot carry', () => {
    for (const name of ['BAD NAME!', '1BAD', 'BAD-NAME', 'BAD.NAME']) {
      expect(firstError(fieldNamed('name'), name)).toBe('form.validation.phpName{"field":"form.label.name"}')
    }
    for (const name of ['WP_DEBUG', '_WP_DEBUG', 'wpdebug2', 'A']) {
      expect(firstError(fieldNamed('name'), name)).toBeUndefined()
    }
  })

  it('refuses a name longer than the 255 characters the server takes', () => {
    expect(firstError(fieldNamed('name'), 'A'.repeat(255))).toBeUndefined()
    expect(firstError(fieldNamed('name'), 'A'.repeat(256)))
      .toBe('form.validation.maxLength{"field":"form.label.name","length":255}')
  })

  it('refuses a value longer than the 4094 bytes the Engine reads back', () => {
    const tooLong = 'form.validation.maxBytes{"field":"form.label.value","length":4094}'

    expect(firstError(fieldNamed('value'), 'v'.repeat(4094))).toBeUndefined()
    expect(firstError(fieldNamed('value'), 'v'.repeat(4095))).toBe(tooLong)
    // 4094 bytes, not characters: `ą` is 2 bytes and `€` 3, so neither row's character count reaches 4094.
    expect(firstError(fieldNamed('value'), 'ą'.repeat(2047))).toBeUndefined()
    expect(firstError(fieldNamed('value'), 'ą'.repeat(2048))).toBe(tooLong)
    expect(firstError(fieldNamed('value'), '€'.repeat(1364))).toBeUndefined()
    expect(firstError(fieldNamed('value'), '€'.repeat(1365))).toBe(tooLong)
  })
})

describe('editConfigModal', () => {
  it('builds the Edit modal: title, icon, the Update and Cancel buttons, and the same three fields', () => {
    const modal = editConfigModal(t)

    expect(modal.kind).toBe('edit')
    expect(modal.title).toBe('heading.instance.advanced.wordpressConfig.modal.edit.title')
    expect(modal.icon).toBe('$edit')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['update', 'button.update', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields.map(field => [field.type, 'name' in field ? field.name : undefined])).toEqual([
      ['text', 'name'],
      ['text', 'value'],
      ['select', 'type'],
    ])
  })

  it('swaps the placeholders against Create: the name gets its placeholder, the value takes its label', () => {
    const [name, value, type] = editConfigModal(t).fields

    expect(name).toMatchObject({ label: 'form.label.name', placeholder: 'form.placeholder.name', tooltip: 'tooltip.create_config.name' })
    expect(value).toMatchObject({ label: 'form.label.value', placeholder: 'form.label.value', tooltip: 'tooltip.create_config.value' })
    expect(type).toMatchObject({ label: 'form.label.type', tooltip: 'tooltip.create_config.type' })
    expect(type).not.toHaveProperty('placeholder')
  })

  it('offers only the constant and variable types, without secret', () => {
    expect(fieldNamed('type')).toMatchObject({
      options: [
        { label: 'form.option.constant', value: 'constant' },
        { label: 'form.option.variable', value: 'variable' },
      ],
    })
    const options = (fieldNamed('type') as { options: Array<{ value: string }> }).options.map(option => option.value)
    expect(options).not.toContain('secret')
  })

  it('requires every field, with the same messages as Create', () => {
    const fields = editConfigModal(t).fields
    const find = (name: string) => fields.find(item => 'name' in item && item.name === name)!

    expect(firstError(find('name'), '')).toBe('form.validation.required{"field":"form.label.name"}')
    expect(firstError(find('value'), '')).toBe('form.validation.required{"field":"form.label.value"}')
    expect(firstError(find('type'), null)).toBe('form.validation.required{"field":"form.label.type"}')
    expect(firstError(find('name'), 'WP_DEBUG')).toBeUndefined()
  })

  it('caps the value where Create does', () => {
    const value = editConfigModal(t).fields.find(item => 'name' in item && item.name === 'value')!

    expect(firstError(value, 'v'.repeat(4094))).toBeUndefined()
    expect(firstError(value, 'v'.repeat(4095)))
      .toBe('form.validation.maxBytes{"field":"form.label.value","length":4094}')
    expect(firstError(value, 'ą'.repeat(2047))).toBeUndefined()
    expect(firstError(value, 'ą'.repeat(2048)))
      .toBe('form.validation.maxBytes{"field":"form.label.value","length":4094}')
  })
})

describe('deleteConfigModal', () => {
  const item = { name: 'WP_DEBUG', value: '1', type: 'constant' }

  it('builds the delete modal: error icon, delete and cancel buttons, one required confirm checkbox', () => {
    const modal = deleteConfigModal(t, item)

    expect(modal.kind).toBe('delete')
    expect(modal.title).toBe('heading.instance.advanced.wordpressConfig.modal.delete.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('error')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['delete', 'button.delete', 'error'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields).toEqual([{
      type: 'checkbox',
      name: 'confirm',
      label: 'form.confirmDelete.wordpressConfig',
      message: '<b>message.confirmAction</b>',
      required: true,
    }])
  })

  it('puts the name in the message and escapes it, since the message is v-html', () => {
    const modal = deleteConfigModal(t, { ...item, name: '"><img src=x>' })

    expect(modal.message).toBe('heading.instance.advanced.wordpressConfig.modal.delete.info{"name":"&quot;&gt;&lt;img src=x&gt;"}')
  })

  it('uses an empty name in the message when the API sends none', () => {
    const modal = deleteConfigModal(t, { ...item, name: null })

    expect(modal.message).toBe('heading.instance.advanced.wordpressConfig.modal.delete.info{"name":""}')
  })
})

describe('removeByNameConfigModal', () => {
  it('builds the by-name dialog: a name, a type and the required confirm checkbox, as Delete', () => {
    const modal = removeByNameConfigModal(t)

    expect(modal.kind).toBe('delete')
    expect(modal.title).toBe('heading.instance.advanced.wordpressConfig.modal.remove.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('error')
    expect(modal.message).toBeUndefined()
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['remove', 'button.delete', 'error'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields.map(field => [field.type, 'name' in field ? field.name : undefined])).toEqual([
      ['text', 'name'],
      ['select', 'type'],
      ['checkbox', 'confirm'],
    ])
  })

  it('takes the type only from the two the DELETE accepts and the confirm checkbox of Delete', () => {
    const [, type, confirm] = removeByNameConfigModal(t).fields

    expect(type).toMatchObject({
      options: [
        { label: 'form.option.constant', value: 'constant' },
        { label: 'form.option.variable', value: 'variable' },
      ],
    })
    expect(confirm).toMatchObject({ label: 'form.confirmDelete.wordpressConfig', required: true })
  })

  it('requires the name and the type, and refuses a name the DELETE route cannot carry', () => {
    const [name, type] = removeByNameConfigModal(t).fields

    expect(firstError(name, '')).toBe('form.validation.required{"field":"form.label.name"}')
    expect(firstError(type, null)).toBe('form.validation.required{"field":"form.label.type"}')
    expect(firstError(name, 'BAD NAME!')).toBe('form.validation.phpName{"field":"form.label.name"}')
    expect(firstError(name, 'WP_DEBUG')).toBeUndefined()
    expect(firstError(type, 'constant')).toBeUndefined()
  })
})

/** What the API client throws for a refused request: an Axios error with a status and a body. */
function refusal (status: number, data: Record<string, unknown>): unknown {
  return { isAxiosError: true, response: { status, data } }
}

describe('refusedConfigModal', () => {
  it('puts a 422 message under the field it names and shows nothing above the fields', () => {
    const refused = refusedConfigModal(createConfigModal(t), refusal(422, {
      message: 'The value field must not be greater than 8192 characters.',
      errors: { value: ['The value field must not be greater than 8192 characters.'] },
    }))

    expect(refused?.message).toBe('')
    expect(refused?.modal.fields.map(field => field.type === 'text' && field.name === 'value' ? field.errorMessages : undefined))
      .toEqual([undefined, ['The value field must not be greater than 8192 characters.'], undefined])
    expect(refused?.modal.kind).toBe('create')
  })

  it('shows above the fields a 422 that names a field the dialog has no message row for', () => {
    const refused = refusedConfigModal(editConfigModal(t), refusal(422, {
      message: 'The type field is invalid.',
      errors: { type: ['The type field is invalid.'] },
    }))

    expect(refused?.message).toBe('The type field is invalid.')
    expect(refused?.modal.fields.map(field => 'errorMessages' in field ? field.errorMessages : undefined))
      .toEqual([undefined, undefined, undefined])
  })

  it('shows the message of a 422 without a field bag above the fields', () => {
    const refused = refusedConfigModal(createConfigModal(t), refusal(422, { message: 'The Engine refused the change.' }))

    expect(refused?.message).toBe('The Engine refused the change.')
    expect(refused?.modal.fields.map(field => 'errorMessages' in field ? field.errorMessages : undefined))
      .toEqual([undefined, undefined, undefined])
  })

  it('keeps a field message and the ones that name no field apart', () => {
    const refused = refusedConfigModal(createConfigModal(t), refusal(422, {
      errors: { name: ['The name field is invalid.'], type: ['The type field is invalid.'] },
    }))

    expect(refused?.message).toBe('The type field is invalid.')
    expect(refused?.modal.fields[0]).toMatchObject({ errorMessages: ['The name field is invalid.'] })
  })

  it('is null for a failure that is not a 422, so the screen reports it as a whole', () => {
    expect(refusedConfigModal(createConfigModal(t), refusal(500, { message: 'Boom' }))).toBeNull()
    expect(refusedConfigModal(createConfigModal(t), { response: { data: { message: 'Boom' } } })).toBeNull()
  })
})

describe('withoutConfigFieldMessage', () => {
  const refused = refusal(422, { errors: { value: ['The value field is invalid.'] } })

  it('clears the message of the edited field', () => {
    const held = refusedConfigModal(createConfigModal(t), refused)!.modal
    const cleared = withoutConfigFieldMessage(held, 'value')

    expect(cleared.fields[1]).toMatchObject({ errorMessages: [] })
    expect(held.fields[1]).toMatchObject({ errorMessages: ['The value field is invalid.'] })
  })

  it('leaves the modal alone when another field is edited', () => {
    const held = refusedConfigModal(createConfigModal(t), refused)!.modal

    expect(withoutConfigFieldMessage(held, 'name')).toBe(held)
    const untouched = createConfigModal(t)
    expect(withoutConfigFieldMessage(untouched, 'value')).toBe(untouched)
  })
})
