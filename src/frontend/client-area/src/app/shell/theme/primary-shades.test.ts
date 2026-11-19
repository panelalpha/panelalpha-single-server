import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_COLORS } from '@/shared/theme/brand-theme'
import { isHexColor, primaryVarsCss, toVuetifyPrimary, writePrimaryVars } from './primary-shades'

const colors = { base: '#111111', lighten1: '#222222', lighten2: '#333333', lighten4: '#444444', darken1: '#555555' }

beforeEach(() => {
  document.head.innerHTML = ''
})

describe('isHexColor', () => {
  it.each(['#abc', '#ABC', '#112233', '#1A2b3C', '#11223344', '#AABBCCDD'])('accepts %s', value => {
    expect(isHexColor(value)).toBe(true)
  })

  it.each([
    '',
    '#',
    '#ab',
    '#abcd',
    '#abcde',
    '#abcdefa',
    '#abcdefabc',
    'abcdef',
    'red',
    '#gggggg',
    ' #111111',
    '#111111 ',
    '#111111;',
    'red; } body { display: none',
    '#111111}body{}',
    'rgb(1, 2, 3)',
  ])('rejects %j', value => {
    expect(isHexColor(value)).toBe(false)
  })

  it.each([undefined, null, 0, 123_456, {}, ['#111111']])('rejects a non-string %j', value => {
    expect(isHexColor(value)).toBe(false)
  })
})

describe('toVuetifyPrimary', () => {
  it('maps only the base to the V4 primary key', () => {
    expect(toVuetifyPrimary(colors)).toEqual({ primary: '#111111' })
  })

  it('falls back to the default brand base when the base is not a hex color', () => {
    expect(toVuetifyPrimary({ base: 'red; } body { display: none' })).toEqual({ primary: '#07C07E' })
    expect(toVuetifyPrimary({ base: '' })).toEqual({ primary: '#07C07E' })
    expect(toVuetifyPrimary({ base: undefined as unknown as string })).toEqual({ primary: '#07C07E' })
  })
})

describe('primaryVarsCss', () => {
  const css = primaryVarsCss(colors)
  const light = css.slice(css.indexOf('.v-theme--light'), css.indexOf('.v-theme--dark'))
  const dark = css.slice(css.indexOf('.v-theme--dark'))

  it('declares all five shades in the light theme', () => {
    expect(light).toContain('--v-primary-base: #111111;')
    expect(light).toContain('--v-primary-lighten1: #222222;')
    expect(light).toContain('--v-primary-lighten2: #333333;')
    expect(light).toContain('--v-primary-lighten4: #444444;')
    expect(light).toContain('--v-primary-darken1: #555555;')
  })

  it('declares only base, lighten1 and darken1 in the dark theme', () => {
    expect(dark).toContain('--v-primary-base: #111111;')
    expect(dark).toContain('--v-primary-lighten1: #222222;')
    expect(dark).toContain('--v-primary-darken1: #555555;')
    expect(dark).not.toContain('lighten2')
    expect(dark).not.toContain('lighten4')
    expect(dark).not.toContain('lighten5')
  })
})

describe('primaryVarsCss with invalid values', () => {
  const injected = 'red; } body { display: none; } .x {'

  it('skips only the declaration whose value is not a hex color', () => {
    const css = primaryVarsCss({ ...colors, lighten2: injected })
    expect(css).not.toContain('injected')
    expect(css).not.toContain('display: none')
    expect(css).not.toContain('--v-primary-lighten2')
    expect(css).toContain('--v-primary-base: #111111;')
    expect(css).toContain('--v-primary-darken1: #555555;')
  })

  it('skips every invalid value across both themes and keeps the selectors', () => {
    const css = primaryVarsCss({ base: '', lighten1: 'nope', lighten2: '#12', lighten4: injected, darken1: undefined as unknown as string })
    expect(css).toBe('.v-theme--light {\n}\n.v-theme--dark {\n}')
  })

  it('keeps the output of valid colors unchanged', () => {
    expect(primaryVarsCss(colors)).toBe([
      '.v-theme--light {',
      '  --v-primary-base: #111111;',
      '  --v-primary-lighten1: #222222;',
      '  --v-primary-lighten2: #333333;',
      '  --v-primary-lighten4: #444444;',
      '  --v-primary-darken1: #555555;',
      '}',
      '.v-theme--dark {',
      '  --v-primary-base: #111111;',
      '  --v-primary-lighten1: #222222;',
      '  --v-primary-darken1: #555555;',
      '}',
    ].join('\n'))
  })
})

describe('writePrimaryVars', () => {
  it('keeps a single style element and updates it in place', () => {
    writePrimaryVars(document, { ...DEFAULT_BRAND_COLORS })
    writePrimaryVars(document, colors)
    const styles = document.head.querySelectorAll('style[id="brand-primary-vars"]')
    expect(styles).toHaveLength(1)
    expect(styles[0].textContent).toContain('#111111')
  })

  it('appends the element at the end of the head', () => {
    document.head.append(document.createElement('meta'))
    writePrimaryVars(document, colors)
    expect(document.head.lastElementChild?.id).toBe('brand-primary-vars')
  })
})
