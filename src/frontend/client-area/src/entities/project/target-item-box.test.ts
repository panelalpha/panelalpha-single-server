import { describe, expect, it } from 'vitest'
import { targetItemBox, targetListBox } from './target-item-box'

// The box markup of the plugins and themes dialogs. The name is wrapped in the legacy `gray--text text--darken-1`
// colour; the box text and the rating keep the modal colour.
const BOX_STYLE = 'display: flex; align-items: center; border-radius: 6px; border: 1px solid var(--v-gray-lighten3); '
  + 'background: var(--v-gray-lighten5); padding: 16px; margin-top: 16px; font-weight: 600'
const LIST_STYLE = `${BOX_STYLE}; flex-direction: column; align-items: stretch`
const name = (label: string) => `<span class="text-gray-darken-1">${label}</span>`

describe('targetItemBox', () => {
  it('renders the label in the grey box with the legacy inline style and the gray darken1 name class', () => {
    expect(targetItemBox('Akismet')).toBe(`<span class="target-item-box" style="${BOX_STYLE}">${name('Akismet')}</span>`)
  })

  it('puts the extra markup (the install rating) inside the box after the name, outside the name colour', () => {
    expect(targetItemBox('Akismet', '<b style="margin-left: auto; min-width: 48px">4.5</b>')).toBe(
      `<span class="target-item-box" style="${BOX_STYLE}">${name('Akismet')}<b style="margin-left: auto; min-width: 48px">4.5</b></span>`,
    )
  })

  it('takes the border token as a parameter (themes use gray-lighten2)', () => {
    expect(targetItemBox('Theme', '', 'gray-lighten2')).toBe(
      `<span class="target-item-box" style="${BOX_STYLE.replace('gray-lighten3', 'gray-lighten2')}">${name('Theme')}</span>`,
    )
  })

  // Themes (`flat`): the box carries `0 0 8px`, the 16 px above it come from `.basic-modal-target`; the plugins default keeps `margin-top: 16px`.
  it('takes the flat flag as a parameter (margin 0 0 8px instead of margin-top 16px)', () => {
    expect(targetItemBox('Theme', '', 'gray-lighten2', true)).toBe(
      `<span class="target-item-box" style="${BOX_STYLE.replace('gray-lighten3', 'gray-lighten2').replace('margin-top: 16px', 'margin: 0 0 8px')}">${name('Theme')}</span>`,
    )
  })
})

describe('targetListBox', () => {
  it('stacks one row per label with the gray darken1 name class, 12px between the rows and none after the last', () => {
    expect(targetListBox(['Akismet', 'hello-dolly'])).toBe(
      `<span class="target-item-box flex-column" style="${LIST_STYLE}">`
      + '<span class="text-gray-darken-1" style="display: flex; margin-bottom: 12px">Akismet</span><span class="text-gray-darken-1" style="display: flex">hello-dolly</span>'
      + '</span>',
    )
  })

  it('renders a single row without a gap', () => {
    expect(targetListBox(['Akismet'])).toBe(
      `<span class="target-item-box flex-column" style="${LIST_STYLE}"><span class="text-gray-darken-1" style="display: flex">Akismet</span></span>`,
    )
  })

  it('renders the box for an empty list, as legacy did for the mass update with nothing to update', () => {
    expect(targetListBox([])).toBe(`<span class="target-item-box flex-column" style="${LIST_STYLE}"></span>`)
  })

  it('takes the border token as a parameter (themes use gray-lighten2)', () => {
    expect(targetListBox(['Theme'], 'gray-lighten2')).toBe(
      `<span class="target-item-box flex-column" style="${LIST_STYLE.replace('gray-lighten3', 'gray-lighten2')}">`
      + '<span class="text-gray-darken-1" style="display: flex">Theme</span></span>',
    )
  })
})
