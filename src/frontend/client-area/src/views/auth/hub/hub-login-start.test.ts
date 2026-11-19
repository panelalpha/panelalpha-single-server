import { describe, expect, it, vi } from 'vitest'
import { startHubLogin } from './hub-login-start'

function makeDeps (fetchUrl: () => Promise<string>) {
  return {
    setLoading: vi.fn(),
    setErrors: vi.fn(),
    fetchUrl: vi.fn(fetchUrl),
    navigate: vi.fn(),
  }
}

describe('startHubLogin', () => {
  it('sets loading before the request and navigates without resetting it', async () => {
    const deps = makeDeps(async () => 'https://hub/x')
    const promise = startHubLogin(deps)
    expect(deps.setLoading).toHaveBeenCalledExactlyOnceWith(true)
    expect(deps.navigate).not.toHaveBeenCalled()
    await promise
    expect(deps.navigate).toHaveBeenCalledExactlyOnceWith('https://hub/x')
    expect(deps.setLoading).toHaveBeenCalledTimes(1)
    expect(deps.setErrors).not.toHaveBeenCalled()
  })

  it('replaces errors and clears loading on failure', async () => {
    const deps = makeDeps(async () => {
      throw { response: { data: { message: 'Hub down' } } }
    })
    await startHubLogin(deps)
    expect(deps.setErrors).toHaveBeenCalledExactlyOnceWith(['Hub down'])
    expect(deps.setLoading).toHaveBeenNthCalledWith(1, true)
    expect(deps.setLoading).toHaveBeenLastCalledWith(false)
    expect(deps.navigate).not.toHaveBeenCalled()
  })
})
