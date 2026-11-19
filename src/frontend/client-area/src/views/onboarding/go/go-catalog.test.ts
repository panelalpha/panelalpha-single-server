import type * as GoCatalogApi from './go-catalog.api'
import type { GoApp } from './go-catalog.api'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectiveQuery, GO_SEARCH_DEBOUNCE_MS, useGoCatalog } from './go-catalog'
import { getGoApp, getGoApps, getGoCategories, getGoStatus, replacesLine, starsLabel, starsTitle } from './go-catalog.api'

vi.mock('./go-catalog.api', async importOriginal => ({
  ...(await importOriginal<typeof GoCatalogApi>()),
  getGoApp: vi.fn(),
  getGoApps: vi.fn(),
  getGoCategories: vi.fn(),
  getGoStatus: vi.fn(),
}))

function app (slug: string): GoApp {
  return { slug, name: slug[0]?.toUpperCase() + slug.slice(1), tagline: 'An app', categories: ['Notes'] }
}

function page (apps: GoApp[], meta: { current_page?: number, last_page?: number, total?: number } = {}) {
  return { data: apps, meta: { current_page: 1, last_page: 1, total: apps.length, ...meta } }
}

function httpError (status: number): AxiosError {
  const headers = new AxiosHeaders()
  return new AxiosError('failed', 'ERR', undefined, undefined, { status, statusText: '', headers, config: { headers }, data: {} })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(getGoStatus).mockReset().mockResolvedValue({ connected: true, available: true, plan: 'free' })
  vi.mocked(getGoApps).mockReset().mockResolvedValue(page([app('memos'), app('joplin')]))
  vi.mocked(getGoApp).mockReset()
  vi.mocked(getGoCategories).mockReset().mockResolvedValue([{ name: 'Notes', apps: 2 }, { name: 'Media', apps: 1 }])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('starsLabel and starsTitle', () => {
  it('shortens a star count the way Go shows it', () => {
    expect(starsLabel(950)).toBe('950')
    expect(starsLabel(1000)).toBe('1k')
    expect(starsLabel(1250)).toBe('1.3k')
    expect(starsLabel(41_250)).toBe('41k')
    expect(starsLabel(1_520_000)).toBe('1.5M')
    expect(starsLabel(null)).toBeNull()
    expect(starsLabel(undefined)).toBeNull()
  })

  it('names the full count, the host and the day Go read it', () => {
    const t = (key: string, options?: Record<string, unknown>) => `${key} ${JSON.stringify(options)}`

    expect(starsTitle({ stars: 41_250, stars_updated_at: '2026-11-17T09:30:00Z', repository: 'https://github.com/louislam/uptime-kuma' }, t))
      .toBe(String.raw`heading.onboarding.goCatalog.starsAsOf {"stars":"heading.onboarding.goCatalog.starsOnHost {\"count\":\"41,250\",\"host\":\"GitHub\"}","date":"2026-11-17"}`)
    expect(starsTitle({ stars: 12, stars_updated_at: null, repository: 'https://gitlab.com/a/b' }, t))
      .toBe('heading.onboarding.goCatalog.stars {"count":"12"}')
    expect(starsTitle({ stars: null, repository: 'https://github.com/a/b' }, t)).toBeUndefined()
  })
})

describe('replacesLine', () => {
  it('names the first two products, or the one the search found', () => {
    const app = { replaces: ['Google Keep', 'Notion', 'Evernote'] }

    expect(replacesLine(app, '')).toEqual({ names: 'Google Keep, Notion', match: false })
    expect(replacesLine(app, 'ever')).toEqual({ names: 'Evernote', match: true })
    expect(replacesLine(app, 'memos')).toEqual({ names: 'Google Keep, Notion', match: false })
    expect(replacesLine({ replaces: [] }, '')).toBeNull()
    expect(replacesLine({}, 'notion')).toBeNull()
  })
})

describe('effectiveQuery', () => {
  it('asks Go from two characters on, trimmed', () => {
    expect(effectiveQuery(' m ')).toBe('')
    expect(effectiveQuery(' me ')).toBe('me')
  })
})

describe('useGoCatalog', () => {
  it('loads the first page on open', async () => {
    const catalog = useGoCatalog()

    await catalog.open()

    expect(catalog.failure.value).toBeNull()
    expect(catalog.apps.value.map(item => item.slug)).toEqual(['memos', 'joplin'])
    expect(getGoApps).toHaveBeenCalledWith({ q: '', category: null, sort: 'tried', page: 1 })
  })

  it('shows the Hub prompt when the panel is not paired, and asks Go nothing', async () => {
    vi.mocked(getGoStatus).mockResolvedValue({ connected: false, available: false })
    const catalog = useGoCatalog()

    await catalog.open()

    expect(catalog.failure.value).toBe('hub_not_connected')
    expect(getGoApps).not.toHaveBeenCalled()
  })

  it('says the catalog is unavailable when Go does not answer', async () => {
    vi.mocked(getGoStatus).mockResolvedValue({ connected: true, available: false })
    const catalog = useGoCatalog()

    await catalog.open()

    expect(catalog.failure.value).toBe('go_unavailable')
  })

  it('searches once the typing stops, from two characters on', async () => {
    const catalog = useGoCatalog()
    await catalog.open()
    vi.mocked(getGoApps).mockClear().mockResolvedValue(page([app('memos')]))

    catalog.searchTerm.value = 'n'
    await vi.advanceTimersByTimeAsync(GO_SEARCH_DEBOUNCE_MS)
    expect(getGoApps).not.toHaveBeenCalled()

    catalog.searchTerm.value = 'no'
    await vi.advanceTimersByTimeAsync(GO_SEARCH_DEBOUNCE_MS - 1)
    catalog.searchTerm.value = 'notion'
    await vi.advanceTimersByTimeAsync(GO_SEARCH_DEBOUNCE_MS)

    expect(getGoApps).toHaveBeenCalledTimes(1)
    expect(getGoApps).toHaveBeenCalledWith({ q: 'notion', category: null, sort: 'tried', page: 1 })
    expect(catalog.apps.value.map(item => item.slug)).toEqual(['memos'])
    expect(catalog.total.value).toBe(1)
  })

  it('drops the answer of an older search', async () => {
    const catalog = useGoCatalog()
    await catalog.open()
    let resolveSlow: (value: ReturnType<typeof page>) => void = () => {}
    vi.mocked(getGoApps)
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveSlow = resolve
      }))
      .mockResolvedValueOnce(page([app('immich')]))

    catalog.searchTerm.value = 'notes'
    await vi.advanceTimersByTimeAsync(GO_SEARCH_DEBOUNCE_MS)
    catalog.searchTerm.value = 'photos'
    await vi.advanceTimersByTimeAsync(GO_SEARCH_DEBOUNCE_MS)
    resolveSlow(page([app('memos')]))
    await vi.runAllTimersAsync()

    expect(catalog.apps.value.map(item => item.slug)).toEqual(['immich'])
  })

  it('loads the categories of the sidebar with the first page', async () => {
    const catalog = useGoCatalog()

    await catalog.open()
    await vi.runAllTimersAsync()

    expect(catalog.categories.value).toEqual([{ name: 'Notes', apps: 2 }, { name: 'Media', apps: 1 }])
  })

  it('keeps the catalog when the categories cannot be read', async () => {
    vi.mocked(getGoCategories).mockRejectedValue(new Error('down'))
    const catalog = useGoCatalog()

    await catalog.open()
    await vi.runAllTimersAsync()

    expect(catalog.failure.value).toBeNull()
    expect(catalog.categories.value).toEqual([])
    expect(catalog.apps.value).toHaveLength(2)
  })

  it('lists one category with the search kept, and clears both', async () => {
    const catalog = useGoCatalog()
    await catalog.open()
    catalog.searchTerm.value = 'notes'
    await vi.advanceTimersByTimeAsync(GO_SEARCH_DEBOUNCE_MS)

    catalog.selectCategory('Media')
    await vi.runAllTimersAsync()

    expect(getGoApps).toHaveBeenLastCalledWith({ q: 'notes', category: 'Media', sort: 'tried', page: 1 })

    catalog.clearFilters()
    await vi.runAllTimersAsync()

    expect(catalog.category.value).toBeNull()
    expect(catalog.searchTerm.value).toBe('')
    expect(getGoApps).toHaveBeenLastCalledWith({ q: '', category: null, sort: 'tried', page: 1 })
  })

  it('sorts by the menu, shows "Latest" by verification day, and leaves "Latest" for a sort picked there', async () => {
    const catalog = useGoCatalog()
    await catalog.open()

    catalog.selectSort('stars')
    await vi.runAllTimersAsync()
    expect(getGoApps).toHaveBeenLastCalledWith({ q: '', category: null, sort: 'stars', page: 1 })

    catalog.selectCategory('Notes')
    catalog.showLatest()
    await vi.runAllTimersAsync()
    expect(catalog.category.value).toBeNull()
    expect(getGoApps).toHaveBeenLastCalledWith({ q: '', category: null, sort: 'verified', page: 1 })

    catalog.selectSort('name')
    await vi.runAllTimersAsync()
    expect(catalog.latest.value).toBe(false)
    expect(getGoApps).toHaveBeenLastCalledWith({ q: '', category: null, sort: 'name', page: 1 })
  })

  it('appends the next page without repeating an app', async () => {
    vi.mocked(getGoApps).mockResolvedValueOnce(page([app('memos'), app('joplin')], { last_page: 2, total: 3 }))
    const catalog = useGoCatalog()
    await catalog.open()
    expect(catalog.hasMore.value).toBe(true)
    vi.mocked(getGoApps).mockResolvedValueOnce(page([app('joplin'), app('outline')], { current_page: 2, last_page: 2, total: 3 }))

    await catalog.loadMore()

    expect(catalog.apps.value.map(item => item.slug)).toEqual(['memos', 'joplin', 'outline'])
    expect(catalog.hasMore.value).toBe(false)
    expect(getGoApps).toHaveBeenLastCalledWith({ q: '', category: null, sort: 'tried', page: 2 })
  })

  it('opens an app with its list fields at once, then its details from Go', async () => {
    const catalog = useGoCatalog()
    await catalog.open()
    vi.mocked(getGoApp).mockResolvedValue({ ...app('memos'), description: 'Notes.', install: { source: 'git', git_repo: 'https://github.com/usememos/memos', git_branch: null } })

    const opened = catalog.openApp(app('memos'))
    expect(catalog.selected.value?.slug).toBe('memos')
    expect(catalog.loadingDetails.value).toBe(true)
    await opened

    expect(catalog.selected.value?.install?.git_repo).toBe('https://github.com/usememos/memos')
    expect(catalog.loadingDetails.value).toBe(false)

    catalog.closeApp()
    expect(catalog.selected.value).toBeNull()
  })

  it('marks the details failed when Go has no such app, and shows the Hub prompt when the pairing is gone', async () => {
    const catalog = useGoCatalog()
    await catalog.open()

    vi.mocked(getGoApp).mockRejectedValueOnce(httpError(404))
    await catalog.openApp(app('memos'))
    expect(catalog.detailsFailed.value).toBe(true)
    expect(catalog.failure.value).toBeNull()

    vi.mocked(getGoApp).mockRejectedValueOnce(httpError(409))
    await catalog.openApp(app('memos'))
    expect(catalog.failure.value).toBe('hub_not_connected')
  })
})
