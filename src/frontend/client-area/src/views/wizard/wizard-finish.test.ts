import { describe, expect, it, vi } from 'vitest'
import { finishWizard } from './wizard-finish'

function deps (overrides: Partial<Parameters<typeof finishWizard>[0]> = {}) {
  const calls: string[] = []
  return {
    calls,
    deps: {
      clearCache: vi.fn(() => {
        calls.push('clearCache')
      }),
      ensureHome: vi.fn(async () => {
        calls.push('ensureHome')
      }),
      openStart: vi.fn(async () => {
        calls.push('openStart')
        return true
      }),
      clearFlow: vi.fn(() => {
        calls.push('clearFlow')
      }),
      refreshServices: vi.fn(async () => {
        calls.push('refreshServices')
      }),
      startOnboarding: vi.fn(() => {
        calls.push('startOnboarding')
      }),
      ...overrides,
    },
  }
}

describe('finishWizard', () => {
  it('drops the cache, reads /home, opens the start page, closes the flow, reads the services and starts the onboarding, in that order', async () => {
    const { calls, deps: d } = deps()
    expect(await finishWizard(d)).toEqual([])
    expect(calls).toEqual(['clearCache', 'ensureHome', 'openStart', 'clearFlow', 'refreshServices', 'startOnboarding'])
  })

  it('closes the wizard flow of the tab only once the panel is open', async () => {
    const { deps: d } = deps()
    await finishWizard(d)
    expect(d.clearFlow).toHaveBeenCalledTimes(1)
  })

  it('keeps the flow open for a retry when the finish stops on a failed /home', async () => {
    const { calls, deps: d } = deps({
      ensureHome: vi.fn(async () => {
        throw Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status: 500, data: { message: 'Server exploded' } } })
      }),
    })
    const messages = await finishWizard(d)
    expect(messages.join(' ')).toContain('Server exploded')
    expect(calls).toEqual(['clearCache'])
    expect(d.openStart).not.toHaveBeenCalled()
    expect(d.clearFlow).not.toHaveBeenCalled()
    expect(d.startOnboarding).not.toHaveBeenCalled()
  })

  it('returns the messages when the move to the start page throws', async () => {
    const { deps: d } = deps({ openStart: vi.fn(async () => {
      throw new Error('Navigation failed')
    }) })
    expect((await finishWizard(d)).length).toBeGreaterThan(0)
    expect(d.clearFlow).not.toHaveBeenCalled()
    expect(d.startOnboarding).not.toHaveBeenCalled()
  })

  it('does not read the services nor start the onboarding when the navigation did not end on the start page', async () => {
    const { deps: d } = deps({ openStart: vi.fn(async () => false) })
    expect(await finishWizard(d)).toEqual([])
    expect(d.refreshServices).not.toHaveBeenCalled()
    expect(d.startOnboarding).not.toHaveBeenCalled()
  })

  it('returns nothing and does not start the onboarding when the services cannot be read after the move', async () => {
    const { deps: d } = deps({ refreshServices: vi.fn(async () => {
      throw new Error('Home failed')
    }) })
    expect(await finishWizard(d)).toEqual([])
    expect(d.startOnboarding).not.toHaveBeenCalled()
  })
})
