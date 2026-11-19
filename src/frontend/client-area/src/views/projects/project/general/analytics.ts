import type { AnalyticsPeriod, ChartSeries, NormalizedSeries } from '@/entities/project/instance-analytics'
import type { BandwidthReport, ReportVisits } from '@/entities/project/instance-reporting.api'
import { deltaPercent, normalizeSeries } from '@/entities/project/instance-analytics'
import { formatBytes } from '@/shared/format/format-bytes'

// The analytics figures of the General cards: date normalizing, visitors, bandwidth, the time and byte formatting and the session tick.
// The period, series and chart helpers shared with Monitoring live in `@/entities/project/instance-analytics`.

/** One card's figures: the chart series, the value shown in the tab, and the delta (`null`: no indicator, as legacy's default). */
export interface AnalyticsMetric {
  series: NormalizedSeries
  current: string | number
  delta: string | null
}

/** The unit labels of `secondsToHms` (`general.time.h`, `general.time.min`, `general.time.sec`). */
export interface TimeUnits {
  h: string
  min: string
  sec: string
}

/**
 * Only the non-zero parts are written, so 0 seconds is an empty string. Each non-empty part but the last is
 * followed by a space.
 */
export function secondsToHms (value: number | string, units: TimeUnits): string {
  const total = Number(value)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor((total % 3600) % 60)
  const hDisplay = h > 0 ? `${h}${units.h} ` : ''
  const mDisplay = m > 0 ? `${m}${units.min} ` : ''
  const sDisplay = s > 0 ? `${s}${units.sec}` : ''
  return hDisplay + mDisplay + sDisplay
}

/**
 * Y-axis tick of the session chart: hours, minutes and seconds in the short English form,
 * as legacy writes it (literal `h m s`, not translated).
 */
export function formatSessionTick (value: number): string {
  const secNum = Number.parseInt(String(value), 10)
  const hours = Math.floor(secNum / 3600)
  const minutes = Math.floor((secNum - hours * 3600) / 60)
  const seconds = secNum - hours * 3600 - minutes * 60
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

/** The unit labels of `formatBandwidth` in legacy order (`general.size.b` to `general.size.yb`). */
export interface SizeUnits {
  b: string
  kb: string
  mb: string
  gb: string
  tb: string
  pb: string
  eb: string
  zb: string
  yb: string
}

export function sizeUnitList (units: SizeUnits): string[] {
  return [units.b, units.kb, units.mb, units.gb, units.tb, units.pb, units.eb, units.zb, units.yb]
}

/**
 * The bandwidth total as the card shows it (units from `general.size.*`): base 1024, up to two
 * decimals. Zero is `0 <b>`. A value below one byte has a negative unit index in legacy (`undefined` unit); here it reads as bytes.
 */
export function formatBandwidth (bytes: number, units: readonly string[]): string {
  if (bytes === 0) {
    return `0 ${units[0]}`
  }
  const k = 1024
  const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${units[i]}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A report key as a UTC date: `YYYY-MM-DD` as is, otherwise any date string `Date` reads. The zone is fixed so labels do not move. */
function parseReportDate (key: string): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(key)
  if (day) {
    return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])))
  }
  const parsed = new Date(key)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * The x-axis label of a report key: `MMM DD`, or `MMM YYYY` for the last year. The month is the English
 * short name in UTC, so a key reads the same in every zone. An unreadable key is shown as it is.
 */
export function axisLabel (key: string, period: AnalyticsPeriod): string {
  const date = parseReportDate(key)
  if (!date) {
    return key
  }
  const month = MONTHS[date.getUTCMonth()]
  if (period === 'last-year') {
    return `${month} ${date.getUTCFullYear()}`
  }
  return `${month} ${String(date.getUTCDate()).padStart(2, '0')}`
}

/** The chart series of a `records` map in key order. Missing records give an empty series. */
export function seriesFromRecords (
  records: Record<string, number | null> | null | undefined,
  period: AnalyticsPeriod,
): ChartSeries {
  const entries = Object.entries(records ?? {})
  return {
    labels: entries.map(([key]) => axisLabel(key, period)),
    datasets: [entries.map(([, amount]) => amount)],
  }
}

/** A visits metric (`visits` or `visits_length`); `format` turns the period total into the shown value (session time: `secondsToHms`). */
export function visitsMetric (
  visits: ReportVisits | null | undefined,
  period: AnalyticsPeriod,
  format: (total: number) => string | number = total => total,
): AnalyticsMetric {
  if (!visits) {
    return { series: normalizeSeries(seriesFromRecords(null, period)), current: 0, delta: null }
  }
  const total = visits.total ?? 0
  return {
    series: normalizeSeries(seriesFromRecords(visits.records, period)),
    current: format(total),
    delta: deltaPercent(total, visits.previous_total),
  }
}

/** The bandwidth metric: the chart series and the total in units. No delta, as legacy. */
export function bandwidthMetric (
  report: BandwidthReport | null | undefined,
  period: AnalyticsPeriod,
  units: readonly string[],
): { series: NormalizedSeries, current: string | null } {
  if (!report) {
    return { series: normalizeSeries(seriesFromRecords(null, period)), current: null }
  }
  return {
    series: normalizeSeries(seriesFromRecords(report.records, period)),
    current: formatBandwidth(report.total ?? 0, units),
  }
}

/** The bandwidth y formatter: the shared port of legacy `Helper.formatBytes`. */
export function formatBandwidthTick (value: number): string {
  return formatBytes(value)
}
