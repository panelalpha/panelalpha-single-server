import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the instance Themes page must exist in the legacy fixtures (app and app-lite).
// Keys with a count (`count`) are in the fixtures as `_one` / `_other`; then one of the forms is enough.

const here = dirname(fileURLToPath(import.meta.url))
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

/**
 * The keys used by the Themes page (app and app-lite), as the code passes them to `t(...)`.
 * The table headers (`table.header.*`) and the sort options (`form.option.sort.*`) build the key in the kit
 * (`TableCustomSort`: `table.header.${text}`, `SelectDropdown`: `form.option.${text}`), so they are listed explicitly.
 */
const PAGE_KEYS = [
  'heading.instance.advanced.theme.title',
  'heading.instance.advanced.theme.add.title',
  'heading.instance.advanced.theme.modal.install.title',
  'heading.instance.advanced.theme.modal.install.info',
  'heading.instance.advanced.theme.modal.activate.title',
  'heading.instance.advanced.theme.modal.activate.info',
  'heading.instance.advanced.theme.modal.update.title',
  'heading.instance.advanced.theme.modal.update.info.one',
  'heading.instance.advanced.theme.modal.update.info.other.title',
  'heading.instance.advanced.theme.modal.update.info.other.content',
  'heading.instance.advanced.theme.modal.delete.title',
  'heading.instance.advanced.theme.modal.delete.info',
  'heading.instance.plugin.add.tags',
  'heading.instance.plugin.add.tag.blog',
  'heading.instance.plugin.add.tag.ecommerce',
  'heading.instance.plugin.add.tag.entertainment',
  'heading.instance.plugin.add.tag.news',
  'heading.instance.plugin.add.tag.portfolio',
  'message.emptyTable.theme.title',
  'message.emptyTable.theme.description',
  'message.emptyTable.theme.add.title',
  'message.emptyTable.theme.add.description',
  'message.theme.noDescription',
  'message.status.activated',
  'message.status.active',
  'message.status.disabled',
  'message.status.install.inProgress',
  'message.status.update.inProgress',
  'message.confirmAction',
  'button.addNew',
  'button.back',
  'button.install',
  'button.installing',
  'button.updating',
  'button.activate',
  'button.update',
  'button.remove',
  'button.delete',
  'button.close',
  'button.preview',
  'button.readMore',
  'button.theme.install',
  'button.theme.use',
  'tooltip.instance.theme.activate',
  'tooltip.instance.theme.activated.active',
  'tooltip.instance.theme.activated.notActive',
  'tooltip.instance.theme.add.special',
  'tooltip.instance.theme.cannotDelete',
  'tooltip.instance.theme.delete',
  'tooltip.instance.theme.install',
  'tooltip.instance.theme.preview',
  'tooltip.instance.theme.update',
  'tooltip.instance.theme.update.available',
  'tooltip.instance.theme.update.current',
  'tooltip.instance.theme.updated',
  'notification.instance.theme.install.success',
  'notification.instance.theme.activate.success',
  'notification.instance.theme.update.success',
  'notification.instance.theme.delete.success',
  'notification.instance.theme.delete.error',
  'table.footer.theme',
  'table.field.version',
  'table.snackbar.selected.theme',
  'table.snackbar.selected.short',
  'table.header.name',
  'table.header.version',
  'table.header.status',
  'table.header.rating',
  'form.placeholder.search',
  'form.confirmDelete.theme',
  'form.option.sort.rated',
  'form.option.sort.recent',
  'general.featured',
]

/**
 * Known missing keys. The key is absent in both fixtures and the port does not use it:
 * - `message.tatus.update.inProgress`: a typo in app; the port uses `message.status.update.inProgress` (lite).
 */
// `heading.instance.advanced.theme.add.search` (a dead branch of legacy, not ported) is in the lite fixture since 2026-10-25,
// so it is no longer "missing"; the port still does not use it (test below).
const NOT_USED_BY_PORT = ['heading.instance.advanced.theme.add.search']

const EXPECTED_MISSING = [
  'message.tatus.update.inProgress',
]

describe('themes page i18n keys', () => {
  it('lists each key used by the page', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(fixtures.app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(fixtures.lite, key)).toBe(true)
  })

  it.each(EXPECTED_MISSING)('%s is absent from both fixtures (expected missing)', key => {
    expect(hasKey(fixtures.app, key)).toBe(false)
    expect(hasKey(fixtures.lite, key)).toBe(false)
  })

  it('does not list an expected-missing key as used by the page', () => {
    for (const key of [...EXPECTED_MISSING, ...NOT_USED_BY_PORT]) {
      expect(PAGE_KEYS).not.toContain(key)
    }
  })
})
