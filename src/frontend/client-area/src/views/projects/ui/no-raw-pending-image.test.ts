// Contract test: the project card pending images are `InstancePendingOverlay`. The three images had
// their own layout, bar and terminal; a new copy written by hand would bring them back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const PATTERN_DIR = join(SRC, 'views', 'projects', 'ui')
const CONSUMERS = [
  'InstanceCardImgImportPending.vue',
  'InstanceCardImgInstallationPending.vue',
  'InstanceCardImgDeployPending.vue',
].map(file => join(SRC, 'views', 'projects', file))
const COPY = /pending__content|terminal-bar/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('project card pending image contract', () => {
  // One test per consumer, so a failure names the file (`expect(text, file)` is refused by `vitest/valid-expect`).
  it.each(CONSUMERS.map(file => [relative(ROOT, file), file]))('%s renders the pattern and has no own style, bar or terminal', (_name, file) => {
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('<instance-pending-overlay')
    expect(text).not.toMatch(/<style|<v-progress-linear|terminal-bar|__terminal/)
  })

  it('no other component copies the pending image layout', () => {
    const offenders = walk(SRC)
      .filter(file => !file.startsWith(PATTERN_DIR))
      .filter(file => COPY.test(readFileSync(file, 'utf8')))
      .map(file => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('knows a copy it must catch', () => {
    expect(COPY.test('<div class="import-pending__content">')).toBe(true)
    expect(COPY.test('<div class="deploy-pending__terminal-bar">')).toBe(true)
    expect(COPY.test('<instance-pending-overlay block="import-pending" />')).toBe(false)
  })
})
