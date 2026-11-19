import { describe, expect, it } from 'vitest'
import { decodeEntities } from './decode-entities'
import { escapeHtml } from './escape-html'

describe('decodeEntities', () => {
  it('decodes named and numeric entities (the WordPress.org catalogue sends them)', () => {
    expect(decodeEntities('Yoast SEO &#8211; Advanced SEO &amp; more')).toBe('Yoast SEO – Advanced SEO & more')
  })

  it('drops markup to its text without running it', () => {
    expect(decodeEntities('<img src=x onerror="alert(1)">Shop <b>Tools</b>')).toBe('Shop Tools')
  })

  it('leaves plain values unchanged', () => {
    expect(decodeEntities('Hello Dolly')).toBe('Hello Dolly')
  })

  it('round-trips through escapeHtml without double encoding', () => {
    expect(escapeHtml(decodeEntities('A &amp; B'))).toBe('A &amp; B')
  })
})
