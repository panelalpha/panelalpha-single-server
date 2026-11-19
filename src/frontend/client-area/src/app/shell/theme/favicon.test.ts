import { beforeEach, describe, expect, it } from 'vitest'
import { applyDocumentFavicon, readDocumentFaviconHref } from './favicon'

const icon = () => document.head.querySelector<HTMLLinkElement>('link[rel~=\'icon\']')

beforeEach(() => {
  document.head.innerHTML = '<link rel="icon" href="/favicon.svg">'
})

describe('applyDocumentFavicon', () => {
  it('sets the href of the existing link', () => {
    applyDocumentFavicon(document, 'data:image/png;base64,F', '/favicon.svg')
    expect(icon()?.getAttribute('href')).toBe('data:image/png;base64,F')
    expect(document.head.querySelectorAll('link[rel~=\'icon\']')).toHaveLength(1)
  })

  it('creates the link when the document has none', () => {
    document.head.innerHTML = ''
    applyDocumentFavicon(document, 'data:image/png;base64,F', '/favicon.svg')
    expect(icon()?.getAttribute('href')).toBe('data:image/png;base64,F')
  })

  it.each([false, null, ''])('falls back to the start href for an empty favicon (%s)', empty => {
    applyDocumentFavicon(document, 'data:image/png;base64,F', '/favicon.svg')
    applyDocumentFavicon(document, empty, '/favicon.svg')
    expect(icon()?.getAttribute('href')).toBe('/favicon.svg')
  })
})

describe('readDocumentFaviconHref', () => {
  it('reads the raw href attribute', () => {
    expect(readDocumentFaviconHref(document)).toBe('/favicon.svg')
  })

  it('returns an empty string without a link', () => {
    document.head.innerHTML = ''
    expect(readDocumentFaviconHref(document)).toBe('')
  })
})
