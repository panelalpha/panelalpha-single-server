import type { ApexOptions } from '@/shared/ui/charts/chart-types'

// The period labels are the `form.option.period.*` keys (the select translates
// `form.option.<text>`). Shared by the General and Monitoring analytics cards.

export type AnalyticsPeriod = 'last-week' | 'last-month' | 'last-year'

export const ANALYTICS_PERIOD_OPTIONS: Array<{ value: AnalyticsPeriod, text: string }> = [
  { value: 'last-week', text: 'period.lastWeek' },
  { value: 'last-month', text: 'period.lastMonth' },
  { value: 'last-year', text: 'period.lastYear' },
]

export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = 'last-week'

/** Chart input: one label per point and one or more datasets. `null` points are read as 0 by `normalizeSeries`. */
export interface ChartSeries {
  labels: string[]
  datasets: Array<Array<number | null>>
}

/** A series the chart can draw: every point is a number. */
export interface NormalizedSeries {
  labels: string[]
  datasets: number[][]
}

/**
 * No labels or no datasets gives one flat pair of zeros with blank labels, so the chart still draws an
 * axis. `null` points are read as 0 (`removeNulledData`).
 */
export function normalizeSeries (series: ChartSeries): NormalizedSeries {
  if (series.datasets.length === 0 || series.labels.length === 0) {
    return { labels: [' ', ' '], datasets: [[0, 0]] }
  }
  return {
    labels: series.labels,
    datasets: series.datasets.map(dataset => dataset.map(point => point ?? 0)),
  }
}

/**
 * `previous_total` of 0 (or missing) reads as a 100% rise, as legacy, unless the total is 0 too: then there is no trend and the
 * result is `null` (no arrow, no percent). Otherwise `(total / previous - 1) * 100` with two
 * decimals and `%`.
 */
export function deltaPercent (total: number, previousTotal: number | null | undefined): string | null {
  if (!previousTotal) {
    return total ? '100%' : null
  }
  return `${((total / previousTotal - 1) * 100).toFixed(2)}%`
}

/**
 * The period a select update asks for, or `null` when nothing changes. The select emits its update
 * twice, so an update to the current period is ignored, as is any value that is not a period.
 */
export function nextPeriod (current: AnalyticsPeriod, selected: unknown): AnalyticsPeriod | null {
  const match = ANALYTICS_PERIOD_OPTIONS.find(option => option.value === selected)
  if (!match || match.value === current) {
    return null
  }
  return match.value
}

/** Options of one area chart of the analytics cards. */
export interface AreaChartOptions {
  color: string
  categories: string[]
  /** There is no y-axis formatter, so the axis shows the raw value. */
  yFormatter?: (value: number) => string
  /** Visitors sets `minWidth: 24` on the y labels; bandwidth does not. */
  yMinWidth?: number
  /**
   * Largest value of the series when the y axis counts whole things (visitors, sessions). The axis then has no fractions: a small
   * maximum gets one tick per whole number (all zeros: 0 and 1), a larger one lets Apex pick a nice integer scale.
   */
  integerMax?: number
}

const AXIS_STYLE = {
  colors: '#797997',
  fontSize: '12px',
  fontWeight: '700',
}

type YAxisOptions = Exclude<NonNullable<ApexOptions['yaxis']>, unknown[]>

function integerAxis (integerMax: number | undefined): YAxisOptions {
  if (integerMax === undefined) {
    return { tickAmount: 5 }
  }
  const top = Math.ceil(integerMax)
  if (top < 5) {
    const ticks = Math.max(top, 1)
    return { min: 0, max: ticks, tickAmount: ticks, decimalsInFloat: 0 }
  }
  return { min: 0, tickAmount: 5, forceNiceScale: true, decimalsInFloat: 0 }
}

/** The area chart options both cards share. The colour, the categories, the y formatter and the y minimum width differ per card. */
export function areaChartOptions ({ color, categories, yFormatter, yMinWidth, integerMax }: AreaChartOptions): ApexOptions {
  // A custom formatter (e.g. `String`) bypasses `decimalsInFloat`, so on an integer axis every label is rounded before it is formatted.
  const labelFormatter = integerMax === undefined
    ? yFormatter
    : (value: number) => (yFormatter ?? String)(Math.round(value))
  return {
    colors: [color],
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 0, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
    },
    stroke: { colors: [color], curve: 'straight', width: 2 },
    // Legacy `grid.borderWidth: '1px'` is not an Apex option (no effect on the grid), so it is not carried over.
    grid: { borderColor: '#DEDEF1', strokeDashArray: 9 },
    xaxis: {
      axisBorder: { show: false },
      categories,
      labels: {
        minHeight: 76,
        rotate: 0,
        hideOverlappingLabels: true,
        style: AXIS_STYLE,
      },
    },
    yaxis: {
      axisBorder: { show: false },
      labels: {
        minWidth: yMinWidth,
        formatter: labelFormatter,
        style: AXIS_STYLE,
      },
      ...integerAxis(integerMax),
    },
    chart: { width: '100%', toolbar: { show: false } },
    dataLabels: { enabled: false },
    markers: { size: 0 },
    legend: { itemMargin: { vertical: 20 } },
  }
}
