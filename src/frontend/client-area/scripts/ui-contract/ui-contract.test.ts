// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLEAN_FILES, EXEMPT, STRICT_DIRS } from './ui-contract.files.ts'
import { declaredVars, gate, isAllowed, scanText, undeclaredVars } from './ui-contract.ts'

// The one UI contract test (change `ui-guard`, F-14; AGENTS.md "UI: tokeny i kit"): every file on `CLEAN_FILES` takes its colours from
// the token layer. A hex, `rgb()`/`rgba()`/`hsl()`/`oklch()` literal fails (`rgb(var(--…))` is a token reference), a `strict` file also
// fails on inline `style=`, and a `var(--v-…)` no stylesheet of `src/app/styles` declares fails (a typo would silently fall back to
// the inherited value). Add the files of a cleaned view to `scripts/ui-contract/ui-contract.files.ts`.
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const declared = declaredVars(join(rootDir, 'src/app/styles'))

function vueFiles (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return vueFiles(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('UI contract: the cleaned files take their colours from tokens', () => {
  it('lists existing files once, under src/', () => {
    const files = CLEAN_FILES.map(entry => entry.file)
    expect(new Set(files).size).toBe(files.length)
    expect(files.filter(file => !file.startsWith('src/'))).toEqual([])
    expect(files.filter(file => !existsSync(join(rootDir, file)))).toEqual([])
  })

  it('covers every .vue of the fully cleaned feature directories', () => {
    const listed = new Set(CLEAN_FILES.map(entry => entry.file))
    const missing = STRICT_DIRS
      .flatMap(dir => vueFiles(join(rootDir, dir)))
      .map(path => relative(rootDir, path))
      .filter(file => !listed.has(file) && !EXEMPT.includes(file))
    expect(missing).toEqual([])
  })

  it('scans the Free settings and hub views and the Backups components (legacy Settings.literals.test.js:7-21)', () => {
    const files = CLEAN_FILES.map(entry => entry.file)
    expect(files.some(file => file.includes('/account/settings/'))).toBe(true)
    expect(files.some(file => file.includes('/account/settings/hub/'))).toBe(true)
    for (const name of ['BackupStorage.vue', 'BackupStoreModal.vue', 'BackupSettings.vue']) {
      expect(files).toContain(`src/views/account/settings/backups/${name}`)
    }
  })

  it('reads the declared token names of the global layer', () => {
    expect(declared.has('--v-red-base')).toBe(true)
    expect(declared.has('--v-sheet-surface')).toBe(true)
    for (const name of ['orange', 'blue', 'green']) {
      expect(declared.has(`--v-${name}-base`)).toBe(true)
      expect(declared.has(`--v-${name}-lighten5`)).toBe(true)
    }
  })

  it.each(CLEAN_FILES.map(entry => [entry.file, entry] as const))('%s has no colour literal and reads only declared tokens', (file, entry) => {
    const source = readFileSync(join(rootDir, file), 'utf8')
    const failing = gate(scanText(source, { file }), { strict: entry.strict === true })
      .filter(hit => !isAllowed(hit.text, entry.allow))
      .map(hit => `${file}:${hit.line}: ${hit.category}: ${hit.text}`)
    expect(failing).toEqual([])
    expect(undeclaredVars(source, declared)).toEqual([])
  })
})
