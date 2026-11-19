// Contract test: the "token created" step of the token modals is `TokenCreatedPanel`. Both modals had their own
// name field, token row, divider and confirmation; a new copy written by hand would bring them back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const PATTERN_DIR = join(SRC, 'shared', 'ui', 'record-box')
const CONSUMERS = [
  join(SRC, 'views', 'reseller', 'api', 'ApiTokenCreateModal.vue'),
  join(SRC, 'entities', 'mcp', 'ui', 'McpTokenCreateModal.vue'),
]
const COPY = /modal-divider|mcp-created-token/
const LOCAL = /modal-divider|mcp-created-token|token-name--disabled \{|CopyRecordItem|copy-text-button|AppMessage|<checkbox/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('token created step contract', () => {
  // One test per consumer, so a failure names the file (`expect(text, file)` is refused by `vitest/valid-expect`).
  it.each(CONSUMERS.map(file => [relative(ROOT, file), file]))('%s renders the panel and has no own copy of the step', (_name, file) => {
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('<token-created-panel')
    expect(text).not.toMatch(LOCAL)
  })

  it('no other component copies the token created step', () => {
    const offenders = walk(SRC)
      .filter(file => !file.startsWith(PATTERN_DIR))
      .filter(file => COPY.test(readFileSync(file, 'utf8')))
      .map(file => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('knows a copy it must catch', () => {
    expect(COPY.test('<div class="modal-divider mb-5" />')).toBe(true)
    expect(LOCAL.test('.v-input.v-input--disabled.reseller-api-token-name--disabled {')).toBe(true)
    expect(LOCAL.test('<copy-text-button :text="createdToken" />')).toBe(true)
    expect(LOCAL.test('name-class="reseller-api-token-name--disabled"')).toBe(false)
  })
})
