import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveARecord } from '@/entities/domain/dns-google'
import { hasARecord, shouldOpenSsoModal } from './phpmyadmin-sso'

vi.mock('@/entities/domain/dns-google', () => ({ resolveARecord: vi.fn() }))

describe('hasARecord', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('is false for an empty host, without a lookup', async () => {
    await expect(hasARecord('')).resolves.toBe(false)
    expect(resolveARecord).not.toHaveBeenCalled()
  })

  it('is true when the host has an A record', async () => {
    vi.mocked(resolveARecord).mockResolvedValueOnce('192.0.2.10')
    await expect(hasARecord('example.com')).resolves.toBe(true)
    expect(resolveARecord).toHaveBeenCalledTimes(1)
    expect(resolveARecord).toHaveBeenCalledWith('example.com')
  })

  it('is false when the host has no A record and it is not a www. host', async () => {
    vi.mocked(resolveARecord).mockResolvedValueOnce(null)
    await expect(hasARecord('example.com')).resolves.toBe(false)
    expect(resolveARecord).toHaveBeenCalledTimes(1)
  })

  it('falls back to the host without www. when the www. host has no A record', async () => {
    vi.mocked(resolveARecord)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('192.0.2.10')
    await expect(hasARecord('www.example.com')).resolves.toBe(true)
    expect(resolveARecord).toHaveBeenNthCalledWith(1, 'www.example.com')
    expect(resolveARecord).toHaveBeenNthCalledWith(2, 'example.com')
  })

  it('is false for a www. host when neither form has an A record', async () => {
    vi.mocked(resolveARecord).mockResolvedValue(null)
    await expect(hasARecord('www.example.com')).resolves.toBe(false)
    expect(resolveARecord).toHaveBeenCalledTimes(2)
  })

  it('is false when the lookup fails', async () => {
    vi.mocked(resolveARecord).mockRejectedValueOnce(new Error('offline'))
    await expect(hasARecord('example.com')).resolves.toBe(false)
  })

  it('is false when the fallback lookup of a www. host fails', async () => {
    vi.mocked(resolveARecord)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('offline'))
    await expect(hasARecord('www.example.com')).resolves.toBe(false)
  })
})

describe('shouldOpenSsoModal', () => {
  const base = { hasARecord: false, isSingleServer: false, previewSiteProviderEnabled: false }

  it('opens the modal when there is no A record and the single server flag is on', () => {
    expect(shouldOpenSsoModal({ ...base, isSingleServer: true })).toBe(true)
  })

  it('opens the modal when there is no A record and the preview site provider is on', () => {
    expect(shouldOpenSsoModal({ ...base, previewSiteProviderEnabled: true })).toBe(true)
  })

  it('does not open the modal when the host has an A record', () => {
    expect(shouldOpenSsoModal({ ...base, hasARecord: true, isSingleServer: true, previewSiteProviderEnabled: true })).toBe(false)
  })

  it('does not open the modal without a flag, even with no A record', () => {
    expect(shouldOpenSsoModal(base)).toBe(false)
  })
})
