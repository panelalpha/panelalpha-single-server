import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The "Wrong DNS" state reuses two keys that live on other screens. Fail early if a fixture drops them.

const here = dirname(fileURLToPath(import.meta.url))
// src/entities/ssl is three levels below the package root.
const fixtureRoot = join(here, '../../../parity/fixtures')

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

const SSL_WRONG_DNS_KEYS = [
  'message.status.wrongDns',
]

describe('ssl wrong dns i18n keys', () => {
  it.each(SSL_WRONG_DNS_KEYS)('%s exists in the app fixture', key => {
    expect(hasKey(app, key)).toBe(true)
  })

  it.each(SSL_WRONG_DNS_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })
})
