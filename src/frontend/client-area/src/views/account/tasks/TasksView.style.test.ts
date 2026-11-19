// The Free Tasks page is the only top-level page without the shell's page padding. Nothing visible sits outside the page box, so the
// page clips a wider child instead of scrolling sideways; jsdom applies no stylesheet, so this guard reads the component's own style block.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'TasksView.vue'), 'utf8')
const style = /<style[\s\S]*?<\/style>/.exec(source)?.[0] ?? ''

describe('TasksView: the page does not scroll sideways', () => {
  it('clips a wider child at the page box', () => {
    expect(style).toMatch(/\.free-tasks\s*\{[^}]*overflow-x:\s*clip/)
  })

  it('clips on the root the page renders', () => {
    expect(source).toMatch(/<template>\s*<page-frame\s+class="free-tasks"/)
  })
})
