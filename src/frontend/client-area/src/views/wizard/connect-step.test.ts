import { describe, expect, it, vi } from 'vitest'
import { completeConnect, type ConnectDeps, displayAccountName, failureCopy, loadConnectStatus, startConnect } from './connect-step'

function deps (overrides: Partial<ConnectDeps> = {}): ConnectDeps {
  return {
    fetchCsrfCookie: vi.fn().mockResolvedValue(undefined),
    getFreeHub: vi.fn().mockResolvedValue({ paired: false, account_name: null }),
    startFreeHub: vi.fn().mockResolvedValue({ link: 'https://hub.example.test/connect' }),
    completeFreeHub: vi.fn().mockResolvedValue({ status: 'connected', account_name: 'Ann Bob' }),
    assignLocation: vi.fn(),
    refreshHome: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const hubReturn = { state: 's1', result: 'r1' }

function httpError (status: number, data: Record<string, unknown> = {}) {
  return { response: { status, data } }
}

describe('displayAccountName', () => {
  it('shows a name the Hub doubled once', () => {
    expect(displayAccountName('Ann Ann')).toBe('Ann')
  })

  it('keeps two different words', () => {
    expect(displayAccountName('Ann Bob')).toBe('Ann Bob')
  })

  it('trims the name and gives an empty string for nothing', () => {
    expect(displayAccountName('  Ann  ')).toBe('Ann')
    expect(displayAccountName('')).toBe('')
    expect(displayAccountName(null)).toBe('')
    expect(displayAccountName(undefined)).toBe('')
  })

  it('keeps a name of one word or of more than two', () => {
    expect(displayAccountName('Ann')).toBe('Ann')
    expect(displayAccountName('Ann Ann Ann')).toBe('Ann Ann Ann')
  })
})

describe('failureCopy', () => {
  it('gives a key and an English text for every failure of the pairing', () => {
    for (const failure of ['denied', 'expired', 'unreachable', 'unsupported', 'pending']) {
      const copy = failureCopy(failure)
      expect(copy.key).toBe(`setup.wizard.connect.failure.${failure}`)
      expect(copy.defaultValue.length).toBeGreaterThan(0)
    }
  })

  it('reads an unknown status as unreachable', () => {
    expect(failureCopy('weird').key).toBe('setup.wizard.connect.failure.unreachable')
    expect(failureCopy('toString').key).toBe('setup.wizard.connect.failure.unreachable')
  })
})

describe('loadConnectStatus', () => {
  it('reads the pairing from GET /community/hub', async () => {
    const status = await loadConnectStatus(deps({ getFreeHub: vi.fn().mockResolvedValue({ paired: true, account_name: 'Acme' }) }))
    expect(status).toEqual({ connected: true, accountName: 'Acme' })
  })

  it('is not connected when the panel says so or the call fails', async () => {
    expect(await loadConnectStatus(deps())).toEqual({ connected: false, accountName: '' })
    expect(await loadConnectStatus(deps({ getFreeHub: vi.fn().mockRejectedValue(httpError(500)) }))).toEqual({ connected: false, accountName: '' })
  })
})

describe('completeConnect', () => {
  it('connects, reads /home again and takes the account from the answer', async () => {
    const d = deps()
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'connected', accountName: 'Ann Bob', hubUrl: null })
    expect(d.completeFreeHub).toHaveBeenCalledWith('s1', 'r1')
    expect(d.refreshHome).toHaveBeenCalledTimes(1)
    expect(d.getFreeHub).not.toHaveBeenCalled()
  })

  it('hands on the address of the Hub account page from the answer', async () => {
    const d = deps({ completeFreeHub: vi.fn().mockResolvedValue({ status: 'connected', account_name: 'Ann', hub_url: 'https://hub.example.test/account' }) })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'connected', accountName: 'Ann', hubUrl: 'https://hub.example.test/account' })
  })

  it('asks the status call for the account when the answer has none', async () => {
    const d = deps({
      completeFreeHub: vi.fn().mockResolvedValue({ status: 'connected' }),
      getFreeHub: vi.fn().mockResolvedValue({ paired: true, account_name: 'Acme' }),
    })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'connected', accountName: 'Acme', hubUrl: null })
  })

  it('stays connected when /home cannot be read again', async () => {
    const d = deps({ refreshHome: vi.fn().mockRejectedValue(new Error('offline')) })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'connected', accountName: 'Ann Bob', hubUrl: null })
  })

  it('fails with the status of the answer; a pending answer keeps the return for another try', async () => {
    const denied = await completeConnect(hubReturn, deps({ completeFreeHub: vi.fn().mockResolvedValue({ status: 'denied' }) }))
    expect(denied).toEqual({ kind: 'failed', failure: 'denied', retry: null })

    const d = deps({ completeFreeHub: vi.fn().mockResolvedValue({ status: 'pending' }) })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'failed', failure: 'pending', retry: hubReturn })
    expect(d.refreshHome).not.toHaveBeenCalled()
  })

  it('goes to the sign-in on a 409 and reads /home first', async () => {
    const d = deps({ completeFreeHub: vi.fn().mockRejectedValue(httpError(409)) })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'login' })
    expect(d.refreshHome).toHaveBeenCalledTimes(1)
  })

  it('keeps the return for another try when the same one is being confirmed (409 confirming)', async () => {
    const d = deps({ completeFreeHub: vi.fn().mockRejectedValue(httpError(409, { code: 'confirming' })) })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'failed', failure: 'pending', retry: hubReturn })
  })

  it('drops the return on a 422 (the panel no longer knows the state)', async () => {
    const d = deps({ completeFreeHub: vi.fn().mockRejectedValue(httpError(422)) })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'failed', failure: 'expired', retry: null })
  })

  it('reads a server or network error as unreachable, without a retry', async () => {
    const d = deps({ completeFreeHub: vi.fn().mockRejectedValue(httpError(502)) })
    expect(await completeConnect(hubReturn, d)).toEqual({ kind: 'failed', failure: 'unreachable', retry: null })
  })
})

describe('startConnect', () => {
  it('sends the origin and the server name, then sends the browser to the link', async () => {
    const d = deps()
    expect(await startConnect('https://panel.test', 'Acme', d)).toEqual({ kind: 'redirected' })
    expect(d.fetchCsrfCookie).toHaveBeenCalledTimes(1)
    expect(d.startFreeHub).toHaveBeenCalledWith('https://panel.test', 'Acme')
    expect(d.assignLocation).toHaveBeenCalledWith('https://hub.example.test/connect')
  })

  it('does not follow a link that is not an http(s) address, and reads it as an unreachable Hub', async () => {
    const d = deps({ startFreeHub: vi.fn().mockResolvedValue({ link: 'javascript:alert(1)' }) })
    expect(await startConnect('https://panel.test', undefined, d)).toEqual({ kind: 'failed', messages: [], failure: 'unreachable' })
    expect(d.assignLocation).not.toHaveBeenCalled()
  })

  it('returns the messages of a failed start and does not leave the page', async () => {
    const d = deps({ startFreeHub: vi.fn().mockRejectedValue(httpError(500, { message: 'Hub is down' })) })
    expect(await startConnect('https://panel.test', undefined, d)).toEqual({ kind: 'failed', messages: ['Hub is down'] })
    expect(d.assignLocation).not.toHaveBeenCalled()
  })
})
