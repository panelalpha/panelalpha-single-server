import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EDGE_CACHE_TTL_OPTIONS } from './edge-cache-settings'

// Keys of the Edge Cache screen must exist in both fixtures (app and lite).
// Keys with a count (`count`) are `_one` / `_other` in the fixtures; one of the forms is enough then.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/projects/project/advanced/edge-cache → the package root (6 levels up).
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

/** Keys of the Edge Cache screen, as the code passes them to `t(...)` in EdgeCacheView.vue (direct keys) and the cancel modal (`cancelButton`). */
const PAGE_KEYS = [
  'heading.instance.advanced.edge-cache.title',
  'heading.instance.advanced.edge-cache.manage.title',
  'heading.instance.advanced.edge-cache.manage.subtitle',
  'heading.instance.advanced.edge-cache.cloudflare-conflict.note',
  'heading.instance.advanced.edge-cache.purge.title',
  'heading.instance.advanced.edge-cache.purge.subtitle',
  'heading.instance.advanced.edge-cache.purge.alert',
  'heading.instance.advanced.edge-cache.defensive-mode.title',
  'heading.instance.advanced.edge-cache.defensive-mode.subtitle',
  'heading.instance.advanced.edge-cache.modal.cloudflare-warning.title',
  'heading.instance.advanced.edge-cache.modal.cloudflare-warning.info',
  'heading.instance.advanced.edge-cache.modal.cloudflare-warning.alert',
  'heading.instance.advanced.edge-cache.modal.purge.title',
  'heading.instance.advanced.edge-cache.modal.purge.info',
  'notification.instance.edge-cache.manage.enable.success',
  'notification.instance.edge-cache.manage.disable.success',
  'notification.instance.edge-cache.purge.success',
  'notification.instance.edge-cache.defensive-mode.enable.success',
  'notification.instance.edge-cache.defensive-mode.disable.success',
  'button.edge-cache.enable',
  'button.purge',
  'button.cancel',
  'form.label.ttl',
]

/** TTL label keys: `labelKey` from `EDGE_CACHE_TTL_OPTIONS` (`t(option.labelKey, { count })` in EdgeCacheView.vue). */
const TTL_LABEL_KEYS = [...new Set(EDGE_CACHE_TTL_OPTIONS.map(option => option.labelKey))]

// Literal `t('…')` keys from the view: the PAGE_KEYS list must contain all of them, otherwise a typo in the view passes the test.
const viewSource = readFileSync(join(here, 'EdgeCacheView.vue'), 'utf8')
const VIEW_KEYS = [...viewSource.matchAll(/\bt\('([^']+)'\)/g)].map(match => match[1])

describe('edge cache page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it('covers every literal t() key used in EdgeCacheView.vue', () => {
    expect(VIEW_KEYS.length).toBeGreaterThan(0)
    expect(VIEW_KEYS.filter(key => !PAGE_KEYS.includes(key))).toEqual([])
  })

  it('lists the TTL label keys of the five options', () => {
    expect(EDGE_CACHE_TTL_OPTIONS).toHaveLength(5)
    expect(TTL_LABEL_KEYS).toEqual(['general.time.minute', 'general.time.hour', 'general.time.day'])
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })

  it.each(TTL_LABEL_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(TTL_LABEL_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })
})
