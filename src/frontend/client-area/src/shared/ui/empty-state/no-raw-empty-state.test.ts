// Contract test: an empty state is `EmptyState` (`src/shared/ui/empty-state/`) and its Add button
// `PageAddButton`; no screen writes the legacy empty-state blocks by hand or restyles the elements the pattern renders.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
// A hand-made empty state: the old kit, a legacy block class or the raw Add button of an empty state.
const TEMPLATE_COPY = /<(?:TableFullScreenMessage|table-full-screen-message)\b|class="[^"]*(?<![\w-])(?:no-data-container|nodata-container__box|intro-page|add-new-button)(?![\w-])/
const IMPORT_COPY = /TableFullScreenMessage\.vue/
// A local rule whose first compound is an element the pattern renders.
const LOCAL_LOOK = /^\s*(?:\.no-data__|\.no-data--|\.no-data-container|\.nodata-container__|\.intro-page|\.v-card\.intro-page|\.add-new-button\b)/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return /\.(?:vue|scss)$/.test(entry.name) ? [path] : []
  })
}

const files = walk(join(SRC, 'views'))
// The theme grid of the onboarding modal is out of this contract (the onboarding family).
const EXEMPT = new Set([join(SRC, 'views', 'onboarding', 'modals', 'OnboardingChooseTemplateModal.vue')])

describe('empty state contract', () => {
  it('scans the views tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('knows a copy it must catch', () => {
    expect(TEMPLATE_COPY.test('<table-full-screen-message :title="x">')).toBe(true)
    expect(TEMPLATE_COPY.test('<TableFullScreenMessage')).toBe(true)
    expect(TEMPLATE_COPY.test('class="no-data-container"')).toBe(true)
    expect(TEMPLATE_COPY.test('class="nodata-container__box pt-15 pb-15"')).toBe(true)
    expect(TEMPLATE_COPY.test('class="intro-page"')).toBe(true)
    expect(TEMPLATE_COPY.test('class="p-2 add-new-button"')).toBe(true)
    expect(TEMPLATE_COPY.test(':class="showNoData ? \'instances-no-data-container\' : \'\'"')).toBe(false)
    expect(TEMPLATE_COPY.test('class="nodata-container w-100 d-flex"')).toBe(false)
    expect(TEMPLATE_COPY.test('<EmptyState variant="card">')).toBe(false)
    expect(LOCAL_LOOK.test('.no-data__action .v-btn {')).toBe(true)
    expect(LOCAL_LOOK.test('.no-data-container__title {')).toBe(true)
    expect(LOCAL_LOOK.test('  .intro-page__title {')).toBe(true)
    expect(LOCAL_LOOK.test('.add-new-button .v-icon {')).toBe(true)
    expect(LOCAL_LOOK.test('.no-data {')).toBe(false)
    expect(LOCAL_LOOK.test('.instances-no-data-container {')).toBe(false)
    expect(LOCAL_LOOK.test('.nodata-container {')).toBe(false)
  })

  it('has no hand-made empty state, raw empty-state Add button or local rule on the pattern elements in the views', () => {
    const problems = files.filter(file => !EXEMPT.has(file)).flatMap(file => {
      const text = readFileSync(file, 'utf8')
      const name = relative(ROOT, file)
      const template = file.endsWith('.vue') ? (text.match(/<template>[\s\S]*<\/template>/)?.[0] ?? '') : ''
      const styles = file.endsWith('.scss') ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
      const look = styles.split('\n').filter(line => LOCAL_LOOK.test(line))
      return [
        ...(TEMPLATE_COPY.test(template) ? [`${name}: an empty state written by hand (use EmptyState / PageAddButton)`] : []),
        ...(IMPORT_COPY.test(text) ? [`${name}: imports TableFullScreenMessage (use EmptyState)`] : []),
        ...look.map(line => `${name}: a local rule on the empty state: ${line.trim()}`),
      ]
    })
    expect(problems).toEqual([])
  })
})
