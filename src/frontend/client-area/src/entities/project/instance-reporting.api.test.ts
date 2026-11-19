import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getBandwidthReport, getVisitorsReport, getVisitsBreakdown, type VisitsBreakdownMetric } from './instance-reporting.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn() },
}))

const METRIC_PATHS: Array<[VisitsBreakdownMetric, string]> = [
  ['page', 'visits-by-page'],
  ['country', 'visits-by-country'],
  ['continent', 'visits-by-continent'],
  ['region', 'visits-by-region'],
  ['referrer', 'visits-by-referrer'],
  ['device', 'visits-by-device'],
  ['device-brand', 'visits-by-device-brand'],
  ['device-os', 'visits-by-device-os'],
  ['device-browser', 'visits-by-device-browser'],
]

describe('instance-reporting.api getVisitorsReport and getBandwidthReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests the visitors report and returns data.data', async () => {
    const report = { visits: { records: { '2026-10-01': 3 }, total: 3, previous_total: 1 } }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: report } })

    expect(await getVisitorsReport(9, 'last-week')).toBe(report)
    expect(api.get).toHaveBeenCalledWith('/instances/9/reporting/visitors/last-week')
  })

  it('requests the bandwidth report and returns data.data', async () => {
    const report = { records: { '2026-10-01': 1024 }, total: 1024 }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: report } })

    expect(await getBandwidthReport(9, 'last-month')).toBe(report)
    expect(api.get).toHaveBeenCalledWith('/instances/9/reporting/bandwidth/last-month')
  })

  it('reads a missing data.data as an empty report', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} })

    expect(await getVisitorsReport(9, 'last-year')).toEqual({})
    expect(await getBandwidthReport(9, 'last-year')).toEqual({})
  })

  it('reads the data: [] answer of an instance without a reporting provider as an empty report', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } })

    expect(await getVisitorsReport(9, 'last-week')).toEqual({})
    expect(await getBandwidthReport(9, 'last-week')).toEqual({})
  })
})

describe('instance-reporting.api getVisitsBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(METRIC_PATHS)('requests the %s breakdown under %s', async (metric, segment) => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })

    await getVisitsBreakdown(9, metric, 'last-week')

    expect(api.get).toHaveBeenCalledWith(`/instances/9/reporting/${segment}/last-week`)
  })

  it('returns the raw data.data list', async () => {
    const records = [{ label: 'Poland', visits: 4, code: 'PL' }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: records } })

    expect(await getVisitsBreakdown(9, 'country', 'last-month')).toBe(records)
  })

  it('returns data.data as it is when the answer has no data (undefined)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })

    expect(await getVisitsBreakdown(9, 'page', 'last-year')).toBeUndefined()
  })

  it('lets a failed request reject, so the view can decide what to show', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'))

    await expect(getVisitsBreakdown(9, 'page', 'last-week')).rejects.toThrow('boom')
  })
})
