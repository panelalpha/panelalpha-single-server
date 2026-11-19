import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  getSearchEngineIndexing,
  getSslSettings,
  updateSearchEngineIndexing,
  updateSslSettings,
} from './security.api'

vi.mock('@/shared/api/client', () => ({ api: { get: vi.fn(), put: vi.fn() } }))

describe('security.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.put).mockReset()
  })

  it('reads the SSL settings of the domain and returns data.data', async () => {
    const settings = { can_https_redirect: true, force_https_redirect: false, domain_shared_instances: [] }
    vi.mocked(api.get).mockResolvedValue({ data: { data: settings } })

    await expect(getSslSettings(11, 'a.test')).resolves.toEqual(settings)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/ssl/settings/a.test')
  })

  it('puts force_https_redirect to the domain settings and returns the new data.data', async () => {
    const settings = { force_https_redirect: true }
    vi.mocked(api.put).mockResolvedValue({ data: { data: settings } })

    await expect(updateSslSettings(11, 'a.test', true)).resolves.toEqual(settings)
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/ssl/settings/a.test', { force_https_redirect: true })
  })

  it('reads the indexing flag from the body as disabled', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { disabled: true } })

    await expect(getSearchEngineIndexing(7)).resolves.toBe(true)
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/search-engine-indexing')
  })

  it('puts the indexing status to the instance', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await updateSearchEngineIndexing(7, false)
    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/search-engine-indexing', { status: false })
  })
})
