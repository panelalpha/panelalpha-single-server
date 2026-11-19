import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearTestCookies,
  installTestCookies,
  setTestCookie,
} from './cookie-jar.fixtures'
import {
  clearLoggedInFlag,
  getXsrfToken,
  isLoggedInGate,
  loggedInStorageKey,
  setLoggedInFlag,
} from './session.gate'

describe('session.gate', () => {
  beforeEach(() => {
    installTestCookies()
    clearLoggedInFlag()
  })

  afterEach(() => {
    clearLoggedInFlag()
    clearTestCookies()
  })

  it('builds the origin-scoped logged-in key', () => {
    expect(loggedInStorageKey()).toBe(`${window.location.origin}-loggedin`)
  })

  it('requires both the localStorage flag and XSRF-TOKEN', () => {
    expect(isLoggedInGate()).toBe(false)

    setLoggedInFlag()
    expect(isLoggedInGate()).toBe(false)

    setTestCookie('XSRF-TOKEN', 'test-token')
    expect(getXsrfToken()).toBe('test-token')
    expect(isLoggedInGate()).toBe(true)

    clearLoggedInFlag()
    expect(isLoggedInGate()).toBe(false)
  })
})
