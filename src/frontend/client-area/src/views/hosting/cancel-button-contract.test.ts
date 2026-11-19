// Contract test: the Cancel button of the hosting modal builders comes from the kit
// (`cancelButton`, `src/shared/ui/modal/action-modal.ts`). The file manager modals keep their own button (no `cancel-btn` class).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOSTING = import.meta.dirname
const ROOT = join(HOSTING, '..', '..', '..')
const FILE_MANAGER = join(HOSTING, 'file-manager')

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return path === FILE_MANAGER ? [] : walk(path)
    }
    return /\.(?:vue|ts)$/.test(entry.name) && !/\.(?:test|fixtures)\.ts$/.test(entry.name) ? [path] : []
  })
}

const COPY = /function cancelButton\b|id: 'cancel'/
const files = walk(HOSTING)

describe('hosting cancel button contract (kit-dialog-onboarding, K-09 F7)', () => {
  it('scans the hosting views without the file manager', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('knows the spellings of a copy it must catch', () => {
    expect(COPY.test('function cancelButton (t: Translate): ModalButton {')).toBe(true)
    expect(COPY.test('{ id: \'cancel\', label: t(\'button.cancel\') }')).toBe(true)
    expect(COPY.test('import { cancelButton } from \'@/shared/ui/modal/action-modal\'')).toBe(false)
  })

  it('has no own Cancel button outside the kit', () => {
    expect(files.filter(file => COPY.test(readFileSync(file, 'utf8'))).map(file => relative(ROOT, file))).toEqual([])
  })
})
