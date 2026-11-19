import type { ApexOptions } from '@/shared/ui/charts/chart-types'
import type { ReportVisits, VisitsBreakdownMetric, VisitsBreakdownRecord } from '@/entities/project/instance-reporting.api'
import { areaChartOptions, deltaPercent, type NormalizedSeries } from '@/entities/project/instance-analytics'
import { chartColor } from '@/shared/ui/charts/chart-colors'

// The visitors chart keeps the raw report keys as its labels (no `normalizeDate`), unlike General.

/**
 * The legacy `"Total"` series name. Hard text on purpose: legacy shows it
 * untranslated in every language, so it is not a copy key.
 */
export const MONITORING_TOTAL_LABEL = 'Total'

/** Chart token of a header dot colour (`--v-chart-<name>`). */
export type MonitoringIndicatorColor = 'pie-1' | 'visitors'

/** One value of the chart header. `color: false` is legacy's "no colour dot". */
export interface MonitoringIndicator {
  label: string
  value: number | string
  delta: string | null
  color: MonitoringIndicatorColor | false
}

/** The visitors chart of Monitoring: the raw date keys as labels, one dataset, and the header indicators. */
export interface VisitorsChart {
  labels: string[]
  datasets: Array<Array<number | null>>
  indicators: MonitoringIndicator[]
}

/**
 * Builds the visitors chart from a `visitors` report (`getVisitorsReport`). `null` means legacy would not replace its data: no report,
 * no `visits`, or `visits.records` not an object (legacy throws on `Object.entries` and goes to `catch`). An empty `data: []` answer
 * reaches here as `{}` (`getVisitorsReport`), so it reads as `null` too.
 */
export function visitorsChart (report: unknown): VisitorsChart | null {
  if (typeof report !== 'object' || report === null) {
    return null
  }
  const visits = (report as { visits?: ReportVisits | null }).visits
  if (!visits || typeof visits.records !== 'object' || visits.records === null) {
    return null
  }
  const entries = Object.entries(visits.records)
  // Legacy shows `visits.total` as it is; a missing total reads as 0 so the indicator stays a number.
  const total = visits.total ?? 0
  return {
    labels: entries.map(([date]) => date),
    datasets: [entries.map(([, amount]) => amount)],
    indicators: [
      {
        label: MONITORING_TOTAL_LABEL,
        value: total,
        delta: deltaPercent(total, visits.previous_total),
        color: false,
      },
    ],
  }
}

/**
 * True when the visitors dataset has no truthy point (or no dataset at all) and nothing is loading. Only the visitors
 * chart decides it, so the other cards stay hidden in the empty state even when they have data.
 */
export function isNoData (chart: VisitorsChart, loading: boolean): boolean {
  const [first] = chart.datasets
  const empty = first === undefined || !first.some(Boolean)
  return empty && !loading
}

/**
 * Options of the Monitoring visitors chart. The shared area options, with the raw date keys as
 * categories, a whole-number y axis and no minimum width.
 */
export function visitorsChartOptions (chart: NormalizedSeries): ApexOptions {
  return areaChartOptions({
    color: chartColor('visitors'),
    categories: chart.labels,
    integerMax: Math.max(0, ...(chart.datasets[0] ?? [])),
  })
}

/** Series of the Monitoring visitors chart: one series named `Total`. */
export function visitorsChartSeries (chart: NormalizedSeries): ApexOptions['series'] {
  return [{ name: MONITORING_TOTAL_LABEL, data: chart.datasets[0] ?? [] }]
}

/** One row of a breakdown card. `img` is the flag path, `color` the colour of a pie or doughnut slice. */
export interface MonitoringItem {
  label: string
  data: number
  img?: string
  color?: string
}

/**
 * One breakdown card: the endpoint that feeds it, its title key, its kind, the record field that holds the flag code, the alert flag and
 * the data source that needs a visible attribution (`'dbip'`: DB-IP City Lite, CC BY 4.0, shown as "IP Geolocation by DB-IP").
 */
export interface MonitoringBreakdownCard {
  metric: VisitsBreakdownMetric
  titleKey: string
  kind: 'shares' | 'doughnut' | 'pie'
  flagField?: 'code' | 'country_code'
  alertOnError?: true
  attribution?: 'dbip'
}

/** Tokens of the breakdown palette, in list order. */
const PIE_CHART_TOKENS = ['pie-1', 'pie-2', 'pie-3', 'pie-4', 'pie-5'] as const

/**
 * Colour of a breakdown row by its list position, read from the `--v-chart-pie-N` tokens when the chart is built. Past the fifth row there
 * is no colour (`undefined`), as in legacy.
 */
export function pieChartColor (index: number): string | undefined {
  const name = PIE_CHART_TOKENS[index]
  return name === undefined ? undefined : chartColor(name)
}

/**
 * Class of a breakdown row's colour dot: `slice-N` by list position (N counts from 0, the same index as `pieChartColor`), and
 * `slice-fallback` past the fifth row, where the slice takes `--v-chart-pie-fallback`.
 */
export function sliceClass (index: number): string {
  return index < PIE_CHART_TOKENS.length ? `slice-${index}` : 'slice-fallback'
}

/**
 * The nine breakdown cards in legacy order. The view renders and fetches them in this order, all at once on
 * mount.
 */
export const MONITORING_BREAKDOWN_CARDS: ReadonlyArray<MonitoringBreakdownCard> = [
  { metric: 'country', titleKey: 'heading.instance.monitoring.chart.visits.country', kind: 'shares', flagField: 'code', attribution: 'dbip' },
  { metric: 'page', titleKey: 'heading.instance.monitoring.chart.visits.page', kind: 'shares', alertOnError: true },
  { metric: 'continent', titleKey: 'heading.instance.monitoring.chart.visits.continent', kind: 'shares', attribution: 'dbip' },
  { metric: 'region', titleKey: 'heading.instance.monitoring.chart.visits.region', kind: 'shares', flagField: 'country_code', attribution: 'dbip' },
  { metric: 'referrer', titleKey: 'heading.instance.monitoring.chart.visits.referrer', kind: 'shares' },
  { metric: 'device', titleKey: 'heading.instance.monitoring.chart.visits.device', kind: 'doughnut' },
  { metric: 'device-brand', titleKey: 'heading.instance.monitoring.chart.visits.deviceBrand', kind: 'pie' },
  { metric: 'device-os', titleKey: 'heading.instance.monitoring.chart.visits.os', kind: 'pie' },
  { metric: 'device-browser', titleKey: 'heading.instance.monitoring.chart.visits.browser', kind: 'pie' },
]

/**
 * Flag image path of a country or region code, relative to `/assets/`. `XX` (unknown) is an SVG, every
 * other code a PNG. The code comes from the API, so it is encoded to stay one path segment (legacy pastes it as it is).
 */
export function flagImg (code: string): string {
  const upper = encodeURIComponent(code.toUpperCase())
  return upper === 'XX' ? `img/flags/${upper}.svg` : `img/flags/${upper}.png`
}

/**
 * Maps a `visits-by-*` answer to the rows of a card. `null` means legacy would throw and keep its data: the
 * answer is not a list, a row is not an object, or a flagged row has no code (legacy `toUpperCase` on `undefined`).
 */
export function breakdownItems (records: unknown, card: MonitoringBreakdownCard): MonitoringItem[] | null {
  if (!Array.isArray(records)) {
    return null
  }
  const items: MonitoringItem[] = []
  for (const [index, record] of (records as Array<VisitsBreakdownRecord | null>).entries()) {
    if (typeof record !== 'object' || record === null) {
      return null
    }
    const item: MonitoringItem = { label: record.label, data: record.visits }
    if (card.flagField) {
      const code = record[card.flagField]
      if (typeof code !== 'string') {
        return null
      }
      item.img = flagImg(code)
    }
    if (card.kind !== 'shares') {
      item.color = pieChartColor(index)
    }
    items.push(item)
  }
  return items
}

/** The `maxValue` of a shares card is the sum of its values, not the largest one. */
export function sharesMaxValue (items: MonitoringItem[]): number {
  return items.reduce((sum, item) => sum + item.data, 0)
}

/** The data a pie or doughnut takes: values, colours and labels in one order. */
export interface PieChartInput {
  series: number[]
  colors: string[]
  labels: string[]
}

/** The pie input in the order of the list. */
export function chartInput (items: MonitoringItem[]): PieChartInput {
  return {
    series: items.map(item => item.data),
    // Legacy leaves the slice colour empty past the fifth row and chart.js 2 paints its default; Apex needs a real value.
    colors: items.map(item => item.color ?? chartColor('pie-fallback')),
    labels: items.map(item => item.label),
  }
}

/**
 * The doughnut input, reversed as in legacy: the slices
 * run opposite to the list below the chart. The list itself keeps the API order.
 */
export function reversedChart (items: MonitoringItem[]): PieChartInput {
  // eslint-disable-next-line unicorn/no-array-reverse -- `toReversed` is not in the app tsconfig lib (es2022); this reverses a copy
  return chartInput([...items].reverse())
}

/** Options that switch off the hover and active highlight. */
function noHighlight (): ApexOptions['states'] {
  return {
    hover: { filter: { type: 'none' } },
    active: { filter: { type: 'none' } },
  }
}

/**
 * Apex writes the tooltip series name with `innerHTML` (`modules/tooltip/Labels.js`), and the pie labels come from the visits report
 * (device, brand, OS, browser: strings sent by the visitors' browsers). Legacy drew them on a chart.js canvas, so the name is escaped here.
 */
export function escapeTooltipTitle (name: string): string {
  return name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Class of the pie and doughnut tooltip: the global `_chart.scss` draws it as the legacy chart.js 2 tooltip, not as the area-chart card. */
export const PIE_TOOLTIP_CLASS = 'chart-tooltip-pie'

/**
 * Tooltip of the pie and the doughnut, as the legacy chart.js 2 default: one line "label: value" after a colour box (chart.js pie
 * `label + ': ' + value`). Apex paints the whole row in the slice colour by default for pie charts (`fillSeriesColor`), which under the
 * global area-chart tooltip rules gave a white card with a coloured bar; the row stays unfilled and the look comes from
 * `PIE_TOOLTIP_CLASS`. The series name is escaped (see `escapeTooltipTitle`).
 */
function legacyPieTooltip (): ApexOptions['tooltip'] {
  return {
    fillSeriesColor: false,
    cssClass: PIE_TOOLTIP_CLASS,
    y: { title: { formatter: name => `${escapeTooltipTitle(name)}:` } },
  }
}

/**
 * Options of the Monitoring pie (chart.js 2 in legacy: `rotation: 0`, `borderWidth: 0`). Apex
 * starts the first slice at 90 degrees, which is where chart.js 2 starts it (3 o'clock). Apex draws `endAngle - startAngle` degrees
 * (default `endAngle` 360), so the end is 450 to keep the full circle; with 360 the pie lost its last quarter.
 */
export function pieChartOptions (labels: string[], colors: string[]): ApexOptions {
  return {
    labels,
    colors,
    plotOptions: { pie: { startAngle: 90, endAngle: 450 } },
    stroke: { width: 0 },
    legend: { show: false },
    dataLabels: { enabled: false },
    states: noHighlight(),
    tooltip: legacyPieTooltip(),
  }
}

/**
 * Options of the Monitoring doughnut (chart.js 2 in legacy: `cutoutPercentage: 75`). chart.js 2 keeps
 * its default rotation (12 o'clock) and its default 2px white border, so the Apex start angle is 0 and the stroke is restated.
 */
export function doughnutChartOptions (labels: string[], colors: string[]): ApexOptions {
  return {
    labels,
    colors,
    plotOptions: {
      pie: {
        startAngle: 0,
        donut: { size: '75%', labels: { show: false } },
      },
    },
    stroke: { width: 2, colors: [chartColor('pie-stroke')] },
    legend: { show: false },
    dataLabels: { enabled: false },
    states: noHighlight(),
    tooltip: legacyPieTooltip(),
  }
}
