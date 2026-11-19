import { describe, expect, it } from 'vitest'
import { resolveBrandLogoSrc } from './brand-logo'

describe('resolveBrandLogoSrc', () => {
  const defaults = { light: '/default-light.svg', dark: '/default-dark.svg' }

  it('uses default assets when custom logos are missing', () => {
    expect(resolveBrandLogoSrc({}, false, defaults)).toBe(defaults.light)
    expect(resolveBrandLogoSrc({}, true, defaults)).toBe(defaults.dark)
    expect(resolveBrandLogoSrc(undefined, false, defaults)).toBe(defaults.light)
  })

  it('prefers logo / darkLogo when present', () => {
    const values = {
      logo: 'data:image/png;base64,aaa',
      darkLogo: 'data:image/png;base64,bbb',
    }
    expect(resolveBrandLogoSrc(values, false, defaults)).toBe('data:image/png;base64,aaa')
    expect(resolveBrandLogoSrc(values, true, defaults)).toBe('data:image/png;base64,bbb')
  })

  it('keeps http(s) and root-relative URLs unchanged', () => {
    expect(resolveBrandLogoSrc({ logo: 'https://cdn.example.com/a.png' }, false, defaults)).toBe('https://cdn.example.com/a.png')
    // eslint-disable-next-line unicorn/prefer-https -- the plain http branch is the point of this assertion
    expect(resolveBrandLogoSrc({ logo: 'http://cdn.example.com/a.png' }, false, defaults)).toBe('http://cdn.example.com/a.png')
    expect(resolveBrandLogoSrc({ logo: '/storage/logo.png' }, false, defaults)).toBe('/storage/logo.png')
  })

  it('encodes raw SVG markup as a data URL', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const src = resolveBrandLogoSrc({ logo: svg }, false, defaults)
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(src).toContain(encodeURIComponent(svg))
  })

  it('ignores empty, whitespace-only, false and null custom logos', () => {
    expect(resolveBrandLogoSrc({ logo: ' '.repeat(3), darkLogo: false }, false, defaults)).toBe(defaults.light)
    expect(resolveBrandLogoSrc({ logo: null, darkLogo: null }, true, defaults)).toBe(defaults.dark)
    expect(resolveBrandLogoSrc({ darkLogo: ' '.repeat(3) }, true, defaults)).toBe(defaults.dark)
  })

  it('trims surrounding whitespace of a custom logo', () => {
    expect(resolveBrandLogoSrc({ logo: '  /logo.png  ' }, false, defaults)).toBe('/logo.png')
  })
})
