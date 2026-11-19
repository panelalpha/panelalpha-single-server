import type { WordpressMcpStatus } from './wordpress-mcp.api'
import { describe, expect, it } from 'vitest'
import {
  applyMcpStatus,
  isMcpBusy,
  isMcpOn,
  isTerminalForAction,
  type McpAction,
  mcpActionResult,
  type McpState,
  settleMcpStatus,
  shouldKeepPolling,
} from './wordpress-mcp-state'

function payload (state: McpState, extra: Partial<WordpressMcpStatus> = {}): WordpressMcpStatus {
  return {
    state,
    endpoint: 'https://example.test/mcp',
    config_json: '{"mcpServers":{}}',
    ...extra,
  }
}

describe('isMcpOn', () => {
  const cases: Array<[McpState, boolean]> = [
    ['disabled', false],
    ['installing', true],
    ['active', true],
    ['endpoint_unavailable', true],
    ['removing', true],
    ['failed', false],
  ]

  it.each(cases)('is %s → %s', (state, expected) => {
    expect(isMcpOn(state)).toBe(expected)
  })
})

describe('isMcpBusy', () => {
  it('is false when nothing is in progress', () => {
    expect(isMcpBusy({ state: 'active', submitting: false, awaitingWebsocketUpdate: false })).toBe(false)
  })

  it('is true while installing', () => {
    expect(isMcpBusy({ state: 'installing', submitting: false, awaitingWebsocketUpdate: false })).toBe(true)
  })

  it('is true while removing', () => {
    expect(isMcpBusy({ state: 'removing', submitting: false, awaitingWebsocketUpdate: false })).toBe(true)
  })

  it('is true while a request is in flight', () => {
    expect(isMcpBusy({ state: 'disabled', submitting: true, awaitingWebsocketUpdate: false })).toBe(true)
  })

  it('is true while the websocket update is awaited', () => {
    expect(isMcpBusy({ state: 'active', submitting: false, awaitingWebsocketUpdate: true })).toBe(true)
  })
})

describe('applyMcpStatus', () => {
  it('keeps installing when enable is pending and the API still says disabled', () => {
    expect(applyMcpStatus('enable', payload('disabled'))).toEqual({
      state: 'installing',
      endpoint: 'https://example.test/mcp',
      configJson: '{"mcpServers":{}}',
    })
  })

  it('keeps removing when disable is pending and the API says active', () => {
    expect(applyMcpStatus('disable', payload('active')).state).toBe('removing')
  })

  it('keeps removing when disable is pending and the API says endpoint_unavailable', () => {
    expect(applyMcpStatus('disable', payload('endpoint_unavailable')).state).toBe('removing')
  })

  it('takes the API state when no action is pending', () => {
    expect(applyMcpStatus(null, payload('disabled')).state).toBe('disabled')
    expect(applyMcpStatus(null, payload('active')).state).toBe('active')
  })

  it('takes the API state when the action has moved on, e.g. enable and the API says active', () => {
    expect(applyMcpStatus('enable', payload('active')).state).toBe('active')
  })

  it('takes endpoint and config from the API in every branch', () => {
    const data = payload('disabled', { endpoint: null, config_json: null })
    expect(applyMcpStatus('enable', data)).toMatchObject({ endpoint: null, configJson: null })
    expect(applyMcpStatus(null, data)).toMatchObject({ endpoint: null, configJson: null })
    expect(applyMcpStatus('disable', payload('active', { endpoint: 'e', config_json: 'c' })))
      .toMatchObject({ endpoint: 'e', configJson: 'c' })
  })
})

describe('isTerminalForAction', () => {
  const cases: Array<[McpAction, McpState, boolean]> = [
    ['enable', 'active', true],
    ['enable', 'endpoint_unavailable', true],
    ['enable', 'failed', true],
    ['enable', 'installing', false],
    ['enable', 'disabled', false],
    ['disable', 'disabled', true],
    ['disable', 'failed', true],
    ['disable', 'removing', false],
    ['disable', 'active', false],
  ]

  it.each(cases)('pending %s, state %s → %s', (pending, state, expected) => {
    expect(isTerminalForAction(pending, state)).toBe(expected)
  })

  it('is false without a pending action', () => {
    expect(isTerminalForAction(null, 'active')).toBe(false)
    expect(isTerminalForAction(null, 'disabled')).toBe(false)
  })
})

describe('shouldKeepPolling', () => {
  it('without an action polls while installing or removing', () => {
    expect(shouldKeepPolling({ pending: null, state: 'installing', awaitingWebsocketUpdate: false })).toBe(true)
    expect(shouldKeepPolling({ pending: null, state: 'removing', awaitingWebsocketUpdate: false })).toBe(true)
  })

  it('without an action does not poll in other states', () => {
    for (const state of ['disabled', 'active', 'endpoint_unavailable', 'failed'] as const) {
      expect(shouldKeepPolling({ pending: null, state, awaitingWebsocketUpdate: false })).toBe(false)
    }
  })

  it('with an action keeps polling while the websocket update is awaited', () => {
    expect(shouldKeepPolling({ pending: 'enable', state: 'active', awaitingWebsocketUpdate: true })).toBe(true)
  })

  it('with an action stops polling on a terminal state when nothing is awaited', () => {
    expect(shouldKeepPolling({ pending: 'enable', state: 'active', awaitingWebsocketUpdate: false })).toBe(false)
    expect(shouldKeepPolling({ pending: 'disable', state: 'disabled', awaitingWebsocketUpdate: false })).toBe(false)
  })

  it('with an action keeps polling on a non-terminal state', () => {
    expect(shouldKeepPolling({ pending: 'enable', state: 'installing', awaitingWebsocketUpdate: false })).toBe(true)
  })
})

describe('mcpActionResult', () => {
  it('enable succeeds on active', () => {
    expect(mcpActionResult('enable', 'active')).toEqual({ success: true, key: 'enableSuccess' })
  })

  it('enable succeeds on endpoint_unavailable', () => {
    expect(mcpActionResult('enable', 'endpoint_unavailable')).toEqual({ success: true, key: 'enableSuccess' })
  })

  it('enable fails on failed', () => {
    expect(mcpActionResult('enable', 'failed')).toEqual({ success: false, key: 'failed' })
  })

  it('disable succeeds on disabled', () => {
    expect(mcpActionResult('disable', 'disabled')).toEqual({ success: true, key: 'disableSuccess' })
  })

  it('disable fails on failed', () => {
    expect(mcpActionResult('disable', 'failed')).toEqual({ success: false, key: 'failed' })
  })
})

describe('settleMcpStatus', () => {
  it('returns the raw API state, so enable with a disabled payload settles as disabled (D1)', () => {
    expect(settleMcpStatus(payload('disabled'))).toEqual({
      state: 'disabled',
      endpoint: 'https://example.test/mcp',
      configJson: '{"mcpServers":{}}',
    })
  })

  it('maps config_json to configJson and keeps null endpoint and config', () => {
    expect(settleMcpStatus(payload('failed', { endpoint: null, config_json: null }))).toEqual({
      state: 'failed',
      endpoint: null,
      configJson: null,
    })
  })
})
