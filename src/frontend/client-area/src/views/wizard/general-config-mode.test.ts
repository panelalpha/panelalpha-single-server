import { describe, expect, it } from 'vitest'
import { readonlyValues, resolveGeneralConfigMode } from './general-config-mode'

describe('resolveGeneralConfigMode', () => {
  it('is local for a guest', () => {
    expect(resolveGeneralConfigMode({ hasUser: false, setupRequired: true })).toBe('local')
    expect(resolveGeneralConfigMode({ hasUser: false, setupRequired: false })).toBe('local')
  })

  it('is hub for a signed-in user with the generated password once the setup is done', () => {
    expect(resolveGeneralConfigMode({ hasUser: true, setupRequired: false, passwordGenerated: true })).toBe('hub')
  })

  it('is readonly for a signed-in user whose password was set locally', () => {
    expect(resolveGeneralConfigMode({ hasUser: true, setupRequired: false, passwordGenerated: false })).toBe('readonly')
    expect(resolveGeneralConfigMode({ hasUser: true, setupRequired: undefined })).toBe('readonly')
  })

  it('is readonly, never the account form, for a signed-in user on a stale /home', () => {
    expect(resolveGeneralConfigMode({ hasUser: true, setupRequired: true })).toBe('readonly')
    expect(resolveGeneralConfigMode({ hasUser: true, setupRequired: true, passwordGenerated: true })).toBe('readonly')
  })
})

describe('readonlyValues', () => {
  it('reads the server name, the name and the email from /home', () => {
    expect(readonlyValues({ app: { name: 'Box' }, user: { name: 'Ada', email: 'ada@example.com' } })).toEqual({
      serverName: 'Box',
      name: 'Ada',
      email: 'ada@example.com',
    })
  })

  it('falls back to empty text', () => {
    expect(readonlyValues(null)).toEqual({ serverName: '', name: '', email: '' })
    expect(readonlyValues({ app: {} })).toEqual({ serverName: '', name: '', email: '' })
  })
})
