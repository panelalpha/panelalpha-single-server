import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  activateTheme,
  deleteTheme,
  fetchFeaturedThemes,
  fetchThemes,
  installTheme,
  newThemeScreenshotSrc,
  searchThemes,
  themeScreenshotSrc,
  updateTheme,
} from './instance-themes.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
  apiBaseUrl: () => 'https://api.test/api',
}))

describe('instance-themes.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gets the installed themes of the instance and returns the list', async () => {
    const themes = [{ name: 'twentytwentyfour', title: 'Twenty Twenty-Four' }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: themes } })
    expect(await fetchThemes(5)).toBe(themes)
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/themes')
  })

  it('returns an empty list when the installed themes response has no data', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    expect(await fetchThemes(5)).toEqual([])
  })

  it('gets the featured catalogue themes and marks each one as featured', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ id: 1, slug: 'a', name: 'A', version: '1' }] } })
    const featured = await fetchFeaturedThemes(5)
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/themes/new/featured')
    expect(featured).toEqual([{ id: 1, slug: 'a', name: 'A', version: '1', featured: true }])
  })

  it('searches the catalogue with the term as one encoded path segment', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })
    await searchThemes(5, 'dark mode')
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/themes/new/search/dark%20mode')
  })

  it('keeps ?, #, % and / inside the term segment', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })
    await searchThemes(5, 'a/b?c#d%')
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/themes/new/search/a%2Fb%3Fc%23d%25')
  })

  it('resolves an empty search term to an empty list without a request', async () => {
    expect(await searchThemes(5, '')).toEqual([])
    expect(api.get).not.toHaveBeenCalled()
  })

  it('returns search results as they come, without the featured flag', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ id: 2, slug: 'b' }] } })
    expect(await searchThemes(5, 'b')).toEqual([{ id: 2, slug: 'b' }])
  })

  it('posts the install of a catalogue theme by slug', async () => {
    await installTheme(5, 'astra')
    expect(api.post).toHaveBeenCalledWith('/instances/5/wordpress/themes/new/astra/install')
  })

  it('puts activate and update by theme name', async () => {
    await activateTheme(5, 'astra')
    await updateTheme(5, 'astra')
    expect(api.put).toHaveBeenNthCalledWith(1, '/instances/5/wordpress/themes/astra/activate')
    expect(api.put).toHaveBeenNthCalledWith(2, '/instances/5/wordpress/themes/astra/update')
  })

  it('deletes a theme by name', async () => {
    await deleteTheme(5, 'astra')
    expect(api.delete).toHaveBeenCalledWith('/instances/5/wordpress/themes/astra')
  })

  it('encodes the theme name and slug as path segments', async () => {
    await installTheme(5, 'a#b')
    await activateTheme(5, 'a?b')
    await updateTheme(5, 'a/b')
    await deleteTheme(5, 'a%b')
    expect(api.post).toHaveBeenCalledWith('/instances/5/wordpress/themes/new/a%23b/install')
    expect(api.put).toHaveBeenNthCalledWith(1, '/instances/5/wordpress/themes/a%3Fb/activate')
    expect(api.put).toHaveBeenNthCalledWith(2, '/instances/5/wordpress/themes/a%2Fb/update')
    expect(api.delete).toHaveBeenCalledWith('/instances/5/wordpress/themes/a%25b')
    expect(themeScreenshotSrc(5, 'a#b')).toBe('https://api.test/api/instances/5/wordpress/themes/a%23b/screenshot')
  })

  it('builds the installed theme screenshot from the API base and keeps /instances', () => {
    expect(themeScreenshotSrc(5, 'astra')).toBe('https://api.test/api/instances/5/wordpress/themes/astra/screenshot')
  })

  it('builds the screenshot of a custom catalogue theme from the onboarding path', () => {
    expect(newThemeScreenshotSrc({ id: 9, type: 'custom', screenshot_url: 'https://x.test/a.png' }))
      .toBe('https://api.test/api/instances/onboarding/theme/9/screenshot')
  })

  it('uses screenshot_url for a catalogue theme that is not custom', () => {
    expect(newThemeScreenshotSrc({ id: 9, type: 'wporg', screenshot_url: 'https://x.test/a.png' })).toBe('https://x.test/a.png')
    expect(newThemeScreenshotSrc({ id: 9 })).toBeUndefined()
  })
})
