import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY_RESET_DELAY, useCopyText } from './use-copy-text'

describe('useCopyText', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    vi.useFakeTimers()
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts idle, writes the text and switches to copied', async () => {
    const { state, copy } = useCopyText(() => 'secret')
    expect(state.value).toBe('copy')
    await copy()
    expect(writeText).toHaveBeenCalledWith('secret')
    expect(state.value).toBe('copied')
  })

  it('resets to idle 150 ms after mouseleave', async () => {
    const { state, copy, reset } = useCopyText(() => 'x')
    await copy()
    reset()
    vi.advanceTimersByTime(COPY_RESET_DELAY - 1)
    expect(state.value).toBe('copied')
    vi.advanceTimersByTime(1)
    expect(state.value).toBe('copy')
    expect(COPY_RESET_DELAY).toBe(150)
  })

  it('ignores a clipboard rejection and still shows copied', async () => {
    // Legacy had no catch, and the state still changes.
    writeText.mockRejectedValue(new Error('denied'))
    const { state, copy } = useCopyText(() => 'x')
    await expect(copy()).resolves.toBeUndefined()
    expect(state.value).toBe('copied')
  })

  it('stays idle without a clipboard API', async () => {
    // Legacy threw before $nextTick, so the label kept "Click to copy"
    vi.stubGlobal('navigator', {})
    const { state, copy } = useCopyText(() => 'x')
    await expect(copy()).resolves.toBeUndefined()
    expect(state.value).toBe('copy')
  })

  it('dispose cancels a pending reset', async () => {
    const { state, copy, reset, dispose } = useCopyText(() => 'x')
    await copy()
    reset()
    dispose()
    vi.advanceTimersByTime(500)
    expect(state.value).toBe('copied')
  })
})
