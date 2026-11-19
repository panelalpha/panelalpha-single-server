import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the Email Forwarders screen must exist in both fixtures (app and lite).
// Keys with a count (`count`) are `_one` / `_other` in the fixtures; one of the two forms is enough then.

const here = dirname(fileURLToPath(import.meta.url))
// The package root is 4 levels up.
const fixtureRoot = join(here, '../../../../parity/fixtures')

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

const app = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'translation.en.json'), 'utf8')))
const lite = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'lite/translation.en.json'), 'utf8')))

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/** The screen keys, as the `t(...)` calls in EmailForwardersView.vue and email-forwarder-modals.ts pass them, plus the table headers (`email-forwarders.ts`). */
const PAGE_KEYS = [
  'heading.hosting.emailForwarders.title',
  'heading.hosting.emailForwarders.modal.add.title',
  'heading.hosting.emailForwarders.modal.delete.title',
  'message.emptyTable.emailForwarders.title',
  'message.emptyTable.emailForwarders.description',
  'message.confirmAction',
  'notification.hosting.emailForwarders.add.success',
  'notification.hosting.emailForwarders.delete.success',
  'button.emailForwarder.add',
  'button.emailForwarder.delete',
  'button.cancel',
  'tooltip.add_forwarder.email',
  'tooltip.add_forwarder.destination',
  'form.label.email',
  'form.label.destination',
  'form.validation.required',
  'form.validation.email',
  'form.confirmDelete.emailForwarder',
  'table.header.email',
  'table.header.forwardTo',
  'table.header.created',
  'table.header.actions',
]

// The literal keys of the view and the module: the PAGE_KEYS list must contain all of them, or a typo would pass the test.
// The kit keys (`EmailDomainSelector`, `RecordConfiguration`) are checked by their own kit test.
const SCANNED_FILES = ['EmailForwardersView.vue', 'email-forwarder-modals.ts']
const KEY_LITERAL = /'((?:heading|button|notification|message|table|form|tooltip)\.[\w.-]+)'/g
const VIEW_KEYS = SCANNED_FILES.flatMap(file => {
  const source = readFileSync(join(here, file), 'utf8')
  return [...source.matchAll(KEY_LITERAL)].map(match => match[1])
})

describe('email forwarders page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it('covers every literal key used in EmailForwardersView.vue and email-forwarder-modals.ts', () => {
    const missing = VIEW_KEYS.filter(key => !PAGE_KEYS.includes(key))
    expect([...new Set(missing)]).toEqual([])
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })
})
