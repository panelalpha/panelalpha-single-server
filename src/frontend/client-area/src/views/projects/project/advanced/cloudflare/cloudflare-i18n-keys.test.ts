import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLOUDFLARE_SECURITY_LEVELS } from './cloudflare-settings'

// Keys of the Cloudflare screen must exist in both fixtures (app and lite).
// Keys with a count (`count`) are `_one` / `_other` in the fixtures; one of the forms is enough then.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/projects/project/advanced/cloudflare → the package root (6 levels up).
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

/** Keys of the Cloudflare screen, as the code passes them to `t(...)` in CloudflareView.vue and cloudflare-settings.ts (direct keys). */
const PAGE_KEYS = [
  'heading.instance.advanced.cloudflare.title',
  'heading.instance.advanced.cloudflare.manage.title',
  'heading.instance.advanced.cloudflare.manage.subtitle',
  'heading.instance.advanced.cloudflare.manage.label',
  'heading.instance.advanced.cloudflare.cache.title',
  'heading.instance.advanced.cloudflare.cache.subtitle',
  'heading.instance.advanced.cloudflare.cache.alert',
  'heading.instance.advanced.cloudflare.development.title',
  'heading.instance.advanced.cloudflare.development.subtitle',
  'heading.instance.advanced.cloudflare.development.alert',
  'heading.instance.advanced.cloudflare.browser.title',
  'heading.instance.advanced.cloudflare.browser.subtitle',
  'heading.instance.advanced.cloudflare.security.title',
  'heading.instance.advanced.cloudflare.security.subtitle',
  'heading.instance.advanced.cloudflare.modal.purge.title',
  'heading.instance.advanced.cloudflare.modal.purge.info',
  'button.cloudflare.manage',
  'button.purge',
  'button.purgeEverything',
  'button.cancel',
  'message.status.active',
  'message.status.wrongDns',
  'notification.instance.cloudflare.development.success',
  'notification.instance.cloudflare.browser.success',
  'notification.instance.cloudflare.securityLevel.success',
  'notification.instance.cloudflare.cache.success',
]

/** Keys of the security level select: values from `CLOUDFLARE_SECURITY_LEVELS` (`t(level.labelKey)` in CloudflareView.vue). */
const SECURITY_LEVEL_KEYS = CLOUDFLARE_SECURITY_LEVELS.map(level => level.labelKey)

// Literal `t('…')` keys from the view: the PAGE_KEYS list must contain all of them, otherwise a typo in the view passes the test.
const viewSource = readFileSync(join(here, 'CloudflareView.vue'), 'utf8')
const VIEW_KEYS = [...viewSource.matchAll(/\bt\('([^']+)'\)/g)].map(match => match[1])

describe('cloudflare page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it('covers every literal t() key used in CloudflareView.vue', () => {
    expect(VIEW_KEYS.filter(key => !PAGE_KEYS.includes(key))).toEqual([])
  })

  it('lists the six security level labels', () => {
    expect(SECURITY_LEVEL_KEYS).toHaveLength(6)
    expect(new Set(SECURITY_LEVEL_KEYS).size).toBe(SECURITY_LEVEL_KEYS.length)
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })

  it.each(SECURITY_LEVEL_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(SECURITY_LEVEL_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })
})
