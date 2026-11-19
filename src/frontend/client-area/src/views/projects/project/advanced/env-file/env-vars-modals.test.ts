import type { Translate } from './env-vars-modals'
import { describe, expect, it } from 'vitest'
import { addModal, deleteModal, displayValue, editModal, ENV_VALUE_MASK, importModal, keyRules } from './env-vars-modals'

// The mock `t` returns the key
// and its options, so the assertions check which copy key each rule and title uses.
const t: Translate = (key, options) => (options ? `${key} ${JSON.stringify(options)}` : key)

const SNAPSHOT = 'FOO=1\nBAR=2\nFOO=3\n'

describe('keyRules', () => {
  it('rejects an invalid key with the validation copy', () => {
    const [valid] = keyRules(t, SNAPSHOT, -1)
    expect(valid?.('1BAD')).toBe('heading.instance.advanced.envFile.validation.key')
  })

  it('accepts a new unique key on Add', () => {
    const [, unique] = keyRules(t, SNAPSHOT, -1)
    expect(unique?.('NEW_KEY')).toBe(true)
  })

  it('rejects a key that clashes with another line, with the key in the copy', () => {
    const [, unique] = keyRules(t, SNAPSHOT, -1)
    expect(unique?.('BAR')).toBe('heading.instance.advanced.envFile.duplicateKey {"key":"BAR"}')
  })

  it('accepts the unchanged key of the edited line even when the file holds it twice', () => {
    // Line 0 is FOO, line 2 is the second FOO: editing line 0 keeps FOO without a clash.
    const [, unique] = keyRules(t, SNAPSHOT, 0, 'FOO')
    expect(unique?.('FOO')).toBe(true)
  })

  it('does not count the edited line itself as a clash, but still counts the other lines', () => {
    // Line 1 holds BAR. Renaming it to FOO clashes with lines 0 and 2; renaming it to BAR (its own key) is fine.
    const [, unique] = keyRules(t, SNAPSHOT, 1)
    expect(unique?.('BAR')).toBe(true)
    expect(unique?.('FOO')).toBe('heading.instance.advanced.envFile.duplicateKey {"key":"FOO"}')
  })
})

describe('addModal', () => {
  it('builds key and value, then Save and Cancel, with the plus icon', () => {
    const modal = addModal(t, SNAPSHOT, { supportsRestart: false, fileManagerPath: '/projects/41/advanced/file-manager' })
    expect(modal.kind).toBe('add')
    expect(modal.icon).toBe('$plus')
    expect(modal.title).toBe('heading.instance.advanced.envFile.modal.add.title')
    expect(modal.fields.map(f => f.name)).toEqual(['key', 'value'])
    expect(modal.buttons.map(b => b.id)).toEqual(['save', 'cancel'])
    expect(modal.buttons[0]?.color).toBe('primary')
  })

  it('shows the File Manager link instead of restart when the server cannot restart', () => {
    const modal = addModal(t, SNAPSHOT, { supportsRestart: false, fileManagerPath: '/projects/41/advanced/file-manager' })
    expect(modal.affixLink).toEqual({
      message: 'heading.instance.advanced.envFile.fileManagerHint',
      url: '/projects/41/advanced/file-manager',
    })
    expect(modal.fields.some(f => f.name === 'restart')).toBe(false)
  })

  it('adds the restart checkbox instead of the link when the server supports restart', () => {
    const modal = addModal(t, SNAPSHOT, { supportsRestart: true, fileManagerPath: '/projects/41/advanced/file-manager' })
    expect(modal.affixLink).toBeUndefined()
    expect(modal.fields.at(-1)).toMatchObject({ type: 'checkbox', name: 'restart', label: 'heading.instance.advanced.envFile.confirm.restart' })
    // Checked: a save applies the variables through the Engine's env-vars apply (only a deploy applies them otherwise).
    expect(modal.initialValues).toEqual({ restart: true })
  })

  it('marks the key required and validates it against the snapshot', () => {
    const modal = addModal(t, SNAPSHOT, { supportsRestart: false })
    const key = modal.fields[0]
    expect(key).toMatchObject({ name: 'key', required: true })
    expect(key?.type === 'text' && key.rules?.[1]?.('FOO')).toBe('heading.instance.advanced.envFile.duplicateKey {"key":"FOO"}')
  })
})

describe('editModal', () => {
  const item = { line: 1, key: 'BAR', value: '2' }

  it('seeds key and value from the row, with the pencil icon', () => {
    const modal = editModal(t, item, SNAPSHOT, { supportsRestart: false })
    expect(modal.kind).toBe('edit')
    expect(modal.icon).toBe('$edit')
    expect(modal.title).toBe('heading.instance.advanced.envFile.modal.edit.title')
    expect(modal.initialValues).toEqual({ key: 'BAR', value: '2' })
    expect(modal.affixLink).toBeUndefined()
  })

  it('validates the key without the edited line', () => {
    const modal = editModal(t, item, SNAPSHOT, { supportsRestart: false })
    expect(modal.fields[0]?.type === 'text' && modal.fields[0].rules?.[1]?.('BAR')).toBe(true)
  })

  it('adds restart only when the server supports it', () => {
    expect(editModal(t, item, SNAPSHOT, { supportsRestart: true }).fields.map(f => f.name)).toEqual(['key', 'value', 'restart'])
    expect(editModal(t, item, SNAPSHOT, { supportsRestart: true }).initialValues).toMatchObject({ restart: true })
    expect(editModal(t, item, SNAPSHOT, { supportsRestart: false }).fields.map(f => f.name)).toEqual(['key', 'value'])
  })
})

describe('deleteModal', () => {
  it('uses the error colour, the warning icon and a required confirm checkbox', () => {
    const modal = deleteModal(t, { key: 'BAR' }, { supportsRestart: false })
    expect(modal.kind).toBe('delete')
    expect(modal.color).toBe('error')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.buttons.map(b => [b.id, b.color])).toEqual([['delete', 'error'], ['cancel', 'normal']])
    expect(modal.fields).toEqual([
      { type: 'checkbox', label: 'message.confirmAction', name: 'confirm', required: true },
    ])
  })

  it('escapes the key in the message before it goes to v-html', () => {
    const modal = deleteModal(t, { key: '<b>X</b>' }, { supportsRestart: false })
    expect(modal.message).toBe('heading.instance.advanced.envFile.modal.delete.message {"key":"&lt;b&gt;X&lt;/b&gt;"}')
  })

  it('adds restart after confirm only when the server supports it', () => {
    expect(deleteModal(t, { key: 'A' }, { supportsRestart: true }).fields.map(f => f.name)).toEqual(['confirm', 'restart'])
    expect(deleteModal(t, { key: 'A' }, { supportsRestart: true }).initialValues).toMatchObject({ restart: true })
    expect(deleteModal(t, { key: 'A' }, { supportsRestart: false }).fields.map(f => f.name)).toEqual(['confirm'])
  })
})

describe('importModal', () => {
  it('builds the textarea with the KEY=value placeholder and the overwrite checkbox', () => {
    const modal = importModal(t, SNAPSHOT, { supportsRestart: false })
    expect(modal.kind).toBe('import')
    expect(modal.icon).toBe('$download')
    expect(modal.fields[0]).toMatchObject({ type: 'textarea', name: 'contents', required: true, placeholder: 'KEY=value' })
    expect(modal.fields[1]).toMatchObject({ type: 'checkbox', name: 'overwrite' })
    expect(modal.initialValues).toEqual({ overwrite: false })
    expect(modal.affixLink).toBeUndefined()
  })

  it('rejects a paste that would change nothing', () => {
    const modal = importModal(t, SNAPSHOT, { supportsRestart: false })
    const contents = modal.fields[0]
    expect(contents?.type === 'textarea' && contents.rules?.[0]?.('')).toBe('heading.instance.advanced.envFile.validation.importEmpty')
  })

  it('accepts a paste with at least one usable line', () => {
    const modal = importModal(t, SNAPSHOT, { supportsRestart: false })
    const contents = modal.fields[0]
    expect(contents?.type === 'textarea' && contents.rules?.[0]?.('NEW=1')).toBe(true)
  })

  it('adds restart only when the server supports it, and never the File Manager link', () => {
    const withRestart = importModal(t, SNAPSHOT, { supportsRestart: true })
    expect(withRestart.fields.map(f => f.name)).toEqual(['contents', 'overwrite', 'restart'])
    expect(withRestart.initialValues).toEqual({ overwrite: false, restart: true })
    expect(importModal(t, SNAPSHOT, { supportsRestart: false }).affixLink).toBeUndefined()
  })
})

describe('displayValue', () => {
  it('shows the mask for a hidden value', () => {
    expect(displayValue({ value: 'secret' }, false)).toBe(ENV_VALUE_MASK)
    expect(ENV_VALUE_MASK).toBe('••••••••')
  })

  it('shows the value once the row is revealed', () => {
    expect(displayValue({ value: 'secret' }, true)).toBe('secret')
  })

  it('shows three dashes for an empty value, revealed or not', () => {
    expect(displayValue({ value: '' }, false)).toBe('---')
    expect(displayValue({ value: '' }, true)).toBe('---')
  })
})
