import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getBilling, getInvoicePaymentUrl, invoiceDownloadUrl } from './billing.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiBaseUrl: () => 'https://api.test/api',
}))

describe('billing.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('reads the billing details from data.data', async () => {
    const details = { firstname: 'Jan', invoices: [] }
    vi.mocked(api.get).mockResolvedValue({ data: { data: details } })

    await expect(getBilling()).resolves.toEqual(details)
    expect(api.get).toHaveBeenCalledWith('/billing')
  })

  it('passes null through (no billing account)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: null } })

    await expect(getBilling()).resolves.toBeNull()
  })

  it('posts the payment-url request without a body and returns data.data', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: 'https://pay.test/1' } })

    await expect(getInvoicePaymentUrl(12)).resolves.toBe('https://pay.test/1')
    expect(api.post).toHaveBeenCalledWith('/billing/invoices/12/payment-url')
  })

  it('builds the download URL from the API base', () => {
    expect(invoiceDownloadUrl('7')).toBe('https://api.test/api/billing/invoices/7/download')
  })
})
