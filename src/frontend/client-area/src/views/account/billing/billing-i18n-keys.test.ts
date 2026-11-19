import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the Billing screen must exist in the app and lite fixtures.
// `Download` (the tooltip of the download button) has no key in legacy: i18next returns the key itself, so it is not checked here.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/account/billing to the package root (4 levels up).
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

const load = (file: string): Flat => flatten(JSON.parse(readFileSync(join(fixtureRoot, file), 'utf8')))

const fixtures = {
  app: load('translation.en.json'),
  lite: load('lite/translation.en.json'),
}

/** The keys of the screen, as the code passes them to `t(...)`. */
const PAGE_KEYS = [
  'heading.billing.title',
  'heading.billing.details.title',
  'heading.billing.details.trialInfo',
  'heading.billing.details.firstPaymentInfo',
  'heading.billing.invoice.title',
  'heading.billing.noData.title',
  'heading.billing.noData.text',
  'button.upgradeNow',
  'button.billing.pay_now',
  'button.dashboard.back',
  'tooltip.billing.invoice.duedate.exceeded',
  'table.header.number',
  'table.header.invoice_date',
  'table.header.due_date',
  'table.header.total',
  'table.header.status',
  'table.footer.invoice',
  'form.placeholder.search',
]

describe('billing page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it.each(PAGE_KEYS)('%s exists in the app fixture', key => {
    expect(key in fixtures.app).toBe(true)
  })

  it.each(PAGE_KEYS)('%s exists in the lite fixture', key => {
    expect(key in fixtures.lite).toBe(true)
  })
})
