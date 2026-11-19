import { describe, expect, it, vi } from 'vitest'
import { onSessionCleared, runSessionClearedHandlers } from './session-reset'

describe('session-reset', () => {
  it('runs every registered handler on each call', () => {
    const first = vi.fn()
    const second = vi.fn()
    onSessionCleared(first)
    onSessionCleared(second)

    runSessionClearedHandlers()
    runSessionClearedHandlers()

    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('keeps one entry when the same handler is registered twice', () => {
    const handler = vi.fn()
    onSessionCleared(handler)
    onSessionCleared(handler)

    runSessionClearedHandlers()

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
