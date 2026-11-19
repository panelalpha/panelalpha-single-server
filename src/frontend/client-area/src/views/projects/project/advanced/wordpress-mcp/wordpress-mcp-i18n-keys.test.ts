import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the WordPress MCP screen must exist in the fixtures. Shared keys are in both fixtures (app and lite),
// `documentationLink` is only in the app fixture.

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

const app = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'translation.en.json'), 'utf8')))
const lite = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'lite/translation.en.json'), 'utf8')))

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/**
 * Keys shared by app and lite: the literal `t('…')` calls of WordpressMcpView.vue and wordpress-mcp-modal.ts (with `button.cancel` from `cancelButton`).
 * The action result keys (`enableSuccess`, `disableSuccess`, `failed`) are built with the template
 * `heading.instance.advanced.wordpressMcp.${key}` in use-wordpress-mcp.ts, so the scan of literal `t('…')` calls does not see them. They are listed by hand.
 */
const SHARED_KEYS = [
  'heading.instance.advanced.wordpressMcp.title',
  'heading.instance.advanced.wordpressMcp.description',
  'heading.instance.advanced.wordpressMcp.pluginRequiredHint',
  'heading.instance.advanced.wordpressMcp.failed',
  'heading.instance.advanced.wordpressMcp.howToConnect',
  'heading.instance.advanced.wordpressMcp.step1Title',
  'heading.instance.advanced.wordpressMcp.step1Body',
  'heading.instance.advanced.wordpressMcp.step1Link',
  'heading.instance.advanced.wordpressMcp.step2Title',
  'heading.instance.advanced.wordpressMcp.step3Title',
  'heading.instance.advanced.wordpressMcp.step3Body',
  'heading.instance.advanced.wordpressMcp.copy',
  'heading.instance.advanced.wordpressMcp.endpointUnavailable',
  'heading.instance.advanced.wordpressMcp.disableConfirmTitle',
  'heading.instance.advanced.wordpressMcp.disableConfirmBody',
  'heading.instance.advanced.wordpressMcp.confirm',
  // The template `heading.instance.advanced.wordpressMcp.${key}` in use-wordpress-mcp.ts (`completePendingAction`).
  'heading.instance.advanced.wordpressMcp.enableSuccess',
  // The template `heading.instance.advanced.wordpressMcp.${key}` in use-wordpress-mcp.ts (`completePendingAction`).
  'heading.instance.advanced.wordpressMcp.disableSuccess',
  // `cancelButton(t)` in action-modal.ts, used by the disable modal.
  'button.cancel',
  // The document title from `meta.title: 'wordpress-mcp'` in the route.
  'title.wordpress-mcp',
]

/**
 * Exception: `documentationLink` (the "Documentation" link in the "How to connect" card) is only in the app fixture.
 * The lite fixture is out of date (it lacks this key), and the lite source has it. Fixtures are not changed in the code-only mode.
 */
const APP_ONLY_FIXTURE_KEYS = ['heading.instance.advanced.wordpressMcp.documentationLink']

// The literal `t('…')` keys of the view and the modal: the list must contain all of them, otherwise a typo passes the test.
// The pattern does not need `)` after the key, because `t('…', { constants })` is also a literal key.
const viewSource = readFileSync(join(here, 'WordpressMcpView.vue'), 'utf8')
const modalSource = readFileSync(join(here, 'wordpress-mcp-modal.ts'), 'utf8')
const VIEW_KEYS = [...viewSource.matchAll(/\bt\('([^']+)'/g)].map(match => match[1])
const MODAL_KEYS = [...modalSource.matchAll(/\bt\('([^']+)'/g)].map(match => match[1])

describe('wordpress-mcp page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    const all = [...SHARED_KEYS, ...APP_ONLY_FIXTURE_KEYS]
    expect(new Set(all).size).toBe(all.length)
  })

  it('covers every literal t() key used in WordpressMcpView.vue and wordpress-mcp-modal.ts', () => {
    const all = new Set([...SHARED_KEYS, ...APP_ONLY_FIXTURE_KEYS])
    expect(VIEW_KEYS.length).toBeGreaterThan(0)
    expect(MODAL_KEYS.length).toBeGreaterThan(0)
    expect([...VIEW_KEYS, ...MODAL_KEYS].filter(key => !all.has(key))).toEqual([])
  })

  it.each(SHARED_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(SHARED_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })

  describe('wyjątek app-only: documentationLink jest tylko w fixture app', () => {
    it.each(APP_ONLY_FIXTURE_KEYS)('%s exists in the app fixture', key => {
      expect(hasKey(app, key)).toBe(true)
    })
  })
})
