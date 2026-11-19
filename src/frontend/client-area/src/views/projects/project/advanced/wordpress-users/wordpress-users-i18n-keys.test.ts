import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the instance WordPress Users page (without `title.users`, which the sidebar test checks)
// must exist in the app fixture and in the lite fixture, because the screen is in both variants.
// Keys with a count are in the fixtures as `_one` / `_other`; then one of the forms is enough.

const here = dirname(fileURLToPath(import.meta.url))
// The package root (6 levels up).
const fixtureRoot = join(here, '../../../../../../parity/fixtures')

type Flat = Record<string, string>

function flatten (node: unknown, prefix = '', out: Flat = {}): Flat {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out)
    }
  } else if (prefix) {
    out[prefix] = String(node)
  }
  return out
}

const load = (file: string): Flat => flatten(JSON.parse(readFileSync(join(fixtureRoot, file), 'utf8')))

const fixtures = {
  app: load('translation.en.json'),
  lite: load('lite/translation.en.json'),
}

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/** The keys of the instance WordPress Users screen, as the `t(...)` calls pass them. */
const PAGE_KEYS = [
  'heading.instance.advanced.users.title',
  'heading.instance.advanced.users.noData',
  'heading.instance.advanced.users.modal.create.title',
  'heading.instance.advanced.users.modal.update.title',
  'heading.instance.advanced.users.modal.delete.title',
  'heading.instance.advanced.users.modal.resetPassword.title',
  'heading.instance.advanced.users.modal.delete.message',
  'heading.instance.advanced.users.modal.resetPassword.message',
  'button.user.create',
  'button.user.edit',
  'button.user.delete',
  'button.create',
  'button.update',
  'button.delete',
  'button.cancel',
  'button.close',
  'button.copy',
  'button.resetPassword',
  'button.clearFilter',
  'form.label.username',
  'form.label.email',
  'form.label.displayName',
  'form.label.password',
  'form.label.passwordNew',
  'form.label.role',
  'form.label.sendEmail',
  'form.placeholder.username',
  'form.placeholder.email',
  'form.placeholder.displayName',
  'form.placeholder.password',
  'form.placeholder.search',
  'form.validation.required',
  'form.validation.maxLength',
  'form.validation.minLength',
  'form.validation.valid',
  'form.option.administrator',
  'form.option.author',
  'form.option.contributor',
  'form.option.editor',
  'form.option.subscriber',
  'form.confirmDelete.user',
  'tooltip.instance.user.field.username',
  'tooltip.instance.user.field.email',
  'tooltip.instance.user.field.displayName',
  'tooltip.instance.user.field.password',
  'tooltip.instance.user.field.passwordLeaveEmpty',
  'tooltip.instance.user.field.role',
  'notification.instance.user.create.success',
  'notification.instance.user.update.success',
  'notification.instance.user.delete.success',
  'notification.instance.user.resetPassword.success',
  'table.header.id',
  'table.header.login',
  'table.header.displayName',
  'table.header.email',
  'table.header.role',
  'table.header.registered',
  'table.footer.user',
  'message.confirmAction',
  'message.emptyTable.instances.filter.title',
]

// Keys the page uses that the backend copy has but the parity fixtures do not (fixtures are older). The page passes an English
// `defaultValue` for the `setup.wizard.checker.*` keys until a fixture refresh brings them. When a refresh adds a key here, the
// "absent from the fixtures" test fails: move the key to PAGE_KEYS.
const MISSING_ON_DEPLOY = [
  'form.validation.passwordCharacters',
  'setup.wizard.checker.title',
  'setup.wizard.checker.length',
  'setup.wizard.checker.uppercase',
  'setup.wizard.checker.lowercase',
  'setup.wizard.checker.number',
  'setup.wizard.checker.symbol',
]

describe('wordpress users page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it('lists each key missing on deploy once, and never in both lists', () => {
    expect(new Set(MISSING_ON_DEPLOY).size).toBe(MISSING_ON_DEPLOY.length)
    expect(MISSING_ON_DEPLOY.filter(key => PAGE_KEYS.includes(key))).toEqual([])
  })

  it.each(MISSING_ON_DEPLOY)('%s is really absent from the app and lite fixtures', key => {
    expect(hasKey(fixtures.app, key)).toBe(false)
    expect(hasKey(fixtures.lite, key)).toBe(false)
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(fixtures.app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(fixtures.lite, key)).toBe(true)
  })
})
