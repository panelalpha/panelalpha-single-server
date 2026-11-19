import { describe, expect, it, vi } from 'vitest'
import { FREE_HUB_RETURN_KEY } from '@/entities/hub/hub-return'
import { resolveHubConnectedRedirect } from './hub-connected-redirect'

function storageWith (value: string | null) {
  return { getItem: vi.fn(() => value), removeItem: vi.fn() }
}

describe('resolveHubConnectedRedirect', () => {
  const query = { state: 'abc', result: 'ok' }

  it('goes to /settings and drops the key when the pairing started from Settings', () => {
    const storage = storageWith('settings')
    expect(resolveHubConnectedRedirect(query, storage)).toEqual({ path: '/settings', query })
    expect(storage.removeItem).toHaveBeenCalledWith(FREE_HUB_RETURN_KEY)
  })

  it('goes to /wizard/panelalpha-connect and leaves the key for any other value', () => {
    const storage = storageWith('other')
    expect(resolveHubConnectedRedirect(query, storage)).toEqual({ path: '/wizard/panelalpha-connect', query })
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('goes to /wizard/panelalpha-connect when the key is missing', () => {
    expect(resolveHubConnectedRedirect(query, storageWith(null)).path).toBe('/wizard/panelalpha-connect')
  })

  it('goes to /wizard/panelalpha-connect without storage', () => {
    expect(resolveHubConnectedRedirect(query, null).path).toBe('/wizard/panelalpha-connect')
  })

  it('goes to /wizard/panelalpha-connect when the storage throws', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      removeItem: vi.fn(),
    }
    expect(resolveHubConnectedRedirect(query, storage).path).toBe('/wizard/panelalpha-connect')
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('copies state and result as they are, also when they are missing', () => {
    expect(resolveHubConnectedRedirect({}, null).query).toEqual({ state: undefined, result: undefined })
    expect(resolveHubConnectedRedirect({ state: 's' }, null).query).toEqual({ state: 's', result: undefined })
  })
})
