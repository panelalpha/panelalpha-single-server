import type { AnalyticsPeriod } from '@/entities/project/instance-analytics'
import { api } from '@/shared/api/client'

// The analytics calls of the General screen: both paths start at `/instances/` so the client rewrites
// them to `/projects` under single server. The period is one of `last-week`, `last-month`, `last-year`.
// The Monitoring screen uses the same calls: `getVisitorsReport` for its visitors card.

/** One metric over the period: `records` keyed by date, `total` for the period, `previous_total` for the period before it. */
export interface ReportVisits {
  records?: Record<string, number | null> | null
  total?: number | null
  previous_total?: number | null
}

/** `GET /instances/{id}/reporting/visitors/{period}` -> `{ visits, visits_length }` (the unique visits and the session time). */
export interface VisitorsReport {
  visits?: ReportVisits | null
  visits_length?: ReportVisits | null
}

/** `GET /instances/{id}/reporting/bandwidth/{period}` -> `{ records, total }` (bytes). */
export interface BandwidthReport {
  records?: Record<string, number | null> | null
  total?: number | null
}

/** The nine `visits-by-*` breakdowns of the Monitoring screen. */
export type VisitsBreakdownMetric = 'page' | 'country' | 'continent' | 'region' | 'referrer' | 'device' | 'device-brand' | 'device-os' | 'device-browser'

/** One row of a `visits-by-*` answer. `code` (country) and `country_code` (region) feed the flag image. */
export interface VisitsBreakdownRecord {
  label: string
  visits: number
  code?: string
  country_code?: string
}

// Without a reporting provider the backend answers `data: []` (`ReportingController.php`). Both screens read it like a report with no
// data, so a list or a missing `data` comes back as `{}`.
function reportOrEmpty<T extends object> (report: T | unknown[] | null | undefined): T | Record<string, never> {
  return report && !Array.isArray(report) ? report : {}
}

/** `GET /instances/{id}/reporting/visitors/{period}`. */
export async function getVisitorsReport (id: number, period: AnalyticsPeriod): Promise<VisitorsReport> {
  const { data } = await api.get<{ data: VisitorsReport | unknown[] | null }>(`/instances/${id}/reporting/visitors/${period}`)
  return reportOrEmpty(data.data)
}

/** `GET /instances/{id}/reporting/bandwidth/{period}`. */
export async function getBandwidthReport (id: number, period: AnalyticsPeriod): Promise<BandwidthReport> {
  const { data } = await api.get<{ data: BandwidthReport | unknown[] | null }>(`/instances/${id}/reporting/bandwidth/${period}`)
  return reportOrEmpty(data.data)
}

/**
 * `GET /instances/{id}/reporting/visits-by-{metric}/{period}`, the raw `data.data`. The shape is not checked
 * here: `breakdownItems` in `views/projects/project/monitoring/monitoring.ts` maps it and treats anything but a list as legacy's throw.
 */
export async function getVisitsBreakdown (id: number, metric: VisitsBreakdownMetric, period: AnalyticsPeriod): Promise<unknown> {
  const { data } = await api.get<{ data: unknown }>(`/instances/${id}/reporting/visits-by-${metric}/${period}`)
  return data.data
}
