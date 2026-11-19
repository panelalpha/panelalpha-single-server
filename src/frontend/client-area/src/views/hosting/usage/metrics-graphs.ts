import type { MetricsPeriod, ServerMetricsBucket } from '@/views/hosting/hosting.types'
import type { ApexOptions } from '@/shared/ui/charts/chart-types'
import { escapeHtml } from '@/shared/format/escape-html'
import { formatDate } from '@/shared/time/date-format'
import { COPY_ONE_HOUR, COPY_TWELVE_HOURS } from './usage-copy'

// The period selector and the five graphs (cards in a grid).

type Translate = (key: string, options?: { defaultValue?: string }) => string

export interface PeriodOption {
  title: string
  value: MetricsPeriod
}

export const DEFAULT_PERIOD: MetricsPeriod = 'last-5-minutes'

/** The period options, in legacy order. "Live" is `deployLogs.live` (only the app-lite API has it, so the English word is the fallback). */
export function periodOptions (t: Translate): PeriodOption[] {
  return [
    { title: COPY_ONE_HOUR, value: 'last-hour' },
    { title: COPY_TWELVE_HOURS, value: 'last-12-hours' },
    { title: t('deployLogs.live', { defaultValue: 'Live' }), value: 'last-5-minutes' },
  ]
}

export type GraphKey = 'cpu-percent' | 'disk-throughput' | 'disk-iops' | 'network-traffic' | 'network-pps'

export interface GraphCardConfig {
  key: GraphKey
  /** `heading.hosting.usage.graphs.<titleKey>` */
  titleKey: string
  /** The wide card takes a whole row (CPU). */
  wide: boolean
}

/** The five graph cards, in legacy order. */
export const GRAPHS: GraphCardConfig[] = [
  { key: 'cpu-percent', titleKey: 'cpuUsage', wide: true },
  { key: 'disk-throughput', titleKey: 'diskThroughput', wide: false },
  { key: 'disk-iops', titleKey: 'diskIops', wide: false },
  { key: 'network-traffic', titleKey: 'networkTraffic', wide: false },
  { key: 'network-pps', titleKey: 'networkPps', wide: false },
]

// Chart options and series

export type YFormatter = (value: number | null, t: Translate) => string

export interface GraphSeriesConfig {
  /** `heading.hosting.usage.graphs.<nameKey>` */
  nameKey: string
  /** Field of a metrics bucket */
  field: string
}

export interface GraphConfig {
  series: GraphSeriesConfig[]
  formatY: YFormatter
}

const NO_DATA_KEY = 'heading.hosting.usage.graphs.noData'

/** Legacy's formatters call `this.$t` inside Apex, where it does not exist, so a `null` bucket threw. Here it reads "No Data". */
export const formatPercent: YFormatter = (value, t) => value === null ? t(NO_DATA_KEY) : `${value.toFixed(2)}%`

const BPS_UNITS = ['Bps', 'KBps', 'MBps', 'GBps', 'TBps']

/**
 * Legacy Disk throughput / Network traffic: log base 1024. A value below 1 gives index -1, so legacy prints `undefined` as the unit;
 * kept as is (not "fixed") because the screen is a port.
 */
export const formatBps: YFormatter = (value, t) => {
  if (value === null) {
    return t(NO_DATA_KEY)
  }
  if (value === 0) {
    return '0 Bps'
  }
  const i = Math.floor(Math.log(value) / Math.log(1024))
  return `${(value / 1024 ** i).toFixed(2)} ${BPS_UNITS[i]}`
}

export const formatIops: YFormatter = (value, t) => value === null ? t(NO_DATA_KEY) : `${value} iops`

export const formatPps: YFormatter = (value, t) => value === null ? t(NO_DATA_KEY) : `${value} pps`

const GRAPH_CONFIGS: Record<GraphKey, GraphConfig> = {
  'cpu-percent': {
    series: [{ nameKey: 'usage', field: 'cpu_percent' }],
    formatY: formatPercent,
  },
  'disk-throughput': {
    series: [{ nameKey: 'read', field: 'disk_read_bps' }, { nameKey: 'write', field: 'disk_write_bps' }],
    formatY: formatBps,
  },
  'disk-iops': {
    series: [{ nameKey: 'read', field: 'disk_read_iops' }, { nameKey: 'write', field: 'disk_write_iops' }],
    formatY: formatIops,
  },
  'network-traffic': {
    series: [{ nameKey: 'in', field: 'net_in_bps' }, { nameKey: 'out', field: 'net_out_bps' }],
    formatY: formatBps,
  },
  'network-pps': {
    series: [{ nameKey: 'in', field: 'net_in_pps' }, { nameKey: 'out', field: 'net_out_pps' }],
    formatY: formatPps,
  },
}

export function graphConfig (key: GraphKey): GraphConfig {
  return GRAPH_CONFIGS[key]
}

export interface GraphPoint {
  x: string
  y: number | null
}

/** A bucket without the field (an empty bucket carries only `period`) is a `null` point. */
export function buildSeries (metrics: ServerMetricsBucket[] | null, config: GraphConfig, t: Translate): Array<{ name: string, data: GraphPoint[] }> {
  return config.series.map(({ nameKey, field }) => ({
    name: t(`heading.hosting.usage.graphs.${nameKey}`),
    data: (metrics ?? []).map(bucket => ({
      x: bucket.period,
      y: Object.hasOwn(bucket, field) ? bucket[field] as number : null,
    })),
  }))
}

/** Resolved by the component from `chartColor('axis-label')` and `chartColor('grid')` and the series colours (tokens in `themes-variables.scss`). */
export interface GraphColors {
  axisLabel: string
  grid: string
  /** First and second series (`chartColor('visitors')`, `chartColor('bandwidth')`). */
  series: [string, string]
}

/** How the x axis is shown. `period` picks the label shape, `dateFormat` is `home.app.default_date_format` for the tooltip date. */
export interface GraphDisplay {
  period?: MetricsPeriod
  dateFormat?: string
  /** Periods whose label also carries the date: the first point and the first point of each new day (built by `datePeriods`). */
  datePeriods?: ReadonlySet<string>
}

const PERIOD_FULL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** The first period and every period whose day differs from the previous one; they get the date in the x label. */
export function datePeriods (metrics: ServerMetricsBucket[] | null): Set<string> {
  const result = new Set<string>()
  let previousDay: string | undefined
  for (const { period } of metrics ?? []) {
    const day = String(period).slice(0, 10)
    if (day !== previousDay) {
      result.add(period)
    }
    previousDay = day
  }
  return result
}

const PERIOD_TIME = /(\d{2}:\d{2})(:\d{2})?\s*$/

/**
 * Short x label from a bucket period such as `2026-11-09 15:13:30` (legacy prints the whole string
 * and the labels touch). Live has a point every 5 s, so it keeps the seconds (`HH:mm:ss`); 1 hour and 12 hours show `HH:mm`.
 * With `display.datePeriods` the first point and the first point of a new day also show the date;
 * a longer label can be dropped by `hideOverlappingLabels`, which is accepted.
 * The value is read as text, not as a `Date`, so the label does not depend on the browser time zone.
 */
export function formatAxisLabel (period: unknown, display: GraphDisplay = {}): string {
  const text = String(period ?? '')
  const match = PERIOD_TIME.exec(text)
  if (!match) {
    return text
  }
  const time = display.period === 'last-5-minutes' && match[2] ? `${match[1]}${match[2]}` : match[1]!
  if (display.datePeriods?.has(text)) {
    return `${formatDate(text.slice(0, match.index).trim(), { format: display.dateFormat })} ${time}`
  }
  return time
}

/** Tooltip title: the full date (in the format from Settings) and the time with seconds of the bucket. */
export function formatTooltipDate (period: unknown, display: GraphDisplay = {}): string {
  const text = String(period ?? '')
  const match = PERIOD_TIME.exec(text)
  if (!match) {
    return text
  }
  const date = formatDate(text.slice(0, match.index).trim(), { format: display.dateFormat })
  return `${date} ${match[1]}${match[2] ?? ''}`
}

export interface TooltipRow {
  name: string
  value: string
}

/** Tooltip box of a graph. Every text is escaped; the dots are classes, styled by `MetricsGraph.vue`. */
export function tooltipHtml ({ time, rows }: { time: string, rows: TooltipRow[] }): string {
  const items = rows
    .map((row, index) => `<div class="usage-tip__row"><span class="usage-tip__dot usage-tip__dot--${index}"></span>${escapeHtml(row.name)}<b>${escapeHtml(row.value)}</b></div>`)
    .join('')
  return `<div class="usage-tip"><div class="usage-tip__time">${escapeHtml(time)}</div>${items}</div>`
}

/**
 * Tooltip time. The value is the exact period when it has the full format; otherwise (no graph sets x categories, so Apex passes the
 * shown label) the bucket is found by index.
 */
export function tooltipTime (value: unknown, dataPointIndex: number | undefined, metrics: ServerMetricsBucket[] | null, display: GraphDisplay = {}): string {
  if (typeof value === 'string' && PERIOD_FULL.test(value)) {
    return formatTooltipDate(value, display)
  }
  const bucket = dataPointIndex === undefined ? undefined : metrics?.[dataPointIndex]
  return formatTooltipDate(bucket?.period ?? value, display)
}

interface TooltipContext {
  series: Array<Array<number | null | undefined>>
  dataPointIndex: number
  w: { globals: { seriesNames?: string[], categoryLabels?: unknown[] } }
}

/** x labels: about 7 on a wide chart, about 3 under 600px. */
const TICK_AMOUNT = 7
const TICK_AMOUNT_NARROW = 3

/** Returns the buckets the chart shows now. */
export type MetricsSource = () => ServerMetricsBucket[] | null

/**
 * Built per chart (legacy spread one shared object and mutated its `xaxis` / `yaxis.labels`). The options hold no data: the x labels
 * come from the points' `x` (no `xaxis.categories`), and the label and tooltip callbacks read the buckets through `metrics` when Apex
 * calls them. So a Live tick changes only the series, and `vue3-apexcharts` renders each chart once instead of twice (an `options`
 * change runs `updateOptions`, a `series` change runs `updateSeries`).
 */
export function graphOptions (metrics: MetricsSource, config: GraphConfig, t: Translate, colors: GraphColors, display: GraphDisplay = {}): ApexOptions {
  // The date periods are worked out once per answer, not once per label.
  let datesFor: ServerMetricsBucket[] | null | undefined
  let displayWithDates: GraphDisplay = display
  const currentDisplay = (): GraphDisplay => {
    const buckets = metrics()
    if (buckets !== datesFor) {
      datesFor = buckets
      displayWithDates = { ...display, datePeriods: datePeriods(buckets) }
    }
    return displayWithDates
  }
  const labelStyle = { colors: colors.axisLabel, fontSize: '12px', lineHeight: '16px', fontWeight: '700' }
  const single = config.series.length === 1
  return {
    colors: [...colors.series],
    stroke: { curve: 'straight', width: 2 },
    // One series gets a light area fill (the component draws it as `area`); two series stay lines.
    fill: single ? { type: 'solid', opacity: 0.08 } : { type: 'solid', opacity: 1 },
    grid: { borderColor: colors.grid, strokeDashArray: 4, padding: { left: 8, right: 16 } },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: TICK_AMOUNT,
      crosshairs: { show: true, stroke: { dashArray: 3 } },
      labels: {
        // Sized for the mockup's one or two label lines (the date joins the time on the first point of a day).
        minHeight: 32,
        rotate: 0,
        hideOverlappingLabels: true,
        style: labelStyle,
        formatter: (value: string) => formatAxisLabel(value, currentDisplay()),
      },
      convertedCatToNumeric: false,
    },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ series, dataPointIndex, w }: TooltipContext) => {
        const names = w.globals.seriesNames ?? []
        const categories = w.globals.categoryLabels ?? []
        return tooltipHtml({
          time: tooltipTime(categories[dataPointIndex], dataPointIndex, metrics(), display),
          rows: series.map((points, index) => ({
            name: names[index] ?? '',
            value: config.formatY(points[dataPointIndex] ?? null, t),
          })),
        })
      },
    },
    yaxis: {
      axisBorder: { show: false },
      labels: {
        minWidth: 56,
        formatter: (value: number) => config.formatY(value as number | null, t),
        style: labelStyle,
      },
      tickAmount: 5,
    },
    chart: { width: '100%', toolbar: { show: false }, animations: { enabled: false } },
    dataLabels: { enabled: false },
    markers: { size: 0 },
    legend: { show: false },
    responsive: [{ breakpoint: 600, options: { xaxis: { tickAmount: TICK_AMOUNT_NARROW } } }],
  } as ApexOptions
}
