import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Keys of the project Env file page (the variables table) must exist in the lite fixture. Keys with a count (`count`) are `_one` / `_other` in the fixtures; one of the forms is enough.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/projects/project/advanced/env-file → the package root (6 levels up).
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

const lite = flatten(JSON.parse(readFileSync(join(fixtureRoot, 'lite/translation.en.json'), 'utf8')))

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/**
 * Keys of the variables table page: new `heading.instance.advanced.envFile.*`, existing ones used by the page, global
 * `button.*`, `message.confirmAction`, `table.header.*`. The editor keys (`hint`, `subtitle`, `pathLabel`, `mode.*`, `confirm.*`, `leave.*`,
 * `missing`) were removed with the editor.
 */
const PAGE_KEYS = [
  // new
  'heading.instance.advanced.envFile.import',
  'heading.instance.advanced.envFile.empty.title',
  'heading.instance.advanced.envFile.empty.description',
  'heading.instance.advanced.envFile.modal.add.title',
  'heading.instance.advanced.envFile.modal.edit.title',
  'heading.instance.advanced.envFile.modal.delete.title',
  'heading.instance.advanced.envFile.modal.delete.message',
  'heading.instance.advanced.envFile.modal.import.title',
  'heading.instance.advanced.envFile.form.key',
  'heading.instance.advanced.envFile.form.value',
  'heading.instance.advanced.envFile.form.contents',
  'heading.instance.advanced.envFile.form.overwrite',
  'heading.instance.advanced.envFile.validation.key',
  'heading.instance.advanced.envFile.validation.importEmpty',
  'heading.instance.advanced.envFile.fileManagerHint',
  'heading.instance.advanced.envFile.staleError',
  'heading.instance.advanced.envFile.imported',
  'table.header.key',
  // existing, in use
  'heading.instance.advanced.envFile.title',
  'heading.instance.advanced.envFile.addVariable',
  'heading.instance.advanced.envFile.confirm.restart',
  'heading.instance.advanced.envFile.wordpressNotice',
  'heading.instance.advanced.envFile.saved',
  'heading.instance.advanced.envFile.restarted',
  'heading.instance.advanced.envFile.loadError',
  'heading.instance.advanced.envFile.saveError',
  'heading.instance.advanced.envFile.duplicateKey',
  // global
  'button.save',
  'button.delete',
  'button.cancel',
  'button.config.edit',
  'button.config.delete',
  'message.confirmAction',
  'table.header.value',
  'table.header.actions',
]

/**
 * Page keys that the lite deploy does not have (fixture from 2026-10-29). Empty list: after the fixtures refresh all page keys exist on
 * the deploy. If the deploy loses a key, add an entry here with a comment and the copy in the view through `defaultValue` (do not hide the gap by removing it from the list).
 */
const MISSING_ON_DEPLOY = new Set<string>()

describe('env-file page i18n keys', () => {
  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it.each(PAGE_KEYS.filter(key => !MISSING_ON_DEPLOY.has(key)))('%s exists in the lite fixture', key => {
    expect(hasKey(lite, key)).toBe(true)
  })

  it.each([...MISSING_ON_DEPLOY])('%s is listed as missing on deploy and is really absent', key => {
    expect(PAGE_KEYS).toContain(key)
    expect(hasKey(lite, key)).toBe(false)
  })
})
