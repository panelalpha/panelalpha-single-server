import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the instance WordPress Config page (without `title.wordpress-config`, which the sidebar test checks)
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

/** The keys of the instance WordPress Config screen, as the `t(...)` calls pass them. */
const PAGE_KEYS = [
  'heading.instance.advanced.wordpressConfig.title',
  'heading.instance.advanced.wordpressConfig.modal.create.title',
  'heading.instance.advanced.wordpressConfig.modal.edit.title',
  'heading.instance.advanced.wordpressConfig.modal.delete.title',
  'heading.instance.advanced.wordpressConfig.modal.delete.info',
  'button.config.create',
  'button.config.edit',
  'button.config.delete',
  'button.create',
  'button.update',
  'button.delete',
  'button.cancel',
  'button.clearFilter',
  'form.label.name',
  'form.label.value',
  'form.label.type',
  'form.placeholder.name',
  'form.placeholder.value',
  'form.placeholder.search',
  'form.validation.required',
  'form.option.constant',
  'form.option.variable',
  'form.confirmDelete.wordpressConfig',
  'tooltip.create_config.name',
  'tooltip.create_config.value',
  'tooltip.create_config.type',
  'message.confirmAction',
  'message.emptyTable.instances.filter.title',
  'notification.instance.wordpressConfig.create.success',
  'notification.instance.wordpressConfig.update.success',
  'notification.instance.wordpressConfig.delete.success',
  'table.header.name',
  'table.header.value',
  'table.header.type',
  'table.footer.record',
]

describe('wordpress config page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(fixtures.app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(fixtures.lite, key)).toBe(true)
  })
})
