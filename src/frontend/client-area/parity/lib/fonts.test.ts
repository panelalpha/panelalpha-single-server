// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizeFontName } from './fonts'

describe('normalizeFontName', () => {
  it('strips the Vite content hash', () => {
    expect(normalizeFontName('nunito-sans-latin-400-normal-DUb-KqT8.woff2')).toBe('nunito-sans-latin-400-normal.woff2')
    expect(normalizeFontName('nunito-sans-cyrillic-200-italic-Bkmtz252.woff')).toBe('nunito-sans-cyrillic-200-italic.woff')
    expect(normalizeFontName('nunito-sans-latin-ext-800-normal-K_AUXxcp.woff')).toBe('nunito-sans-latin-ext-800-normal.woff')
  })

  it('leaves an unhashed name alone', () => {
    expect(normalizeFontName('nunito-sans-latin-400-normal.woff2')).toBe('nunito-sans-latin-400-normal.woff2')
    expect(normalizeFontName('nunito-sans-latin-ext-800-italic.woff')).toBe('nunito-sans-latin-ext-800-italic.woff')
  })
})
