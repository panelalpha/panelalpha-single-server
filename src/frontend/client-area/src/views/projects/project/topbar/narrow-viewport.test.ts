// The project top bar fits a narrow window: the action buttons wrap, the title search menu is never wider than the window
// (the menu content is capped at `100vw - 48px`, the rows inside it have to fit), and a long project name does not push the
// name editor's buttons out. jsdom applies no stylesheet, so this guard reads the style blocks and the template of the
// components.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string): string => readFileSync(resolve(__dirname, file), 'utf8')
const style = (text: string): string => /<style[\s\S]*?<\/style>/.exec(text)?.[0] ?? ''
function rule (text: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  return new RegExp(String.raw`${escaped}\s*\{([^}]*)\}`).exec(text)?.[1] ?? ''
}

/** The narrow-window block of a style block (the top-level one; the nested rules are indented). */
const mobile = (text: string): string => text.slice(text.search(/^@media \(max-width: 975\.98px\)/m))

describe('project top bar at a narrow window', () => {
  it('lets the row of action buttons wrap instead of reaching past the page', () => {
    const template = /<template>([\s\S]*?)<script/.exec(source('InstanceTopBar.vue'))?.[1] ?? ''
    const buttonsRow = /<div\s+class="d-flex ([^"]*justify-start justify-lg-end[^"]*)"/.exec(template)

    expect(/\bflex-wrap\b/.test(buttonsRow?.[1] ?? '')).toBe(true)
  })

  it('caps the search results list at the menu width, and keeps the legacy 473px where it fits', () => {
    expect(rule(style(source('TopBarTitle.vue')), '.instance-search-menu__list')).toMatch(/max-width:\s*100%/)
    expect(rule(style(source('TopBarTitle.vue')), '.instance-search-menu__list')).toMatch(/width:\s*473px/)
  })

  it('caps the search skeletons the same way', () => {
    expect(rule(style(source('InstanceSearchItemSkeleton.vue')), '.skeleton')).toMatch(/max-width:\s*100%/)
  })

  it('wraps a long title or domain inside the search row', () => {
    const content = rule(style(source('InstanceSearchItem.vue')), '&__content')

    expect(content).toMatch(/min-width:\s*0/)
    expect(content).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('shrinks a long project name so the name editor buttons stay on the page', () => {
    const narrow = mobile(style(source('TopBarEditableTitle.vue')))

    expect(rule(narrow, '.top-bar-title__button')).toMatch(/min-width:\s*0/)
    expect(rule(narrow, '.top-bar-title__button-text')).toMatch(/min-width:\s*0/)
  })
})
