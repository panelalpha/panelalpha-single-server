import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EMAIL_SETTINGS_FIELDS, SSL_TYPE_OPTIONS } from './email-settings'

// The keys of the email settings page and of the test email modal must exist in the app and lite fixtures. The keys of fields and options come from the definitions
// in `email-settings.ts`, because the regex over `.vue` catches only single-argument `t('…')`.

const here = dirname(fileURLToPath(import.meta.url))
// From src/views/reseller/email-settings to the package root: 4 levels up.
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

const fixtures: Record<string, Flat> = {
  app: flatten(JSON.parse(readFileSync(join(fixtureRoot, 'translation.en.json'), 'utf8'))),
  lite: flatten(JSON.parse(readFileSync(join(fixtureRoot, 'lite/translation.en.json'), 'utf8'))),
}

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

const PAGE_KEYS = [
  'heading.reseller.page.emailSettings',
  ...EMAIL_SETTINGS_FIELDS.flatMap(field => [field.labelKey, field.placeholderKey]),
  ...SSL_TYPE_OPTIONS.flatMap(option => (option.titleKey ? [option.titleKey] : [])),
  'reseller.emailSettings.sendTestEmail',
  'reseller.emailSettings.sendTestEmailToAddress',
  'button.testConnection',
  'button.sendTestEmail',
  'button.saveChanges',
  'button.cancel',
  'message.alertManager.success',
]

// The server section title goes with a fallback `t(key, 'Mail Server Configuration')`, because the backend does not have this key yet.
const FALLBACK_KEY = 'reseller.emailSettings.serverConfiguration'

describe('email settings i18n keys', () => {
  it('covers the nine fields (label and placeholder) and every other page key', () => {
    expect(PAGE_KEYS.length).toBeGreaterThan(9 * 2)
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  describe.each(Object.entries(fixtures))('%s fixture', (_target, flat) => {
    it.each(PAGE_KEYS)('%s exists', key => {
      expect(hasKey(flat, key)).toBe(true)
    })

    it(`does not have ${FALLBACK_KEY} yet (remove the fallback in the view once it does)`, () => {
      expect(hasKey(flat, FALLBACK_KEY)).toBe(false)
    })
  })
})
