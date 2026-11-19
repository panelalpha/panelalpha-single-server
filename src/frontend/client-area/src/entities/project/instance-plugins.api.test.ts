import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  activatePlugin,
  deactivatePlugin,
  deletePlugin,
  fetchFeaturedPlugins,
  fetchPlugins,
  installPlugin,
  searchPlugins,
  updatePlugin,
} from './instance-plugins.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

describe('instance-plugins.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gets the installed plugins of the instance and returns the list', async () => {
    const plugins = [{ name: 'akismet', title: 'Akismet' }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: plugins } })
    expect(await fetchPlugins(5)).toBe(plugins)
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/plugins')
  })

  it('returns an empty list when the installed plugins response has no data', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    expect(await fetchPlugins(5)).toEqual([])
  })

  it('gets the featured catalogue plugins', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })
    await fetchFeaturedPlugins(5)
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/plugins/new/featured')
  })

  it('searches the catalogue with the term as one encoded path segment', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })
    await searchPlugins(5, 'seo plugin')
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/plugins/new/search/seo%20plugin')
  })

  it('keeps ?, #, % and / inside the term segment', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })
    await searchPlugins(5, 'a/b?c#d%')
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/plugins/new/search/a%2Fb%3Fc%23d%25')
  })

  it('posts the install of a catalogue plugin by slug', async () => {
    await installPlugin(5, 'akismet')
    expect(api.post).toHaveBeenCalledWith('/instances/5/wordpress/plugins/new/akismet/install')
  })

  it('puts activate, deactivate and update by plugin name', async () => {
    await activatePlugin(5, 'akismet')
    await deactivatePlugin(5, 'akismet')
    await updatePlugin(5, 'akismet')
    expect(api.put).toHaveBeenNthCalledWith(1, '/instances/5/wordpress/plugins/akismet/activate')
    expect(api.put).toHaveBeenNthCalledWith(2, '/instances/5/wordpress/plugins/akismet/deactivate')
    expect(api.put).toHaveBeenNthCalledWith(3, '/instances/5/wordpress/plugins/akismet/update')
  })

  it('deletes a plugin and returns the full list from the response', async () => {
    const remaining = [{ name: 'hello-dolly' }]
    vi.mocked(api.delete).mockResolvedValueOnce({ data: { data: remaining } })
    expect(await deletePlugin(5, 'akismet')).toBe(remaining)
    expect(api.delete).toHaveBeenCalledWith('/instances/5/wordpress/plugins/akismet')
  })
})
