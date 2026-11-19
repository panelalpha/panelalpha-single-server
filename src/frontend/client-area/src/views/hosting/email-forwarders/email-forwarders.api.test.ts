import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { createEmailForwarder, deleteEmailForwarder, listEmailForwarders } from './email-forwarders.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  apiBaseUrl: () => '/api',
}))

describe('email-forwarders.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listEmailForwarders reads the forwarders of one email domain and returns the data array', async () => {
    const forwarders = [{ email: 'info@example.com', forward_to: 'me@mail.com', updated_at: null }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: forwarders } })

    await expect(listEmailForwarders(7, 3)).resolves.toEqual(forwarders)
    expect(api.get).toHaveBeenCalledWith('/services/7/email/domains/3/forwarders')
  })

  it('createEmailForwarder posts the form values to the forwarders of the domain', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    const body = { email: 'info', domain: 'example.com', destination: 'me@mail.com' }

    await expect(createEmailForwarder(7, 3, body)).resolves.toBeUndefined()
    expect(api.post).toHaveBeenCalledWith('/services/7/email/domains/3/forwarders', body)
  })

  it('deleteEmailForwarder puts the address unencoded in the path and the encoded destination in the query', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: {} })

    await expect(deleteEmailForwarder(7, 3, 'info@example.com', 'me+tag@mail.com')).resolves.toBeUndefined()
    expect(api.delete).toHaveBeenCalledWith('/services/7/email/domains/3/forwarders/info@example.com?forward_to=me%2Btag%40mail.com')
  })
})
