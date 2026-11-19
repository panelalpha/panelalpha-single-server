import { describe, expect, it } from 'vitest'
import { hubReturnOf, isHttpUrl, outcomeOf, pairingOf, queryWithoutHubReturn, retryAfterError, toastKeyOf } from './hub-connection'

const RETRY = { state: 'abc', result: 'approved' }

describe('pairingOf', () => {
  it('reads paired and the account name', () => {
    expect(pairingOf({ paired: true, account_name: 'Acme' })).toEqual({ connected: true, accountName: 'Acme' })
    expect(pairingOf({ paired: false, account_name: null })).toEqual({ connected: false, accountName: '' })
    expect(pairingOf({ paired: false })).toEqual({ connected: false, accountName: '' })
  })
})

describe('outcomeOf', () => {
  it('connected shows the account, refreshes /home and drops the retry', () => {
    expect(outcomeOf({ status: 'connected', account_name: 'Acme' }, RETRY)).toEqual({
      pairing: { connected: true, accountName: 'Acme' },
      refreshHome: true,
      toastKey: null,
      retry: null,
    })
  })

  it.each([
    ['denied', 'settings.panelalphaHub.toast.denied'],
    ['expired', 'settings.hub.expired'],
  ] as const)('%s toasts its key, keeps Connect and does not refresh /home', (status, toastKey) => {
    expect(outcomeOf({ status }, RETRY)).toEqual({ pairing: null, refreshHome: false, toastKey, retry: null })
  })

  it('pending toasts, keeps the state for Check again and does not refresh /home', () => {
    expect(outcomeOf({ status: 'pending' }, RETRY)).toEqual({ pairing: null, refreshHome: false, toastKey: 'settings.panelalphaHub.toast.pending', retry: RETRY })
  })
})

describe('toastKeyOf', () => {
  it('denied and pending use the keys that say PanelAlpha Hub, the others keep the old key', () => {
    expect(toastKeyOf('denied')).toBe('settings.panelalphaHub.toast.denied')
    expect(toastKeyOf('pending')).toBe('settings.panelalphaHub.toast.pending')
    expect(toastKeyOf('expired')).toBe('settings.hub.expired')
    expect(toastKeyOf('unsupported')).toBe('settings.hub.unsupported')
  })
})

describe('retryAfterError', () => {
  it('422 clears the retry, 409 / 502 / network keep it', () => {
    expect(retryAfterError({ response: { status: 422 } }, RETRY)).toBeNull()
    expect(retryAfterError({ response: { status: 409 } }, RETRY)).toBe(RETRY)
    expect(retryAfterError({ response: { status: 502 } }, RETRY)).toBe(RETRY)
    expect(retryAfterError(new Error('network'), RETRY)).toBe(RETRY)
    expect(retryAfterError({ response: { status: 422 } }, null)).toBeNull()
  })
})

describe('hubReturnOf', () => {
  it('needs a state; result defaults to an empty string', () => {
    expect(hubReturnOf({})).toBeNull()
    expect(hubReturnOf({ result: 'approved' })).toBeNull()
    expect(hubReturnOf({ state: 'abc' })).toEqual({ state: 'abc', result: '' })
    expect(hubReturnOf({ state: 'abc', result: 'approved' })).toEqual(RETRY)
  })
})

describe('queryWithoutHubReturn', () => {
  it('drops state and result and keeps the rest', () => {
    expect(queryWithoutHubReturn({ tab: 'backups', state: 'abc', result: 'approved' })).toEqual({ tab: 'backups' })
    expect(queryWithoutHubReturn({ state: 'abc', result: 'approved' })).toEqual({})
  })

  it('does not mutate the route query', () => {
    const query = { state: 'abc' }
    queryWithoutHubReturn(query)
    expect(query).toEqual({ state: 'abc' })
  })
})

describe('isHttpUrl', () => {
  it('follows absolute http and https addresses', () => {
    expect(isHttpUrl('https://hub.example.test/connect?state=s1')).toBe(true)
    expect(isHttpUrl('http://localhost:2140/hub')).toBe(true)
  })

  it('refuses other schemes, relative paths, empty and missing values', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,x', 'ftp://hub.example.test', '/relative', 'hub.example.test', '', null, undefined]) {
      expect(isHttpUrl(value)).toBe(false)
    }
  })
})
