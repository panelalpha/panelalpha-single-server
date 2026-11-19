// Contract test: a page frame (the h1 title row, the page tab strip, the divider, the sidebar and content
// columns) is `PageFrame`. Seven screens had copies of it; a new frame written by hand would bring them back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const CONSUMERS = [
  ['reseller', 'ResellerAreaView.vue'],
  ['connect-ai', 'ConnectAiView.vue'],
  ['hosting', 'HostingView.vue'],
  ['account', 'billing', 'BillingView.vue'],
  ['account', 'services', 'ServicesView.vue'],
  ['account', 'profile', 'MyAccountView.vue'],
  ['account', 'settings', 'SettingsView.vue'],
  ['account', 'tasks', 'TasksView.vue'],
].map(parts => join(SRC, 'views', ...parts))
const CONNECT_AI_SHEET = join(SRC, 'views', 'connect-ai', 'ConnectAiView.scss')
const COPY = /top-title|v-tabs--page|<v-divider class="mb-12"/
const LOCAL_LOOK = /^\s*\.(?:top-title|account-tab-header|settings-tab-title|billing-content)\b|^\s*\.v-container\s*\{/m

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

const views = walk(join(SRC, 'views'))

describe('page frame contract', () => {
  it('scans the views tree', () => {
    expect(views.length).toBeGreaterThan(100)
  })

  it('knows a copy it must catch', () => {
    expect(COPY.test('<div class="w-100 d-flex top-title">')).toBe(true)
    expect(COPY.test('<v-tabs class="v-tabs--page">')).toBe(true)
    expect(COPY.test('<v-divider class="mb-12" />')).toBe(true)
    expect(COPY.test('<page-frame testid-prefix="x" :title="title">')).toBe(false)
    expect(LOCAL_LOOK.test('.top-title {\n  height: auto;\n}')).toBe(true)
    expect(LOCAL_LOOK.test('  .v-container {\n    padding: 12px;\n  }')).toBe(true)
    expect(LOCAL_LOOK.test('.filter-select.v-input {')).toBe(false)
  })

  it('each frame renders the pattern, without its own title row, tab strip or frame rules', () => {
    const problems = CONSUMERS.flatMap(file => {
      const text = readFileSync(file, 'utf8')
      const name = relative(ROOT, file)
      return [
        ...(text.includes('<page-frame') ? [] : [`${name}: no <page-frame>`]),
        ...(COPY.test(text) ? [`${name}: a copy of the frame (top-title, v-tabs--page, mb-12 divider)`] : []),
        ...(LOCAL_LOOK.test(text) ? [`${name}: a local frame rule`] : []),
      ]
    })
    expect(problems).toEqual([])
    expect(readFileSync(CONNECT_AI_SHEET, 'utf8')).not.toMatch(/\.top-title/)
  })

  it('no other screen copies the frame', () => {
    const copies = views
      .filter(file => !CONSUMERS.includes(file))
      .filter(file => COPY.test(readFileSync(file, 'utf8')))
      .map(file => relative(ROOT, file))
    expect(copies).toEqual([])
  })
})
