// Contract test: the dialogs of the cleared view groups are `AppDialog` (or a preset over it), not a bare
// `v-dialog`. The hosting, account, auth, reseller, Connect AI and shell modals are cleared; the next changes of the dialog
// family add their directories here and turn it into the rule for the whole tree.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const CLEAN_DIRS = ['views/hosting', 'views/account', 'views/auth', 'views/reseller', 'views/connect-ai', 'entities/mcp', 'app/shell', 'views/onboarding']
  .map(directory => join(SRC, ...directory.split('/')))
const RAW_DIALOG = /<v-dialog\b|<VDialog\b/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

// Files with a raw dialog tag outside HTML comments.
function offenders (files: string[]): string[] {
  return files
    .filter(file => RAW_DIALOG.test(readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')))
    .map(file => `${relative(ROOT, file)} (use AppDialog)`)
}

const files = CLEAN_DIRS.flatMap(directory => walk(directory))

describe('dialog contract (kit-dialog-account-reseller)', () => {
  it('scans the cleared view groups', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('knows the spellings of a raw dialog it must catch', () => {
    expect(RAW_DIALOG.test('<v-dialog v-model="open">')).toBe(true)
    expect(RAW_DIALOG.test('<VDialog :model-value="open">')).toBe(true)
    expect(RAW_DIALOG.test('<AppDialog v-model="open">')).toBe(false)
    expect(RAW_DIALOG.test('<app-dialog v-model="open">')).toBe(false)
  })

  it('finds no bare v-dialog in the cleared view groups', () => {
    expect(offenders(files)).toEqual([])
  })
})
