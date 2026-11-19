import { describe, expect, it, vi } from 'vitest'
import { DOCUMENTATION_URL, HUB_INCLUDED_LINES, loadSummaryAi, loadSummaryHub, panelEdition } from './summary-step'

describe('loadSummaryHub', () => {
  it('trusts step 2 and does not ask the panel when the pairing is known', async () => {
    const getFreeHub = vi.fn()
    expect(await loadSummaryHub(true, getFreeHub)).toBe('connected')
    expect(getFreeHub).not.toHaveBeenCalled()
  })

  it('asks the Community panel after a reload or a direct visit', async () => {
    expect(await loadSummaryHub(false, vi.fn().mockResolvedValue({ paired: true }))).toBe('connected')
    expect(await loadSummaryHub(false, vi.fn().mockResolvedValue({ paired: false }))).toBe('missing')
  })

  it('keeps the answer unknown when the call fails', async () => {
    expect(await loadSummaryHub(false, vi.fn().mockRejectedValue(new Error('offline')))).toBe('unknown')
  })
})

describe('Hub lines', () => {
  it('has four lines, without the one about integrations, PanelAlpha GO! last', () => {
    expect(HUB_INCLUDED_LINES.map(line => line.key)).toEqual(['servers', 'login', 'monitoring', 'go'])
  })
})

describe('loadSummaryAi', () => {
  it('asks for the tokens also after step 3, so a token revoked in the meantime reads missing (impl-review F1)', async () => {
    const listTokens = vi.fn().mockResolvedValue([{ id: 1, revoked_at: '2026-01-01' }])
    expect(await loadSummaryAi(true, listTokens)).toBe('missing')
    expect(listTokens).toHaveBeenCalledTimes(1)
  })

  it('keeps a token made in step 3 when the call fails', async () => {
    expect(await loadSummaryAi(true, vi.fn().mockRejectedValue(new Error('offline')))).toBe('connected')
  })

  it('an active token means connected, only revoked ones or none mean missing', async () => {
    expect(await loadSummaryAi(false, vi.fn().mockResolvedValue([{ id: 1, revoked_at: null }]))).toBe('connected')
    expect(await loadSummaryAi(false, vi.fn().mockResolvedValue([{ id: 1, revoked_at: '2026-01-01' }]))).toBe('missing')
    expect(await loadSummaryAi(false, vi.fn().mockResolvedValue([]))).toBe('missing')
  })

  it('keeps the answer unknown when the call fails', async () => {
    expect(await loadSummaryAi(false, vi.fn().mockRejectedValue(new Error('offline')))).toBe('unknown')
  })
})

describe('panelEdition', () => {
  it('is community only for the Community panel', () => {
    expect(panelEdition({ community_panel: true })).toBe('community')
    expect(panelEdition({ community_panel: false })).toBeNull()
    expect(panelEdition({})).toBeNull()
    expect(panelEdition(undefined)).toBeNull()
  })

  it('has the documentation address', () => {
    expect(DOCUMENTATION_URL).toBe('https://www.panelalpha.com/documentation/single-server')
  })
})
