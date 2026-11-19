import { describe, expect, it } from 'vitest'
import {
  breakdownItems,
  chartInput,
  doughnutChartOptions,
  escapeTooltipTitle,
  flagImg,
  isNoData,
  MONITORING_BREAKDOWN_CARDS,
  MONITORING_TOTAL_LABEL,
  type MonitoringBreakdownCard,
  type MonitoringItem,
  PIE_TOOLTIP_CLASS,
  pieChartOptions,
  reversedChart,
  sharesMaxValue,
  type VisitorsChart,
  visitorsChart,
  visitorsChartOptions,
  visitorsChartSeries,
} from './monitoring'

// Chart colour tokens (`themes-variables.scss`), set on the root as the stylesheet does in the app. Set once at module level because some
// `describe` blocks build their options during collection, before any hook runs.
const CHART_TOKENS: Record<string, string> = {
  '--v-chart-visitors': '#07C07E',
  '--v-chart-pie-1': '#83CC80',
  '--v-chart-pie-2': '#44AA92',
  '--v-chart-pie-3': '#D45858',
  '--v-chart-pie-4': '#EF9840',
  '--v-chart-pie-5': '#CA7699',
  '--v-chart-pie-stroke': '#fff',
  '--v-chart-pie-fallback': 'rgba(0,0,0,0.1)',
}

for (const [name, value] of Object.entries(CHART_TOKENS)) {
  document.documentElement.style.setProperty(name, value)
}

function shares (metric: MonitoringBreakdownCard['metric'], flagField?: MonitoringBreakdownCard['flagField']): MonitoringBreakdownCard {
  return {
    metric,
    titleKey: 'k',
    kind: 'shares',
    flagField,
  }
}

const full = {
  visits: {
    records: { '2026-10-01': 3, '2026-10-02': null, '2026-10-03': 5 },
    total: 8,
    previous_total: 4,
  },
}

describe('visitorsChart', () => {
  it('builds the labels, the dataset and the Total indicator from a full report', () => {
    expect(visitorsChart(full)).toEqual({
      labels: ['2026-10-01', '2026-10-02', '2026-10-03'],
      datasets: [[3, null, 5]],
      indicators: [{ label: 'Total', value: 8, delta: '100.00%', color: false }],
    })
  })

  it('keeps the untranslated legacy Total label', () => {
    expect(MONITORING_TOTAL_LABEL).toBe('Total')
  })

  it('returns null for an empty array (data: [] answer) and an empty object', () => {
    expect(visitorsChart([])).toBeNull()
    expect(visitorsChart({})).toBeNull()
  })

  it('returns null when there is no report at all', () => {
    expect(visitorsChart(null)).toBeNull()
    expect(visitorsChart(undefined)).toBeNull()
  })

  it('returns null when visits is missing or null', () => {
    expect(visitorsChart({ visits: null })).toBeNull()
    expect(visitorsChart({ visits_length: { records: {}, total: 1 } })).toBeNull()
  })

  it('returns null when visits.records is missing or null', () => {
    expect(visitorsChart({ visits: { records: null, total: 1 } })).toBeNull()
    expect(visitorsChart({ visits: { total: 1 } })).toBeNull()
  })

  it('reads a zero previous total as a 100% rise', () => {
    const chart = visitorsChart({ visits: { records: { '2026-10-01': 1 }, total: 1, previous_total: 0 } })
    expect(chart?.indicators[0]?.delta).toBe('100%')
  })

  it('reads a null previous total as a 100% rise', () => {
    const chart = visitorsChart({ visits: { records: { '2026-10-01': 1 }, total: 1, previous_total: null } })
    expect(chart?.indicators[0]?.delta).toBe('100%')
  })

  it('keeps an empty records object as a chart with no points', () => {
    expect(visitorsChart({ visits: { records: {}, total: 0, previous_total: 0 } })).toEqual({
      labels: [],
      datasets: [[]],
      indicators: [{ label: 'Total', value: 0, delta: null, color: false }],
    })
  })
})

describe('isNoData', () => {
  const empty: VisitorsChart = { labels: [], datasets: [], indicators: [] }

  it('is true for a chart without a dataset when nothing loads', () => {
    expect(isNoData(empty, false)).toBe(true)
  })

  it('is true for a dataset with only zeros or null points', () => {
    const zeros: VisitorsChart = { labels: ['a', 'b', 'c'], datasets: [[0, 0, null]], indicators: [] }
    expect(isNoData(zeros, false)).toBe(true)
  })

  it('is false when a point is truthy', () => {
    const data: VisitorsChart = { labels: ['a', 'b'], datasets: [[0, 2]], indicators: [] }
    expect(isNoData(data, false)).toBe(false)
  })

  it('is false while loading, even for an empty chart', () => {
    expect(isNoData(empty, true)).toBe(false)
  })
})

describe('visitorsChartOptions and visitorsChartSeries', () => {
  const chart = { labels: ['2026-10-01', '2026-10-02'], datasets: [[3, 0]] }

  it('uses the legacy green colour for the fill and the stroke', () => {
    const options = visitorsChartOptions(chart)
    expect(options.colors).toEqual(['#07C07E'])
    expect(options.stroke?.colors).toEqual(['#07C07E'])
  })

  it('takes the raw date keys as the categories', () => {
    expect(visitorsChartOptions(chart).xaxis?.categories).toEqual(['2026-10-01', '2026-10-02'])
  })

  it('has no minimum width and a whole-number y axis', () => {
    const yaxis = visitorsChartOptions(chart).yaxis as { labels?: { minWidth?: unknown }, decimalsInFloat?: number }
    expect(yaxis.labels?.minWidth).toBeUndefined()
    expect(yaxis.decimalsInFloat).toBe(0)
  })

  it('labels the axis with whole numbers for a maximum of 7', () => {
    const yaxis = visitorsChartOptions({ labels: ['a', 'b'], datasets: [[7, 1]] }).yaxis as { labels: { formatter: (v: number) => string } }
    expect(yaxis.labels.formatter(1.75)).toBe('2')
    expect(yaxis.labels.formatter(7)).toBe('7')
  })

  it('names the single series Total with the first dataset', () => {
    expect(visitorsChartSeries(chart)).toEqual([{ name: 'Total', data: [3, 0] }])
  })

  it('gives an empty series when there is no dataset', () => {
    expect(visitorsChartSeries({ labels: [' ', ' '], datasets: [] })).toEqual([{ name: 'Total', data: [] }])
  })
})

describe('MONITORING_BREAKDOWN_CARDS', () => {
  it('lists the nine breakdown cards in legacy order', () => {
    expect(MONITORING_BREAKDOWN_CARDS.map(card => card.metric)).toEqual([
      'country',
      'page',
      'continent',
      'region',
      'referrer',
      'device',
      'device-brand',
      'device-os',
      'device-browser',
    ])
  })

  it('gives the alert only to the page card and the flag field to country and region', () => {
    expect(MONITORING_BREAKDOWN_CARDS.filter(card => card.alertOnError).map(card => card.metric)).toEqual(['page'])
    expect(MONITORING_BREAKDOWN_CARDS.filter(card => card.flagField).map(card => [card.metric, card.flagField])).toEqual([
      ['country', 'code'],
      ['region', 'country_code'],
    ])
  })

  it('marks only the country, continent and region cards with the DB-IP attribution', () => {
    expect(MONITORING_BREAKDOWN_CARDS.filter(card => card.attribution).map(card => card.metric)).toEqual([
      'country',
      'continent',
      'region',
    ])
    expect(MONITORING_BREAKDOWN_CARDS.filter(card => card.attribution).every(card => card.attribution === 'dbip')).toBe(true)
  })
})

describe('flagImg', () => {
  it('points a country code at its PNG flag, upper-cased', () => {
    expect(flagImg('pl')).toBe('img/flags/PL.png')
  })

  it('points XX (unknown) at the SVG flag', () => {
    expect(flagImg('XX')).toBe('img/flags/XX.svg')
    expect(flagImg('xx')).toBe('img/flags/XX.svg')
  })

  it('keeps a code from the API inside one path segment', () => {
    expect(flagImg('../../api/x?a=#')).toBe('img/flags/..%2F..%2FAPI%2FX%3FA%3D%23.png')
  })
})

describe('breakdownItems', () => {
  const page: MonitoringBreakdownCard = { metric: 'page', titleKey: 'k', kind: 'shares', alertOnError: true }

  it('maps a page answer to label and data, with no flag and no colour', () => {
    expect(breakdownItems([{ label: '/home', visits: 7 }], page)).toEqual([{ label: '/home', data: 7 }])
  })

  it('maps a country answer with the flag from its code', () => {
    const country = MONITORING_BREAKDOWN_CARDS[0] as MonitoringBreakdownCard
    expect(breakdownItems([{ label: 'Poland', visits: 3, code: 'PL' }], country)).toEqual([
      { label: 'Poland', data: 3, img: 'img/flags/PL.png' },
    ])
  })

  it('maps a region answer with the flag from its country_code', () => {
    const region = MONITORING_BREAKDOWN_CARDS[3] as MonitoringBreakdownCard
    expect(breakdownItems([{ label: 'Masovia', visits: 2, country_code: 'pl' }], region)).toEqual([
      { label: 'Masovia', data: 2, img: 'img/flags/PL.png' },
    ])
  })

  it('uses the SVG flag for an XX row', () => {
    expect(breakdownItems([{ label: 'Unknown', visits: 1, code: 'XX' }], shares('country', 'code'))).toEqual([
      { label: 'Unknown', data: 1, img: 'img/flags/XX.svg' },
    ])
  })

  it('returns null when the answer is not a list', () => {
    expect(breakdownItems(undefined, page)).toBeNull()
    expect(breakdownItems({ label: 'x', visits: 1 }, page)).toBeNull()
    expect(breakdownItems(null, page)).toBeNull()
  })

  it('returns null when a flagged row has no code, as legacy toUpperCase would throw', () => {
    expect(breakdownItems([{ label: 'Poland', visits: 3 }], shares('country', 'code'))).toBeNull()
    expect(breakdownItems([{ label: 'Masovia', visits: 2, code: 'PL' }], shares('region', 'country_code'))).toBeNull()
  })

  it('returns null when a row is not an object', () => {
    expect(breakdownItems([null], page)).toBeNull()
  })

  it('colours a doughnut or pie row by its position, as legacy pieChartColors', () => {
    const device: MonitoringBreakdownCard = { metric: 'device', titleKey: 'k', kind: 'doughnut' }
    const items = breakdownItems([{ label: 'Desktop', visits: 5 }, { label: 'Phone', visits: 2 }], device)
    expect(items).toEqual([
      { label: 'Desktop', data: 5, color: '#83CC80' },
      { label: 'Phone', data: 2, color: '#44AA92' },
    ])
  })

  it('leaves the colour empty past the five legacy colours', () => {
    const pie: MonitoringBreakdownCard = { metric: 'device-os', titleKey: 'k', kind: 'pie' }
    const rows = Array.from({ length: 6 }, (_, i) => ({ label: `os${i}`, visits: 1 }))
    expect(breakdownItems(rows, pie)?.[5]?.color).toBeUndefined()
  })

  it('returns an empty list for an empty answer', () => {
    expect(breakdownItems([], page)).toEqual([])
  })
})

describe('sharesMaxValue', () => {
  it('sums the values of the rows, as legacy SharesCard', () => {
    expect(sharesMaxValue([{ label: 'a', data: 3 }, { label: 'b', data: 5 }, { label: 'c', data: 2 }])).toBe(10)
  })

  it('is 0 for an empty card', () => {
    expect(sharesMaxValue([])).toBe(0)
  })
})

describe('pieChartOptions', () => {
  const options = pieChartOptions(['Desktop', 'Phone'], ['#83CC80', '#44AA92'])

  it('starts the first slice at 90 degrees, as chart.js 2 rotation 0', () => {
    expect(options.plotOptions?.pie?.startAngle).toBe(90)
  })

  it('draws the full circle (Apex draws endAngle - startAngle degrees)', () => {
    const { startAngle = 0, endAngle = 360 } = options.plotOptions?.pie ?? {}
    expect(endAngle - startAngle).toBe(360)
  })

  it('has no stroke, no legend, no data labels and no hover or active highlight', () => {
    expect(options.stroke?.width).toBe(0)
    expect(options.legend?.show).toBe(false)
    expect(options.dataLabels?.enabled).toBe(false)
    expect(options.states?.hover?.filter?.type).toBe('none')
    expect(options.states?.active?.filter?.type).toBe('none')
  })

  it('takes the labels and the colours in the given order', () => {
    expect(options.labels).toEqual(['Desktop', 'Phone'])
    expect(options.colors).toEqual(['#83CC80', '#44AA92'])
  })

  it('is not a donut', () => {
    expect(options.plotOptions?.pie?.donut).toBeUndefined()
  })
})

describe('doughnutChartOptions', () => {
  const options = doughnutChartOptions(['Desktop'], ['#83CC80'])

  it('starts the first slice at 0 degrees, as the chart.js 2 default rotation', () => {
    expect(options.plotOptions?.pie?.startAngle).toBe(0)
  })

  it('cuts the centre to 75 percent with no labels, as cutoutPercentage 75', () => {
    expect(options.plotOptions?.pie?.donut?.size).toBe('75%')
    expect(options.plotOptions?.pie?.donut?.labels?.show).toBe(false)
  })

  it('restates the 2px white border of chart.js 2', () => {
    expect(options.stroke?.width).toBe(2)
    expect(options.stroke?.colors).toEqual(['#fff'])
  })

  it('has no legend and no hover or active highlight', () => {
    expect(options.legend?.show).toBe(false)
    expect(options.states?.hover?.filter?.type).toBe('none')
    expect(options.states?.active?.filter?.type).toBe('none')
  })
})

describe('chartInput and reversedChart', () => {
  const items: MonitoringItem[] = [
    { label: 'a', data: 40, color: '#83CC80' },
    { label: 'b', data: 20, color: '#EF9840' },
    { label: 'c', data: 30, color: '#CA7699' },
  ]

  it('keeps the list order for a pie', () => {
    expect(chartInput(items)).toEqual({
      series: [40, 20, 30],
      colors: ['#83CC80', '#EF9840', '#CA7699'],
      labels: ['a', 'b', 'c'],
    })
  })

  it('reverses series, colours and labels for a doughnut, as legacy DoughnutChartCard', () => {
    expect(reversedChart(items)).toEqual({
      series: [30, 20, 40],
      colors: ['#CA7699', '#EF9840', '#83CC80'],
      labels: ['c', 'b', 'a'],
    })
  })

  it('does not reverse the list it is given', () => {
    reversedChart(items)
    expect(items.map(item => item.label)).toEqual(['a', 'b', 'c'])
  })

  it('paints a row without a colour with the chart.js 2 default colour', () => {
    expect(chartInput([{ label: 'x', data: 1 }]).colors).toEqual(['rgba(0,0,0,0.1)'])
  })

  it('gives empty input for an empty card', () => {
    expect(reversedChart([])).toEqual({ series: [], colors: [], labels: [] })
  })
})

describe('escapeTooltipTitle', () => {
  it('escapes the markup characters of a label, since Apex writes the tooltip name with innerHTML', () => {
    expect(escapeTooltipTitle('<img src=x onerror="a(\'b\')">&')).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;')
  })

  it('leaves a plain label as it is', () => {
    expect(escapeTooltipTitle('Samsung Internet')).toBe('Samsung Internet')
  })

  it('is the tooltip name formatter of the pie and of the doughnut', () => {
    for (const options of [pieChartOptions(['<b>'], ['#83CC80']), doughnutChartOptions(['<b>'], ['#83CC80'])]) {
      const formatter = options.tooltip?.y
      expect(Array.isArray(formatter)).toBe(false)
      expect((formatter as { title: { formatter: (name: string) => string } }).title.formatter('<b>')).toBe('&lt;b&gt;:')
    }
  })

  it('draws the pie and doughnut tooltip as the legacy chart.js one, without the slice-coloured row', () => {
    for (const options of [pieChartOptions(['a'], ['#83CC80']), doughnutChartOptions(['a'], ['#83CC80'])]) {
      expect(options.tooltip?.fillSeriesColor).toBe(false)
      expect(options.tooltip?.cssClass).toBe(PIE_TOOLTIP_CLASS)
    }
  })
})
