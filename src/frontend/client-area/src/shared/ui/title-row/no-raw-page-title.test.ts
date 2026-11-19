// Contract test: a page or section title is `PageTitle` (or `AdvancedPageLayout`), the
// green Add button of a title is `PageAddButton`, and no screen restyles the elements the pattern renders. 42 screens had copies.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
// The header copy: a `page-title` container or a `title-row` written by hand.
const TITLE_COPY = /<v-container[^>]* class="[^"]*\bpage-title\b|'page-title |<title-row\b|<TitleRow\b|"title-row"|'title-row'/
// The Add button copy: both legacy classes of the page-add kind on a raw button.
const ADD_COPY = /add-new-button page-title__add-button/
// A local rule whose last compound is an element the pattern renders (the row, the columns, the button size) or the old Advanced grid.
const LOCAL_LOOK = /^\s*(?:\.title-row\b|\.page-title\s*(?:\{|>\s*\.v-row)|\.page-title__(?:title-box|filter-controls)\s*[{,]|\.page-title__add-button\b|\.(?:cdn|edge-cache|cloudflare|mcp|dev|details|copy|git|wordpress-users|themes|security|auto-updates)-(?:title|title-row|cards|row)\s*\{)/m

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
// `hosting-title-row.scss` has no importer since this change (kept on disk: no deletes in the autopilot).
const EXEMPT = new Set([join(SRC, 'views', 'hosting', 'hosting-title-row.scss')])

describe('page title contract', () => {
  it('scans the views tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('knows a copy it must catch', () => {
    expect(TITLE_COPY.test('<v-container class="page-title page-title--advanced cdn-title">')).toBe(true)
    expect(TITLE_COPY.test(`<v-container :class="isProject ? 'page-title page-title--advanced py-3' : 'x'">`)).toBe(true)
    expect(TITLE_COPY.test('<title-row :class="x">')).toBe(true)
    expect(TITLE_COPY.test('<PageTitle :title="t(\'x\')" variant="advanced">')).toBe(false)
    expect(TITLE_COPY.test('<v-col class="page-title__tabs d-flex align-center">')).toBe(false)
    expect(ADD_COPY.test('class="p-2 add-new-button page-title__add-button"')).toBe(true)
    expect(ADD_COPY.test('class="p-2 add-new-button"')).toBe(false)
    expect(LOCAL_LOOK.test('.title-row {\n  height: 70px;\n}')).toBe(true)
    expect(LOCAL_LOOK.test('.page-title > .v-row {')).toBe(true)
    expect(LOCAL_LOOK.test('.page-title__filter-controls {')).toBe(true)
    expect(LOCAL_LOOK.test('.cdn-title-row {')).toBe(true)
    expect(LOCAL_LOOK.test('.page-title__add-button.v-btn--size-default {')).toBe(true)
    expect(LOCAL_LOOK.test('.page-title__title-box > .v-btn {')).toBe(false)
    expect(LOCAL_LOOK.test('.page-title .ml-auto > .v-input {')).toBe(false)
    expect(LOCAL_LOOK.test('.add-new-button .v-icon {')).toBe(false)
    expect(LOCAL_LOOK.test('.item-title {')).toBe(false)
    expect(LOCAL_LOOK.test('.git-commit-details .git-kv-row {')).toBe(false)
  })

  it('has no hand-made page title, Add button or local rule on the pattern elements in the views', () => {
    const problems = files.filter(file => !EXEMPT.has(file)).flatMap(file => {
      const text = readFileSync(file, 'utf8')
      const name = relative(ROOT, file)
      const template = file.endsWith('.vue') ? (text.match(/<template>[\s\S]*<\/template>/)?.[0] ?? '') : ''
      const styles = file.endsWith('.scss') ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
      const look = styles.split('\n').filter(line => LOCAL_LOOK.test(line))
      return [
        ...(TITLE_COPY.test(template) ? [`${name}: a page title written by hand (use PageTitle)`] : []),
        ...(ADD_COPY.test(template) ? [`${name}: an Add button written by hand (use PageAddButton)`] : []),
        ...look.map(line => `${name}: a local rule on the page title: ${line.trim()}`),
      ]
    })
    expect(problems).toEqual([])
  })
})
