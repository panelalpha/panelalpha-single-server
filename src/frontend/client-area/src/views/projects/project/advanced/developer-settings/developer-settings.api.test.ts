import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import {
  clearPhpVersionCache,
  getPhpSettings,
  getPhpVersion,
  getPhpVersions,
  updatePhpSettings,
  updatePhpVersion,
} from './developer-settings.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}))

describe('developer-settings.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  it('getPhpVersion reads the domain version through the cache and returns data.data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { label: 'PHP 8.3', value: '8.3' } } })

    await expect(getPhpVersion(11, 'a.test')).resolves.toEqual({ label: 'PHP 8.3', value: '8.3' })
    await getPhpVersion(11, 'a.test')
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/domains/a.test/php-version', undefined)
  })

  it('getPhpVersion answers null when the domain has no version', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: null } })

    await expect(getPhpVersion(11, 'a.test')).resolves.toBeNull()
  })

  it('getPhpVersion turns the bare string of the Engine-backed panel into a label and a value', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: '8.4' } })

    await expect(getPhpVersion(11, 'a.test')).resolves.toEqual({ label: '8.4', value: '8.4' })
  })

  it('getPhpVersion answers null for an empty string and for an object without a version', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: '' } })
    await expect(getPhpVersion(11, 'a.test')).resolves.toBeNull()

    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { label: null } } })
    await expect(getPhpVersion(11, 'b.test')).resolves.toBeNull()
  })

  it('getPhpVersion falls back to the value when the object has no label', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { value: '8.2' } } })

    await expect(getPhpVersion(11, 'a.test')).resolves.toEqual({ label: '8.2', value: '8.2' })
  })

  it('getPhpVersions turns a list of strings into labels and values', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: ['8.4', '8.3'] } })

    await expect(getPhpVersions(11)).resolves.toEqual([
      { label: '8.4', value: '8.4' },
      { label: '8.3', value: '8.3' },
    ])
  })

  it('clearPhpVersionCache drops the cached read of that domain only', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { label: 'PHP 8.3', value: '8.3' } } })
    await getPhpVersion(11, 'a.test')
    await getPhpVersion(11, 'b.test')

    clearPhpVersionCache(11, 'a.test')
    await getPhpVersion(11, 'a.test')
    await getPhpVersion(11, 'b.test')
    expect(api.get).toHaveBeenCalledTimes(3)
  })

  it('getPhpVersions reads the list through the cache and returns data.data', async () => {
    const versions = [{ label: 'PHP 8.2', value: '8.2' }, { label: 'PHP 8.3', value: '8.3' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: versions } })

    await expect(getPhpVersions(11)).resolves.toEqual(versions)
    await getPhpVersions(11)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/php-versions', undefined)
  })

  it('updatePhpVersion sends a PUT with php_version in the body', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await updatePhpVersion(11, 'a.test', '8.3')
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/domains/a.test/php-version', { php_version: '8.3' })
  })

  it('getPhpSettings reads the settings without the cache and returns the body', async () => {
    const body = {
      configurable: true,
      custom_directives: false,
      directives: [{ directive: 'memory_limit', value: '256M' }],
      suggested_directives: [{ directive: 'upload_max_filesize', type: 'select', options: ['2M', '8M'] }],
      modifiable_directives_list: true,
    }
    vi.mocked(api.get).mockResolvedValue({ data: body })

    await expect(getPhpSettings(11, 'a.test')).resolves.toEqual(body)
    await getPhpSettings(11, 'a.test')
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/domains/a.test/php-settings')
  })

  it('updatePhpSettings sends a PUT with the whole array of rows as the body', async () => {
    const rows = [
      { directive: 'memory_limit', value: '512M', editing: false, type: 'text', options: [] },
      { directive: 'display_errors', value: 'On', editing: true, type: 'select', options: ['On', 'Off'] },
    ]
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await updatePhpSettings(11, 'a.test', rows)
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/domains/a.test/php-settings', rows)
  })
})
