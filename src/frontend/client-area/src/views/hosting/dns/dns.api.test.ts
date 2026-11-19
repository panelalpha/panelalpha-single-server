import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  createRecord,
  deleteRecord,
  listRecords,
  listRecordTypes,
  listZones,
  toggleProxy,
  updateRecord,
} from './dns.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('dns.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists the zones of the service and returns data.data', async () => {
    const zones = [{ id: 5, name: 'example.com' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: zones } })

    await expect(listZones(1)).resolves.toEqual(zones)
    expect(api.get).toHaveBeenCalledWith('/services/1/dns/zones')
  })

  it('lists the records of a zone and returns the body with meta', async () => {
    const body = { data: [{ name: 'example.com', ttl: 1, type: 'A', content: '1.2.3.4' }], meta: { allow_proxy: true } }
    vi.mocked(api.get).mockResolvedValue({ data: body })

    await expect(listRecords(1, 5)).resolves.toEqual(body)
    expect(api.get).toHaveBeenCalledWith('/services/1/dns/zones/5/records')
  })

  it('lists the record types of the service and returns data.data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: ['A', 'TXT'] } })

    await expect(listRecordTypes(1)).resolves.toEqual(['A', 'TXT'])
    expect(api.get).toHaveBeenCalledWith('/services/1/dns/record-types')
  })

  it('creates a record with POST on the collection of the zone', async () => {
    const body = { name: 'www', type: 'A', content: '1.2.3.4', ttl: 300 }
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })

    await createRecord(1, 5, body)

    expect(api.post).toHaveBeenCalledWith('/services/1/dns/zones/5/records', body)
  })

  it('updates a record with PUT on its id and sends the whole row', async () => {
    const body = { name: 'www', type: 'A', content: '1.2.3.4', ttl: 300, line: 7 }
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })

    await updateRecord(1, 5, 7, body)

    expect(api.put).toHaveBeenCalledWith('/services/1/dns/zones/5/records/7', body)
  })

  it('deletes a record on the path it is given, without encoding', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await deleteRecord(1, 5, 'example.com?type=TXT')

    expect(api.delete).toHaveBeenCalledWith('/services/1/dns/zones/5/records/example.com?type=TXT')
  })

  it('toggles the proxy with PATCH on the line and returns the new state', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { data: { proxied: true } } })

    await expect(toggleProxy(1, 5, 7)).resolves.toBe(true)
    expect(api.patch).toHaveBeenCalledWith('/services/1/dns/zones/5/records/7/toggle-proxy')
  })

  it('rejects when the request fails, so the caller can show the error', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Server Error'))

    await expect(listZones(1)).rejects.toThrow('Server Error')
  })
})
