import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape-html'

describe('escapeHtml', () => {
  it('escapes the five HTML-special characters', () => {
    expect(escapeHtml('<b>"Tom" & \'Jerry\'</b>')).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;')
  })

  it('escapes the ampersand first, so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves plain values unchanged', () => {
    expect(escapeHtml('shop@example.com')).toBe('shop@example.com')
  })
})
