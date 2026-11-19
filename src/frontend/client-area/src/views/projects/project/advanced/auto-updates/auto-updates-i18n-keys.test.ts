import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AUTO_UPDATE_OPTIONS } from './auto-updates-settings'

// Keys of the auto-updates screen must exist in the fixtures. Shared keys are in both fixtures (app and lite),
// keys that only app has (blocks, "partial") are only in the app fixture.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/projects/project/advanced/auto-updates → the package root (6 levels up).
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

const app = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'translation.en.json'), 'utf8')))
const lite = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'lite/translation.en.json'), 'utf8')))

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/** Keys shared by app and lite, as the code passes them to `t(...)` in AutoUpdatesView.vue. */
const SHARED_KEYS = [
  'heading.instance.advanced.autoUpdates.title',
  'heading.instance.advanced.autoUpdates.upgrade.title',
  'heading.instance.advanced.autoUpdates.upgrade.subtitle',
  'heading.instance.advanced.autoUpdates.upgrade.option.latest',
  'heading.instance.advanced.autoUpdates.upgrade.option.minor',
  'heading.instance.advanced.autoUpdates.upgrade.plugin.title',
  'heading.instance.advanced.autoUpdates.upgrade.plugin.subtitle',
  'heading.instance.advanced.autoUpdates.upgrade.theme.title',
  'heading.instance.advanced.autoUpdates.upgrade.theme.subtitle',
  'notification.instance.settings.update',
]

/** Exception: keys that only app has (updater block and the "partial" paragraph). Lite does not send these fields, so the test checks them only in the app fixture. */
const APP_ONLY_KEYS = [
  'heading.instance.advanced.autoUpdates.blockedBy',
  'heading.instance.advanced.autoUpdates.upgrade.plugin.partial',
]

/** Keys of the WordPress version options: `t(option.labelKey)` in the view, values from `AUTO_UPDATE_OPTIONS`. */
const OPTION_KEYS = AUTO_UPDATE_OPTIONS.map(option => option.labelKey)

// Literal `t('…')` keys from the view: the list must contain all of them, otherwise a typo in the view passes the test.
// The pattern does not need `)` after the key, because `t('…', { constants })` is a literal key too.
const viewSource = readFileSync(join(here, 'AutoUpdatesView.vue'), 'utf8')
const VIEW_KEYS = [...viewSource.matchAll(/\bt\('([^']+)'/g)].map(match => match[1])

describe('auto-updates page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    const all = [...SHARED_KEYS, ...APP_ONLY_KEYS]
    expect(new Set(all).size).toBe(all.length)
  })

  it('covers every literal t() key used in AutoUpdatesView.vue', () => {
    const all = new Set([...SHARED_KEYS, ...APP_ONLY_KEYS])
    expect(VIEW_KEYS.length).toBeGreaterThan(0)
    expect(VIEW_KEYS.filter(key => !all.has(key))).toEqual([])
  })

  it('lists the two WordPress version options among the shared keys', () => {
    expect(OPTION_KEYS).toHaveLength(2)
    expect(OPTION_KEYS.filter(key => !SHARED_KEYS.includes(key))).toEqual([])
  })

  it.each(SHARED_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(SHARED_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })

  describe('wyjątek app-only (pin a4aab0ea): klucze tylko w fixture app', () => {
    it.each(APP_ONLY_KEYS)('%s exists in the app fixture', key => {
      expect(hasKey(app, key)).toBe(true)
    })
  })
})
