import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Keys of the CDN screen must exist in both fixtures: app (`parity/fixtures/translation.en.json`) and lite (`parity/fixtures/lite/translation.en.json`,
// keys `advanced.cdn.*`). Lite is the source of truth for the CDN page, so its fixture is checked the same way as app.
// Keys with a count (`count`) are `_one` / `_other` in the fixtures; one of the forms is enough then.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/projects/project/advanced/cdn → the package root (6 levels up).
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
const lite = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'lite', 'translation.en.json'), 'utf8')))

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/**
 * Keys of the CDN screen, all from the plan's i18n section. The under-attack alert keys are dynamic in legacy (enable / disable),
 * so both forms are listed explicitly.
 */
const PAGE_KEYS = [
  'heading.instance.advanced.cdn.title',
  'heading.instance.advanced.cdn.purge.title',
  'heading.instance.advanced.cdn.purge.subtitle',
  'heading.instance.advanced.cdn.purge.alert',
  'heading.instance.advanced.cdn.under-attack.title',
  'heading.instance.advanced.cdn.under-attack.subtitle',
  'heading.instance.advanced.cdn.features.title',
  'heading.instance.advanced.cdn.modal.purge.title',
  'heading.instance.advanced.cdn.modal.purge.info',
  'notification.instance.cdn.purge.success',
  'notification.instance.cdn.under-attack.enable.success',
  'notification.instance.cdn.under-attack.disable.success',
  'button.purge',
  'button.cancel',
  'title.cdn',
]

// Literal `t('…')` keys from the view: the PAGE_KEYS list must contain all of them, otherwise a typo in the view passes the test.
const viewSource = readFileSync(join(here, 'CdnView.vue'), 'utf8')
const VIEW_KEYS = [...viewSource.matchAll(/\bt\('([^']+)'\)/g)].map(match => match[1])

describe('cdn page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it('covers every literal t() key used in CdnView.vue', () => {
    expect(VIEW_KEYS.length).toBeGreaterThan(0)
    expect(VIEW_KEYS.filter(key => !PAGE_KEYS.includes(key))).toEqual([])
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })
})
