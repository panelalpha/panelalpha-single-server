import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Keys of the instance Plugins page must exist in the legacy fixtures (app and app-lite).
// Keys with a count (`count`) are `_one` / `_other` in the fixtures; one of the forms is enough then.

const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, '../../../../../parity/fixtures')

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

/** Keys used by the Plugins page (app and app-lite), as the code passes them to `t(...)`. */
const PAGE_KEYS = [
  'heading.instance.plugin.title',
  'heading.instance.plugin.add.title',
  'heading.instance.plugin.add.empty.title',
  'heading.instance.plugin.add.empty.text',
  'heading.instance.plugin.add.tags',
  'heading.instance.plugin.add.tag.blog',
  'heading.instance.plugin.add.tag.ecommerce',
  'heading.instance.plugin.add.tag.entertainment',
  'heading.instance.plugin.add.tag.news',
  'heading.instance.plugin.add.tag.portfolio',
  'heading.instance.plugin.install.title',
  'heading.instance.plugin.activate.title',
  'heading.instance.plugin.activate.info',
  'heading.instance.plugin.deactivate.title',
  'heading.instance.plugin.deactivate.message',
  'heading.instance.plugin.update.title',
  'heading.instance.plugin.update.message_one',
  'heading.instance.plugin.update.message.title',
  'heading.instance.plugin.update.message.content',
  'heading.instance.plugin.delete.title',
  'heading.instance.plugin.delete.message',
  'message.emptyTable.plugin.title',
  'message.emptyTable.plugin.description',
  'message.confirmAction',
  'message.status.activated',
  'message.status.disabled',
  'message.status.active',
  'message.status.plugin.special',
  'button.addNew',
  'button.back',
  'button.install',
  'button.installing',
  'button.updating',
  'button.activate',
  'button.deactivate',
  'button.disable',
  'button.update',
  'button.remove',
  'button.delete',
  'button.cancel',
  'button.close',
  'button.readMore',
  'button.clearFilter',
  'button.plugin.activate',
  'button.plugin.deactivate',
  'button.plugin.update',
  'button.plugin.delete',
  'button.plugin.install',
  'tooltip.instance.plugin.update.available',
  'tooltip.instance.plugin.update.current',
  'tooltip.instance.plugin.activationIsNotAllowed',
  'tooltip.instance.plugin.add.special',
  'table.footer.plugin',
  'table.snackbar.selected.plugin',
  'table.snackbar.selected.short',
  'table.snackbar.selectAll',
  'table.snackbar.deselect',
  'table.header.name',
  'table.header.version',
  'table.header.status',
  'table.header.rating',
  'table.header.installations',
  'table.header.requires',
  'table.header.lastUpdated',
  'form.placeholder.search',
  'form.confirmDelete.plugin',
  'form.option.sort.noSort',
  'form.option.sort.popular',
  'form.option.sort.downloadable',
  'form.option.sort.rated',
  'form.option.sort.recent',
  'notification.instance.plugin.install.success',
  'notification.instance.plugin.activate.success',
  'notification.instance.plugin.deactivate.success',
  'notification.instance.plugin.update.success',
  'notification.instance.plugin.delete.success',
  'general.featured',
]

/**
 * Known exception: a mass update with one item calls
 * `heading.instance.plugin.update.message.title` with `count: 1`, but the fixtures only have the `_other` form.
 * Legacy then shows the raw key; the port stays the same, so a missing `_one` is expected.
 */
const D3_KEY = 'heading.instance.plugin.update.message.title'

describe('plugins page i18n keys', () => {
  it('lists each key used by the page', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(fixtures.app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(fixtures.lite, key)).toBe(true)
  })

  it('keeps the D3 exception: the count-1 form of the bulk update title is absent, the plural form exists', () => {
    for (const flat of [fixtures.app, fixtures.lite]) {
      expect(`${D3_KEY}_one` in flat).toBe(false)
      expect(`${D3_KEY}_other` in flat).toBe(true)
    }
  })
})
