import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import { resolveBootLanguage } from './resolve-boot-language'

describe('resolveBootLanguage', () => {
  it('returns user.language when home.user is set', () => {
    const home = {
      app: { default_language: 'de' },
      user: { language: 'pl' },
    } as HomeResponse
    expect(resolveBootLanguage(home)).toBe('pl')
  })

  it('returns app.default_language when user is absent', () => {
    const home = {
      app: { default_language: 'de' },
    } as HomeResponse
    expect(resolveBootLanguage(home)).toBe('de')
  })

  it('returns en when home is null or languages are empty', () => {
    expect(resolveBootLanguage(null)).toBe('en')
    expect(resolveBootLanguage(undefined)).toBe('en')
    expect(resolveBootLanguage({
      app: { default_language: '' },
      user: { language: '  ' },
    } as HomeResponse)).toBe('en')
    expect(resolveBootLanguage({
      app: { default_language: '  ' },
    } as HomeResponse)).toBe('en')
  })

  it('ignores empty user.language and falls back to default_language', () => {
    const home = {
      app: { default_language: 'fr' },
      user: { language: '' },
    } as HomeResponse
    expect(resolveBootLanguage(home)).toBe('fr')
  })
})
