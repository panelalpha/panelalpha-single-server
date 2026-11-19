import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the instance Users page (without `title.users`, which the sidebar test checks) must exist
// in the lite fixture. The page exists only in app-lite, so missing keys in the app fixture are not an error and are not checked.
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
  lite: load('lite/translation.en.json'),
}

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/** The keys of the Users screen (lite), as the `t(...)` calls pass them, plus the success message of the password reset. */
const PAGE_KEYS = [
  'heading.instance.advanced.users.title',
  'heading.instance.advanced.users.noData',
  'heading.instance.advanced.users.modal.create.title',
  'heading.instance.advanced.users.modal.resetPassword.title',
  'heading.instance.advanced.users.modal.delete.title',
  'heading.instance.advanced.users.modal.delete.message',
  'button.user.create',
  'button.create',
  'button.cancel',
  'button.resetPassword',
  'button.delete',
  'button.user.delete',
  'button.clearFilter',
  'form.label.username',
  'form.label.email',
  'form.label.password',
  'form.label.passwordNew',
  'form.label.role',
  'form.placeholder.username',
  'form.placeholder.email',
  'form.placeholder.password',
  'form.placeholder.search',
  'form.validation.required',
  'form.validation.maxLength',
  'form.validation.valid',
  'form.validation.minLength',
  'form.confirmDelete.user',
  'message.confirmAction',
  'tooltip.instance.user.field.username',
  'tooltip.instance.user.field.email',
  'tooltip.instance.user.field.password',
  'tooltip.instance.user.field.role',
  'notification.instance.user.create.success',
  'notification.instance.user.delete.success',
  'notification.instance.user.resetPassword.success',
  'table.header.id',
  'table.header.login',
  'table.header.email',
  'table.header.role',
  'table.footer.user',
]

describe('users page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(fixtures.lite, key)).toBe(true)
  })
})
