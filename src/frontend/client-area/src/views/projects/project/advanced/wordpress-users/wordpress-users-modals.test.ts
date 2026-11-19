import type { FieldRule } from '@/shared/ui/form/field-rule'
import { describe, expect, it } from 'vitest'
import {
  createWordpressUserModal,
  deleteWordpressUserModal,
  editWordpressUserModal,
  refusedWordpressUserModal,
  resetWordpressUserPasswordDoneModal,
  resetWordpressUserPasswordModal,
  withoutWordpressUserFieldMessage,
  type WordpressUsersModalField,
} from './wordpress-users-modals'

// Keys come back as `key` (the mountKit convention), with the options appended so the messages are checkable.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}${JSON.stringify(options)}` : key)

function fieldNamed (name: string): WordpressUsersModalField {
  const field = createWordpressUserModal(t).fields.find(item => 'name' in item && item.name === name)
  if (!field) {
    throw new Error(`no field ${name}`)
  }
  return field
}

/** The first failing rule message for a value, or `undefined` when every rule passes. */
function firstError (field: WordpressUsersModalField, value: unknown): unknown {
  const rules: FieldRule[] = field.rules ?? []
  return rules.map(rule => rule(value)).find(result => result !== true)
}

describe('createWordpressUserModal', () => {
  it('builds the Create modal: title, icon, buttons and the six fields in legacy order', () => {
    const modal = createWordpressUserModal(t)

    expect(modal.kind).toBe('create')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.create.title')
    expect(modal.icon).toBe('$edit')
    expect(modal.color).toBeUndefined()
    expect(modal.message).toBeUndefined()
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['create', 'button.create', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields.map(field => [field.type, 'name' in field ? field.name : undefined])).toEqual([
      ['text', 'username'],
      ['text', 'email'],
      ['text', 'display_name'],
      ['password', 'password'],
      ['select', 'role'],
      ['checkbox', 'send_email'],
    ])
  })

  it('gives placeholders to the text fields and tooltips as i18n keys, with no placeholder on the password', () => {
    const modal = createWordpressUserModal(t)
    const [username, email, displayName, password] = modal.fields

    expect(username).toMatchObject({ placeholder: 'form.placeholder.username', tooltip: 'tooltip.instance.user.field.username' })
    expect(email).toMatchObject({ placeholder: 'form.placeholder.email', tooltip: 'tooltip.instance.user.field.email' })
    expect(displayName).toMatchObject({
      label: 'form.label.displayName',
      placeholder: 'form.placeholder.displayName',
      tooltip: 'tooltip.instance.user.field.displayName',
    })
    expect(password).toMatchObject({ label: 'form.label.password', tooltip: 'tooltip.instance.user.field.password' })
    expect(password).not.toHaveProperty('placeholder')
    expect(password).not.toHaveProperty('required')
  })

  it('takes the role options as plain options with the legacy slugs and translated labels', () => {
    const role = fieldNamed('role')

    expect(role).toMatchObject({
      type: 'select',
      plainOptions: true,
      tooltip: 'tooltip.instance.user.field.role',
      options: [
        { label: 'form.option.administrator', value: 'administrator' },
        { label: 'form.option.author', value: 'author' },
        { label: 'form.option.contributor', value: 'contributor' },
        { label: 'form.option.editor', value: 'editor' },
        { label: 'form.option.subscriber', value: 'subscriber' },
      ],
    })
    expect(firstError(role, 'editor')).toBeUndefined()
    expect(firstError(role, '')).toBe('form.validation.required{"field":"form.label.role"}')
  })

  it('has the send-email checkbox with its legacy label and no rules', () => {
    const sendEmail = fieldNamed('send_email')

    expect(sendEmail).toMatchObject({ type: 'checkbox', label: 'form.label.sendEmail' })
    expect(sendEmail).not.toHaveProperty('rules')
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

  it('limits the display name to 60 characters and requires it', () => {
    const displayName = fieldNamed('display_name')

    expect(firstError(displayName, 'a'.repeat(60))).toBeUndefined()
    expect(firstError(displayName, 'a'.repeat(61))).toBe('form.validation.maxLength{"field":"form.label.displayName","length":60}')
    expect(firstError(displayName, '')).toBe('form.validation.required{"field":"form.label.displayName"}')
  })

  it('requires the full panel password policy: length 8 to 255 and all four character classes', () => {
    const password = fieldNamed('password')
    const characters = 'form.validation.passwordCharacters{"field":"form.label.password"}'

    expect(firstError(password, '')).toBe('form.validation.required{"field":"form.label.password"}')
    expect(firstError(password, 'Abcde1!')).toBe('form.validation.minLength{"field":"form.label.password","length":8}')
    expect(firstError(password, `Abcdef1!${'a'.repeat(248)}`)).toBe('form.validation.maxLength{"field":"form.label.password","length":255}')
    expect(firstError(password, 'abcdefg1!')).toBe(characters)
    expect(firstError(password, 'ABCDEFG1!')).toBe(characters)
    expect(firstError(password, 'Abcdefgh!')).toBe(characters)
    expect(firstError(password, 'Abcdefg1')).toBe(characters)
    expect(firstError(password, 'Abcdef1!')).toBeUndefined()
    expect(firstError(password, `Abcdef1!${'a'.repeat(247)}`)).toBeUndefined()
  })

  it('shows the rules as one line under the password, with the English defaults when the keys are missing', () => {
    const withDefaults = (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key)

    expect(createWordpressUserModal(withDefaults).fields[3]).toMatchObject({
      description: 'To ensure that your password is strong, use at least: 8 characters, 1 uppercase character, 1 lowercase character, 1 number, 1 symbol',
    })
  })

  it('gives every hint key a default value, so the line reads in English before the fixtures carry the keys', () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = []
    const recording = (key: string, options?: Record<string, unknown>) => {
      calls.push([key, options])
      return key
    }

    createWordpressUserModal(recording)
    const hintKeys = [
      'setup.wizard.checker.title',
      'setup.wizard.checker.length',
      'setup.wizard.checker.uppercase',
      'setup.wizard.checker.lowercase',
      'setup.wizard.checker.number',
      'setup.wizard.checker.symbol',
    ]
    for (const key of hintKeys) {
      const call = calls.find(([called]) => called === key)
      expect(call).toBeDefined()
      expect(call![1]?.defaultValue).toEqual(expect.any(String))
    }
  })

  it('shows the required message first when the password is empty, before the policy messages', () => {
    const password = fieldNamed('password')

    expect(firstError(password, null)).toBe('form.validation.required{"field":"form.label.password"}')
  })
})

describe('editWordpressUserModal', () => {
  it('builds the Edit modal: title, icon and the update and cancel buttons', () => {
    const modal = editWordpressUserModal(t)

    expect(modal.kind).toBe('edit')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.update.title')
    expect(modal.icon).toBe('$edit')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['update', 'button.update', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
  })

  it('has the five fields in legacy order, without send-email', () => {
    const modal = editWordpressUserModal(t)

    expect(modal.fields.map(field => [field.type, 'name' in field ? field.name : undefined])).toEqual([
      ['text', 'username'],
      ['text', 'email'],
      ['password', 'password'],
      ['text', 'display_name'],
      ['select', 'role'],
    ])
    expect(modal.fields.some(field => 'name' in field && field.name === 'send_email')).toBe(false)
  })

  it('leaves the password without rules and with the passwordLeaveEmpty tooltip', () => {
    const password = editWordpressUserModal(t).fields.find(field => 'name' in field && field.name === 'password')!

    expect(password).toMatchObject({ type: 'password', label: 'form.label.password', tooltip: 'tooltip.instance.user.field.passwordLeaveEmpty' })
    expect(password).not.toHaveProperty('rules')
    expect(password).not.toHaveProperty('required')
    expect(password).not.toHaveProperty('placeholder')
    expect(password).not.toHaveProperty('description')
  })

  it('keeps the username, email, display name and role rules of Create', () => {
    const fields = editWordpressUserModal(t).fields
    const named = (name: string) => fields.find(field => 'name' in field && field.name === name)!

    expect(firstError(named('username'), '')).toBe('form.validation.required{"field":"form.label.username"}')
    expect(firstError(named('email'), 'a@b')).toBe('form.validation.valid{"field":"form.label.email"}')
    expect(firstError(named('display_name'), 'a'.repeat(61))).toBe(
      'form.validation.maxLength{"field":"form.label.displayName","length":60}',
    )
    expect(firstError(named('role'), '')).toBe('form.validation.required{"field":"form.label.role"}')
  })
})

describe('deleteWordpressUserModal', () => {
  const user = { id: 10, username: 'ten', display_name: 'Ten', email: 'ten@example.com', role: 'author', user_registered: null }

  it('builds the Delete modal: error title, alert icon, error colour and the delete and cancel buttons', () => {
    const modal = deleteWordpressUserModal(t, user)

    expect(modal.kind).toBe('delete')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.delete.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('error')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['delete', 'button.delete', 'error'],
      ['cancel', 'button.cancel', 'normal'],
    ])
  })

  it('puts the email into the message escaped, so markup in it stays text', () => {
    const modal = deleteWordpressUserModal(t, { ...user, email: '<b>x</b>@example.com' })

    expect(modal.message).toContain('&lt;b&gt;x&lt;/b&gt;@example.com')
    expect(modal.message).not.toContain('<b>x</b>')
  })

  it('has one required confirm checkbox with the bold confirm action message', () => {
    const modal = deleteWordpressUserModal(t, user)

    expect(modal.fields).toEqual([
      {
        type: 'checkbox',
        label: 'form.confirmDelete.user',
        name: 'confirm',
        message: '<b>message.confirmAction</b>',
        required: true,
      },
    ])
  })
})

describe('resetWordpressUserPasswordModal', () => {
  const user = { id: 10, username: 'ten', display_name: 'Ten', email: 'ten@example.com', role: 'author', user_registered: null }

  it('builds the warning modal: title, alert icon, warning colour, reset and cancel buttons, no fields', () => {
    const modal = resetWordpressUserPasswordModal(t, user)

    expect(modal.kind).toBe('reset')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.resetPassword.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('warning')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['reset', 'button.resetPassword', 'warning'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields).toEqual([])
  })

  it('puts the email into the message', () => {
    const modal = resetWordpressUserPasswordModal(t, user)

    expect(modal.message).toBe('heading.instance.advanced.users.modal.resetPassword.message{"email":"ten@example.com"}')
  })

  it('escapes the email in the message, so markup in it stays text', () => {
    const modal = resetWordpressUserPasswordModal(t, { ...user, email: '<b>x</b>@example.com' })

    expect(modal.message).toContain('&lt;b&gt;x&lt;/b&gt;@example.com')
    expect(modal.message).not.toContain('<b>x</b>')
  })
})

describe('resetWordpressUserPasswordDoneModal', () => {
  it('keeps the title and colours, with an empty message, and only Copy and Close as its buttons', () => {
    const modal = resetWordpressUserPasswordDoneModal(t)

    expect(modal.kind).toBe('reset-done')
    expect(modal.title).toBe('heading.instance.advanced.users.modal.resetPassword.title')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.color).toBe('warning')
    expect(modal.message).toBe('')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['copy', 'button.copy', 'normal'],
      ['close', 'button.close', 'primary'],
    ])
  })

  it('has one readonly text field for the new password with the passwordNew label', () => {
    const modal = resetWordpressUserPasswordDoneModal(t)

    expect(modal.fields).toEqual([{ type: 'text', label: 'form.label.passwordNew', name: 'new_password', readonly: true }])
  })
})

/** What the API client throws for a refused request: an Axios error with a status and a body. */
function refusal (status: number, data: Record<string, unknown>): unknown {
  return { isAxiosError: true, response: { status, data } }
}

/** The held messages of the fields of a modal, by field name (only the types that can show one). */
function heldMessages (modal: ReturnType<typeof createWordpressUserModal>): Array<string[] | undefined> {
  return modal.fields.map(field => (field.type === 'text' || field.type === 'password' ? field.errorMessages : undefined))
}

describe('refusedWordpressUserModal', () => {
  it('puts a refused password under its field and shows nothing above the fields', () => {
    const refused = refusedWordpressUserModal(createWordpressUserModal(t), refusal(422, {
      message: 'The password field must contain at least one symbol.',
      errors: { password: ['The password field must contain at least one symbol.'] },
    }))

    expect(refused?.message).toBe('')
    expect(heldMessages(refused!.modal)).toEqual([
      undefined,
      undefined,
      undefined,
      ['The password field must contain at least one symbol.'],
      undefined,
      undefined,
    ])
    expect(refused?.modal.kind).toBe('create')
  })

  it('holds the messages of the edit dialog the same way', () => {
    const refused = refusedWordpressUserModal(editWordpressUserModal(t), refusal(422, {
      errors: { password: ['The password field must not be greater than 255 characters.'] },
    }))

    expect(refused?.modal.kind).toBe('edit')
    expect(heldMessages(refused!.modal)).toEqual([
      undefined,
      undefined,
      ['The password field must not be greater than 255 characters.'],
      undefined,
      undefined,
    ])
  })

  it('shows above the fields a 422 that names a field the dialog cannot show a message in', () => {
    const refused = refusedWordpressUserModal(createWordpressUserModal(t), refusal(422, {
      message: 'The selected role is invalid.',
      errors: { role: ['The selected role is invalid.'] },
    }))

    expect(refused?.message).toBe('The selected role is invalid.')
    expect(heldMessages(refused!.modal)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
  })

  it('shows the message of a 422 without a field bag above the fields', () => {
    const refused = refusedWordpressUserModal(createWordpressUserModal(t), refusal(422, { message: 'The Engine refused the user.' }))

    expect(refused?.message).toBe('The Engine refused the user.')
    expect(heldMessages(refused!.modal)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
  })

  it('keeps a field message and the ones that name no showable field apart', () => {
    const refused = refusedWordpressUserModal(createWordpressUserModal(t), refusal(422, {
      errors: { username: ['The username field is invalid.'], role: ['The selected role is invalid.'] },
    }))

    expect(refused?.message).toBe('The selected role is invalid.')
    expect(refused?.modal.fields[0]).toMatchObject({ errorMessages: ['The username field is invalid.'] })
  })

  it('is null for a failure that is not a 422, so the screen reports it as a whole', () => {
    expect(refusedWordpressUserModal(createWordpressUserModal(t), refusal(500, { message: 'Boom' }))).toBeNull()
    expect(refusedWordpressUserModal(createWordpressUserModal(t), { response: { data: { message: 'Boom' } } })).toBeNull()
  })
})

describe('withoutWordpressUserFieldMessage', () => {
  const refused = refusal(422, { errors: { password: ['The password field is invalid.'] } })

  it('clears the message of the edited field and leaves the other modal as it was', () => {
    const held = refusedWordpressUserModal(createWordpressUserModal(t), refused)!.modal
    const cleared = withoutWordpressUserFieldMessage(held, 'password')

    expect(heldMessages(cleared)).toEqual([undefined, undefined, undefined, [], undefined, undefined])
    expect(heldMessages(held)).toEqual([undefined, undefined, undefined, ['The password field is invalid.'], undefined, undefined])
  })

  it('leaves the modal alone when another field is edited or no field holds a message', () => {
    const held = refusedWordpressUserModal(createWordpressUserModal(t), refused)!.modal
    const untouched = createWordpressUserModal(t)

    expect(withoutWordpressUserFieldMessage(held, 'username')).toBe(held)
    expect(withoutWordpressUserFieldMessage(untouched, 'password')).toBe(untouched)
  })
})
