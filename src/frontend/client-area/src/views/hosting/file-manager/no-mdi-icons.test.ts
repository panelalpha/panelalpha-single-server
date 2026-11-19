// Contract test: the file manager draws app icons (`$…` aliases), not `mdi-*`. `npm run ui:scan` only counts `mdi` hits, so nothing failed when one came back.
// Scans `.vue` and `.ts` sources (icon names live in `fm-file-type.ts` and `fm-context-menu.ts` too); tests are skipped,
// because they assert that `mdi-*` is gone.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const FM = import.meta.dirname
const MDI = /\bmdi-[a-z]/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return /\.(?:vue|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

function offenders (files: string[]): string[] {
  return files.flatMap(file => {
    const lines = readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => (MDI.test(line) ? [index + 1] : []))
    return lines.length > 0 ? [`${relative(FM, file)}: line ${lines.join(', ')}`] : []
  })
}

describe('file manager icons', () => {
  it('scans the file manager sources', () => {
    expect(walk(FM).some(file => file.endsWith('FileManagerView.vue'))).toBe(true)
  })

  it('uses no mdi-* icon names', () => {
    expect(offenders(walk(FM))).toEqual([])
  })

  it('catches an mdi-* name', () => {
    expect(MDI.test(`icon: 'mdi-folder'`)).toBe(true)
    expect(MDI.test(`icon: '$folder'`)).toBe(false)
  })
})
