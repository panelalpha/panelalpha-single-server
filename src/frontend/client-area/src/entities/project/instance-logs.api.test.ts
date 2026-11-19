import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  getInstanceLogs,
  getPhpLogPage,
  getPhpLogs,
  getWebserverLog,
  getWebserverLogPage,
  getWebserverLogs,
  getWordPressLogs,
  isLogPageConflict,
  phpLogsDownloadUrl,
  webserverLogDownloadUrl,
  wordPressLogsDownloadUrl,
} from './instance-logs.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn() },
  apiBaseUrl: () => '/api',
}))

describe('instance-logs.api getInstanceLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the paged query with the sort and no search term', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [], meta: { total: 0 } } })

    await getInstanceLogs(9, { page: 2, perPage: 10, sortBy: 'date', sortDir: 'desc' })

    expect(api.get).toHaveBeenCalledWith('/instances/9/logs?page=2&per_page=10&sort_by=date&sort_dir=desc')
  })

  it('appends the URL-encoded search term', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [], meta: { total: 0 } } })
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [], meta: { total: 0 } } })

    await getInstanceLogs(9, { page: 1, perPage: 5, sortBy: 'date', sortDir: 'asc', searchTerm: 'cron' })
    await getInstanceLogs(9, { page: 1, perPage: 5, sortBy: 'date', sortDir: 'asc', searchTerm: 'a b&per_page=100#%+' })

    expect(api.get).toHaveBeenNthCalledWith(1, '/instances/9/logs?page=1&per_page=5&sort_by=date&sort_dir=asc&search_term=cron')
    expect(api.get).toHaveBeenNthCalledWith(2,
      '/instances/9/logs?page=1&per_page=5&sort_by=date&sort_dir=asc&search_term=a%20b%26per_page%3D100%23%25%2B')
  })

  it('unwraps the rows and the total from the response', async () => {
    const row = {
      user: { email: 'a@b.c', first_name: 'A', last_name: 'B', role: 'owner' },
      action: 'user.instance.update',
      request_method: 'POST',
      payload: null,
      date: 1_700_000_000,
    }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [row], meta: { total: 42 } } })

    const result = await getInstanceLogs(9, { page: 1, perPage: 10, sortBy: 'date', sortDir: 'desc' })

    expect(result).toEqual({ items: [row], total: 42 })
  })

  it('returns a zero total when the response has no meta', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })

    const result = await getInstanceLogs(9, { page: 1, perPage: 10, sortBy: 'date', sortDir: 'desc' })

    expect(result).toEqual({ items: [], total: 0 })
  })
})

describe('instance-logs.api file and text logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the webserver file list', async () => {
    const files = [{ name: 'error.log', size: 2048, plain_text: true }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: files } })

    expect(await getWebserverLogs(9)).toEqual(files)
    expect(api.get).toHaveBeenCalledWith('/instances/9/webserver-logs')
  })

  it('reads one webserver file content', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: 'line' } })

    expect(await getWebserverLog(9, 'error.log')).toBe('line')
    expect(api.get).toHaveBeenCalledWith('/instances/9/webserver-logs/error.log')
  })

  it('encodes the file name as one path segment', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: 'line' } })

    await getWebserverLog(9, 'a/b?c#d.log')
    expect(api.get).toHaveBeenCalledWith('/instances/9/webserver-logs/a%2Fb%3Fc%23d.log')
  })

  it('reads the WordPress and PHP logs, null when empty', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: null } })
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: 'php' } })

    expect(await getWordPressLogs(9)).toBeNull()
    expect(await getPhpLogs(9)).toBe('php')
    expect(api.get).toHaveBeenNthCalledWith(1, '/instances/9/wordpress/logs')
    expect(api.get).toHaveBeenNthCalledWith(2, '/instances/9/php-logs')
  })
})

describe('instance-logs.api log pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks for the first webserver page without size and returns the page', async () => {
    const page = { lines: ['a', 'b'], page: 1, pages: 3, size: 40_000, window: 16_384 }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: page } })

    expect(await getWebserverLogPage(9, 'access.log', { page: 1 })).toEqual({ lines: ['a', 'b'], page: 1, pages: 3, size: 40_000 })
    expect(api.get).toHaveBeenCalledWith('/instances/9/webserver-logs/access.log?page=1')
  })

  it('sends the frozen size for the next pages and encodes the file name', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { lines: [], page: 2, pages: 3, size: 40_000 } } })

    await getWebserverLogPage(9, 'a/b#c.log', { page: 2, size: 40_000 })
    expect(api.get).toHaveBeenCalledWith('/instances/9/webserver-logs/a%2Fb%23c.log?page=2&size=40000')
  })

  it('sends size 0 but not a null size', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { lines: [], page: 1, pages: 1, size: 0 } } })

    await getPhpLogPage(9, { page: 1, size: 0 })
    await getPhpLogPage(9, { page: 1, size: null })
    expect(api.get).toHaveBeenNthCalledWith(1, '/instances/9/php-logs?page=1&size=0')
    expect(api.get).toHaveBeenNthCalledWith(2, '/instances/9/php-logs?page=1')
  })

  it('reads the PHP page, dind as one page without size', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { lines: ['x'], page: 1, pages: 1, size: null } } })

    expect(await getPhpLogPage(9, { page: 1 })).toEqual({ lines: ['x'], page: 1, pages: 1, size: null })
    expect(api.get).toHaveBeenCalledWith('/instances/9/php-logs?page=1')
  })

  it('turns the text of an API without paging into one page of lines', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: 'first\nsecond\r\nthird\n' } })
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: null } })
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: '' } })

    expect(await getWebserverLogPage(9, 'error.log', { page: 1 }))
      .toEqual({ lines: ['first', 'second', 'third'], page: 1, pages: 1, size: null })
    expect(await getPhpLogPage(9, { page: 1 })).toEqual({ lines: [], page: 1, pages: 1, size: null })
    expect(await getPhpLogPage(9, { page: 1 })).toEqual({ lines: [], page: 1, pages: 1, size: null })
  })

  it('keeps at least one page and fills missing fields', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { lines: null, pages: 0 } } })

    expect(await getPhpLogPage(9, { page: 1 })).toEqual({ lines: [], page: 1, pages: 1, size: null })
  })

  it('rethrows 409 so the view can recognise it', async () => {
    const conflict = { isAxiosError: true, response: { status: 409, data: { message: 'changed' } } }
    vi.mocked(api.get).mockRejectedValueOnce(conflict)

    const error = await getWebserverLogPage(9, 'access.log', { page: 2, size: 10 }).catch((error_: unknown) => error_)
    expect(error).toBe(conflict)
    expect(isLogPageConflict(error)).toBe(true)
  })

  it('does not treat other errors as a page conflict', () => {
    expect(isLogPageConflict({ isAxiosError: true, response: { status: 422 } })).toBe(false)
    expect(isLogPageConflict({ isAxiosError: true })).toBe(false)
    expect(isLogPageConflict({ response: { status: 409 } })).toBe(false)
    expect(isLogPageConflict(new Error('x'))).toBe(false)
    expect(isLogPageConflict(null)).toBe(false)
  })
})

describe('instance-logs.api download URLs', () => {
  it('builds the webserver file download on the instances segment', () => {
    expect(webserverLogDownloadUrl(9, 'error.log')).toBe('/api/instances/9/webserver-logs/error.log/download')
    expect(webserverLogDownloadUrl(9, 'a/b#c.log')).toBe('/api/instances/9/webserver-logs/a%2Fb%23c.log/download')
  })

  it('builds the WordPress and PHP download URLs', () => {
    expect(wordPressLogsDownloadUrl(9)).toBe('/api/instances/9/wordpress/logs/download')
    expect(phpLogsDownloadUrl(9)).toBe('/api/instances/9/php-logs/download')
  })
})
