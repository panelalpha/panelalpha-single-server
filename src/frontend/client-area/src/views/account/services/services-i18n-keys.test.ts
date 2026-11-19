import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CANCEL_REASON_KEYS } from './cancel-service'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')

function readJson (file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, file), 'utf8')) as Record<string, unknown>
}

// The translation files nest keys, and some levels hold flat dotted keys (`emptyTable["cron.title"]`), so every prefix is tried.
function lookup (node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null) {
    return undefined
  }
  const object = node as Record<string, unknown>
  if (key in object) {
    return object[key]
  }
  for (const [name, child] of Object.entries(object)) {
    if (key.startsWith(`${name}.`)) {
      const found = lookup(child, key.slice(name.length + 1))
      if (found !== undefined) {
        return found
      }
    }
  }
  return undefined
}

// Every `t('literal')` of the screen's sources, plus the keys that are built at runtime.
const sources = readdirSync(here)
  .filter(file => /\.(?:vue|ts)$/.test(file) && !file.endsWith('.test.ts'))
  .map(file => readFileSync(join(here, file), 'utf8'))
  .join('\n')

const literalKeys = new Set([...sources.matchAll(/\bt\(\s*'([^']+)'/g)].map(match => match[1]!))
const dynamicKeys = [
  ...CANCEL_REASON_KEYS,
  'heading.hosting.domains.domain.main',
  'heading.hosting.domains.domain.addon',
  'heading.hosting.domains.domain.sub',
  'heading.hosting.domains.domain.alias',
  // `table.header.${t(text)}` (TableCustomSort and the mobile row titles).
  'table.header.plan_name',
  'table.header.instance_limit',
  'table.header.sites',
  'table.header.actions',
  // The unlimited limit text, called from the entity helper `instanceLimitText`.
  'form.value.unlimited',
  // The document title, `title.${meta.title}`.
  'title.services',
]

// Legacy wraps these in `$t(...)` although they have no translation, so the screen shows the key itself (same `t(...)` calls here).
const UNTRANSLATED_IN_LEGACY = new Set(['Expires', 'more', 'instance_limit', 'sites', 'actions', 'plan_name'])
// Missing from the lite fixture only (deploy, fixture 2026-10-25); the app fixture has them.
// Empty since the 2026-10-25 refresh: `general.active` and `general.suspended` are in the lite fixture now.
const MISSING_IN_LITE_FIXTURE = new Set<string>()
// The Limits column and action of a plan row (paid editions) are new, so legacy has no text for it: each call carries a `defaultValue` until the
// backend translations have the key.
const NEW_WITH_DEFAULT = new Set([
  'button.manageLimits',
  'button.viewLimits',
  'button.goToProject',
  'table.header.limits',
  // The "+N more" of the Project details Limits row, newer than the fixtures.
  'heading.instance.advanced.siteDetails.card.site.limits.more',
])

describe('legacy i18n keys of the services screen', () => {
  const app = readJson('parity/fixtures/translation.en.json')
  const lite = readJson('parity/fixtures/lite/translation.en.json')
  const keys = [...new Set([...literalKeys, ...dynamicKeys])].toSorted()

  it('reads the keys of the screen', () => {
    expect(keys).toEqual(expect.arrayContaining([
      'general.myPlans',
      'button.upgrade',
      'message.emptyTable.services.title',
      'heading.cancelServiceModal.describe.minimum',
      'table.footer.plan',
    ]))
  })

  it('has every key in the app fixture, apart from the ones legacy leaves untranslated', () => {
    const missing = keys.filter(key => lookup(app, key) === undefined && !UNTRANSLATED_IN_LEGACY.has(key) && !NEW_WITH_DEFAULT.has(key))
    expect(missing).toEqual([])
  })

  it('has every key in the lite fixture, apart from the named exceptions', () => {
    const missing = keys.filter(key => lookup(lite, key) === undefined && !UNTRANSLATED_IN_LEGACY.has(key) && !MISSING_IN_LITE_FIXTURE.has(key)
      && !NEW_WITH_DEFAULT.has(key))
    expect(missing).toEqual([])
  })

  it('keeps the lite exceptions real: the lite fixture lacks them, the app fixture has them', () => {
    for (const key of MISSING_IN_LITE_FIXTURE) {
      expect(lookup(lite, key)).toBeUndefined()
      expect(lookup(app, key)).toBeDefined()
    }
  })

  it('keeps the untranslated-in-legacy keys untranslated, so the exception list stays honest', () => {
    for (const key of UNTRANSLATED_IN_LEGACY) {
      expect(lookup(app, key)).toBeUndefined()
    }
  })
})
