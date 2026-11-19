import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { runSessionClearedHandlers } from '@/shared/session/session-reset'
import {
  getDetectedCertificate,
  getDetectedCertificateByUrl,
  getInstalledCertificate,
  installCertificate,
  listSslOffers,
  orderCertificate,
  removeCertificate,
  resetCertificateCache,
  resetSslCaches,
  retryCertificate,
} from './ssl-certificates.api'

vi.mock('@/shared/api/client', () => ({ api: { delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

const cert = { self_signed: false, name_match: true, issuer_name: 'Lets Encrypt' }

describe('ssl-certificates.api', () => {
  beforeEach(() => {
    resetSslCaches()
    vi.mocked(api.get).mockReset()
    vi.mocked(api.delete).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks the installed and the detected endpoint of the account for the domain', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })

    await expect(getInstalledCertificate(11, 'a.test')).resolves.toEqual(cert)
    await expect(getDetectedCertificate(11, 'a.test')).resolves.toEqual(cert)

    expect(api.get).toHaveBeenNthCalledWith(1, '/server-accounts/11/ssl/certificate/installed?domain=a.test')
    expect(api.get).toHaveBeenNthCalledWith(2, '/server-accounts/11/ssl/certificate/detected?domain=a.test')
  })

  it('caches a certificate per account and domain', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })

    await getInstalledCertificate(11, 'a.test')
    await getInstalledCertificate(11, 'a.test')
    expect(api.get).toHaveBeenCalledTimes(1)

    await getInstalledCertificate(12, 'a.test')
    await getInstalledCertificate(11, 'b.test')
    expect(api.get).toHaveBeenCalledTimes(3)
  })

  it('forgets the cached certificates when the session is cleared (sign-out, 401)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })

    await getInstalledCertificate(11, 'a.test')
    runSessionClearedHandlers()
    await getInstalledCertificate(11, 'a.test')

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('does not cache a null answer', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: null } })

    await expect(getInstalledCertificate(11, 'a.test')).resolves.toBeNull()
    await getInstalledCertificate(11, 'a.test')

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('keeps the installed and the detected certificates apart', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })

    await getInstalledCertificate(11, 'a.test')
    await getDetectedCertificate(11, 'a.test')

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('skipCache asks the detected endpoint again', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })

    await getDetectedCertificate(11, 'a.test')
    await getDetectedCertificate(11, 'a.test', true)

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('resetCertificateCache forgets the certificates of that account only', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })
    await getInstalledCertificate(11, 'a.test')
    await getInstalledCertificate(12, 'a.test')

    resetCertificateCache(11)
    await getInstalledCertificate(11, 'a.test')
    await getInstalledCertificate(12, 'a.test')

    expect(api.get).toHaveBeenCalledTimes(3)
  })

  it('removes the certificate of the account and domain and answers the one the domain carries now', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { data: cert } })

    await expect(removeCertificate(11, 'a.test')).resolves.toEqual(cert)
    expect(api.delete).toHaveBeenCalledWith('/server-accounts/11/ssl/certificates/installed?domain=a.test')
  })

  it('answers null when the Engine gives the domain no certificate back', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { data: null } })

    await expect(removeCertificate(11, 'a.test')).resolves.toBeNull()
  })

  it('rejects when the request fails, so the caller can leave the spinner on', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'))

    await expect(getInstalledCertificate(11, 'a.test')).rejects.toThrow('boom')
  })

  it('caches the ssl offers for 36000 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'))
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: 1, slug: 'lets' }] } })

    await expect(listSslOffers()).resolves.toEqual([{ id: 1, slug: 'lets' }])
    vi.setSystemTime(new Date('2026-10-07T19:59:59Z'))
    await listSslOffers()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/ssl-offer')

    vi.setSystemTime(new Date('2026-10-07T20:00:01Z'))
    await listSslOffers()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('asks the offers again after a failed request', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'))
    await expect(listSslOffers()).rejects.toThrow('boom')

    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ id: 1, slug: 'lets' }] } })
    await expect(listSslOffers()).resolves.toEqual([{ id: 1, slug: 'lets' }])
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('encodes the domain in the query', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })

    await getInstalledCertificate(11, 'a.test&x=1')

    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/ssl/certificate/installed?domain=a.test%26x%3D1')
  })

  it('orders, installs and retries a certificate on the account endpoints', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await orderCertificate(11, 'a.test', 3)
    await installCertificate(11, { domain: 'a.test', certificate: 'CRT', key: 'KEY', cabundle: '' })
    await retryCertificate(11, 'a.test')

    expect(api.post).toHaveBeenNthCalledWith(1, '/server-accounts/11/ssl/certificates/order', { domain: 'a.test', provider_id: 3 })
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/ssl/certificates/install', {
      domain: 'a.test',
      certificate: 'CRT',
      key: 'KEY',
      cabundle: '',
      certificate_id: null,
    })
    expect(api.post).toHaveBeenNthCalledWith(2, '/server-accounts/11/ssl/certificates/retry', { domain: 'a.test' })
  })

  it('asks the detected-by-url endpoint of the instance, without a cache', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: cert } })

    await expect(getDetectedCertificateByUrl(7)).resolves.toEqual(cert)
    await getDetectedCertificateByUrl(7)

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith('/instances/7/ssl/certificate/detected-by-url')
  })

  it('answers null when the endpoint sends no certificate', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: null } })

    await expect(getDetectedCertificateByUrl(7)).resolves.toBeNull()
  })
})
