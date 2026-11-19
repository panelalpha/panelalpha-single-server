import { describe, expect, it } from 'vitest'
import { buildSeries, datePeriods, formatAxisLabel, formatBps, formatIops, formatPercent, formatPps, formatTooltipDate, graphConfig, graphOptions, GRAPHS, periodOptions, tooltipHtml, tooltipTime } from './metrics-graphs'

describe('periodOptions', () => {
  it('lists 1 hour, 12 hours and Live in legacy order, Live from deployLogs.live', () => {
    const t = (key: string, options?: { defaultValue?: string }) => key === 'deployLogs.live' ? 'Na żywo' : (options?.defaultValue ?? key)
    expect(periodOptions(t)).toEqual([
      { title: '1 hour', value: 'last-hour' },
      { title: '12 hours', value: 'last-12-hours' },
      { title: 'Na żywo', value: 'last-5-minutes' },
    ])
  })

  it('falls back to the English word when the API has no key (app)', () => {
    const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key
    expect(periodOptions(t)[2]!.title).toBe('Live')
  })
})

describe('GRAPHS', () => {
  it('has the five graphs in legacy order', () => {
    expect(GRAPHS.map(graph => graph.titleKey)).toEqual(['cpuUsage', 'diskThroughput', 'diskIops', 'networkTraffic', 'networkPps'])
  })

  it('makes only the CPU graph wide', () => {
    expect(GRAPHS.filter(graph => graph.wide).map(graph => graph.key)).toEqual(['cpu-percent'])
  })
})

describe('CPU graph', () => {
  const t = (key: string) => key
  const colors = { axisLabel: '#111111', grid: '#222222', series: ['#333333', '#444444'] as [string, string] }
  const config = graphConfig('cpu-percent')
  const metrics = [
    { period: '2026-10-07 10:00:00', cpu_percent: 12.345 },
    { period: '2026-10-07 10:00:05' },
  ]

  it('formats the y axis with two decimals and a percent sign', () => {
    expect(formatPercent(12.345, t)).toBe('12.35%')
    expect(formatPercent(0, t)).toBe('0.00%')
  })

  it('reads "No Data" for a null bucket instead of throwing (legacy TypeError)', () => {
    expect(formatPercent(null, t)).toBe('heading.hosting.usage.graphs.noData')
  })

  it('builds one series from cpu_percent, with null for an empty bucket', () => {
    expect(buildSeries(metrics, config, t)).toEqual([{
      name: 'heading.hosting.usage.graphs.usage',
      data: [{ x: '2026-10-07 10:00:00', y: 12.345 }, { x: '2026-10-07 10:00:05', y: null }],
    }])
  })

  it('builds an empty series before the first response', () => {
    expect(buildSeries(null, config, t)[0]!.data).toEqual([])
  })

  it('sets no x categories (the labels come from the points) and keeps the legacy axis styling', () => {
    const options = graphOptions(() => metrics, config, t, colors)
    expect(options.xaxis?.categories).toBeUndefined()
    expect(options.xaxis?.labels).toMatchObject({ minHeight: 32, rotate: 0, hideOverlappingLabels: true })
    expect(options.yaxis).toMatchObject({ tickAmount: 5 })
    expect(options.stroke).toEqual({ curve: 'straight', width: 2 })
    expect(options.legend).toEqual({ show: false })
    expect(options.chart?.toolbar).toEqual({ show: false })
    expect(options.chart?.animations).toEqual({ enabled: false })
    const formatter = (options.yaxis as { labels: { formatter: (v: number) => string } }).labels.formatter
    expect(formatter(1)).toBe('1.00%')
  })

  it('takes the axis label and grid colours from the injected colours', () => {
    const options = graphOptions(() => metrics, config, t, colors)
    expect(options.grid?.borderColor).toBe('#222222')
    expect((options.xaxis?.labels as { style: { colors: string } }).style.colors).toBe('#111111')
    expect((options.yaxis as { labels: { style: { colors: string } } }).labels.style.colors).toBe('#111111')
  })

  it('uses the series colours, a dashed grid and a dashed crosshair', () => {
    const options = graphOptions(() => metrics, config, t, colors)
    expect(options.colors).toEqual(['#333333', '#444444'])
    expect(options.grid?.strokeDashArray).toBe(4)
    expect(options.xaxis?.crosshairs).toMatchObject({ show: true, stroke: { dashArray: 3 } })
    expect(options.xaxis?.tickAmount).toBe(7)
    expect(options.responsive?.[0]).toMatchObject({ breakpoint: 600, options: { xaxis: { tickAmount: 3 } } })
  })

  it('fills the area for a single series only', () => {
    expect(graphOptions(() => metrics, config, t, colors).fill).toEqual({ type: 'solid', opacity: 0.08 })
    expect(graphOptions(() => metrics, graphConfig('disk-throughput'), t, colors).fill).toEqual({ type: 'solid', opacity: 1 })
  })

  it('formats bytes per second with log base 1024', () => {
    expect(formatBps(0, t)).toBe('0 Bps')
    expect(formatBps(1, t)).toBe('1.00 Bps')
    expect(formatBps(1536, t)).toBe('1.50 KBps')
    expect(formatBps(5 * 1024 ** 2, t)).toBe('5.00 MBps')
    expect(formatBps(2 * 1024 ** 3, t)).toBe('2.00 GBps')
    expect(formatBps(null, t)).toBe('heading.hosting.usage.graphs.noData')
  })

  it('keeps the legacy unit for a value below 1 (index -1)', () => {
    expect(formatBps(0.5, t)).toBe('512.00 undefined')
  })

  it('formats iops and pps and reads No Data for null', () => {
    expect(formatIops(12, t)).toBe('12 iops')
    expect(formatPps(12, t)).toBe('12 pps')
    expect(formatIops(null, t)).toBe('heading.hosting.usage.graphs.noData')
    expect(formatPps(null, t)).toBe('heading.hosting.usage.graphs.noData')
  })

  it.each([
    ['disk-throughput', 'read', 'write', [1, 2048]],
    ['disk-iops', 'read', 'write', [7, 9]],
    ['network-traffic', 'in', 'out', [5, 6]],
    ['network-pps', 'in', 'out', [3, 4]],
  ] as const)('%s builds two series with null for the empty bucket', (key, first, second, values) => {
    const all = [
      { period: 'a', disk_read_bps: 1, disk_write_bps: 2048, disk_read_iops: 7, disk_write_iops: 9, net_in_bps: 5, net_out_bps: 6, net_in_pps: 3, net_out_pps: 4 },
      { period: 'b' },
    ]
    const series = buildSeries(all, graphConfig(key), t)
    expect(series.map(s => s.name)).toEqual([`heading.hosting.usage.graphs.${first}`, `heading.hosting.usage.graphs.${second}`])
    expect(series.map(s => s.data[0]!.y)).toEqual(values)
    expect(series.map(s => s.data[1]!.y)).toEqual([null, null])
  })

  it('holds no data, so the same options serve every answer (one Apex update per Live tick, review F2)', () => {
    const empty = JSON.stringify(graphOptions(() => null, graphConfig('disk-throughput'), t, colors))
    expect(JSON.stringify(graphOptions(() => metrics, graphConfig('disk-throughput'), t, colors))).toBe(empty)
  })

  it('does not share axis objects between two charts', () => {
    const a = graphOptions(() => metrics, config, t, colors)
    const b = graphOptions(() => metrics, config, t, colors)
    expect(a.xaxis).not.toBe(b.xaxis)
    expect(a.yaxis).not.toBe(b.yaxis)
  })
})

describe('x axis labels and tooltip', () => {
  const t = (key: string) => key
  const colors = { axisLabel: '#111111', grid: '#222222', series: ['#333333', '#444444'] as [string, string] }
  const metrics = [{ period: '2026-11-09 15:13:30', cpu_percent: 1 }, { period: '2026-11-09 15:14:00', cpu_percent: 2 }]

  it('shows HH:mm:ss for Live and HH:mm for 1 hour and 12 hours', () => {
    expect(formatAxisLabel('2026-11-09 15:13:30', { period: 'last-5-minutes' })).toBe('15:13:30')
    expect(formatAxisLabel('2026-11-09 15:13:30', { period: 'last-hour' })).toBe('15:13')
    expect(formatAxisLabel('2026-11-09 15:13:30', { period: 'last-12-hours' })).toBe('15:13')
    expect(formatAxisLabel('2026-11-09 15:13', { period: 'last-5-minutes' })).toBe('15:13')
  })

  it('leaves a value without a time as it is', () => {
    expect(formatAxisLabel('2026-11-09')).toBe('2026-11-09')
  })

  it('wires the formatter into the options', () => {
    const options = graphOptions(() => metrics, graphConfig('cpu-percent'), t, colors, { period: 'last-hour' })
    const labels = options.xaxis?.labels as { formatter: (v: string) => string, hideOverlappingLabels: boolean }
    expect(labels.hideOverlappingLabels).toBe(true)
    expect(labels.formatter('2026-11-09 15:13:30')).toBe('2026-11-09 15:13') // first point carries the date
    expect(labels.formatter('2026-11-09 15:14:00')).toBe('15:14')
  })

  it('reads the buckets when a label is drawn, so a new answer moves the date without new options', () => {
    let current: typeof metrics = metrics
    const options = graphOptions(() => current, graphConfig('cpu-percent'), t, colors, { period: 'last-hour' })
    const format = (options.xaxis?.labels as { formatter: (v: string) => string }).formatter
    expect(format('2026-11-09 15:13:30')).toBe('2026-11-09 15:13')
    current = [{ period: '2026-11-09 15:14:00', cpu_percent: 2 }, { period: '2026-11-09 15:14:30', cpu_percent: 3 }]
    expect(format('2026-11-09 15:14:00')).toBe('2026-11-09 15:14')
    expect(format('2026-11-09 15:14:30')).toBe('15:14')
  })

  it('formats the tooltip with the full date in the settings format and the seconds', () => {
    expect(formatTooltipDate('2026-11-09 15:13:30')).toBe('2026-11-09 15:13:30')
    expect(formatTooltipDate('2026-11-09 15:13:30', { dateFormat: 'DD.MM.YYYY' })).toBe('09.11.2026 15:13:30')
  })

  it('adds the date to the first point and the first point of a new day (12 h over midnight)', () => {
    const across = [
      { period: '2026-11-09 23:00:00', cpu_percent: 1 },
      { period: '2026-11-09 23:30:00', cpu_percent: 1 },
      { period: '2026-11-10 00:00:00', cpu_percent: 1 },
      { period: '2026-11-10 00:30:00', cpu_percent: 1 },
    ]
    expect([...datePeriods(across)]).toEqual(['2026-11-09 23:00:00', '2026-11-10 00:00:00'])
    const options = graphOptions(() => across, graphConfig('cpu-percent'), t, colors, { period: 'last-12-hours', dateFormat: 'DD.MM.YYYY' })
    const format = (options.xaxis?.labels as { formatter: (v: string) => string }).formatter
    expect(format('2026-11-09 23:00:00')).toBe('09.11.2026 23:00')
    expect(format('2026-11-09 23:30:00')).toBe('23:30')
    expect(format('2026-11-10 00:00:00')).toBe('10.11.2026 00:00')
    expect(format('2026-11-10 00:30:00')).toBe('00:30')
  })
})

describe('tooltip', () => {
  const t = (key: string) => key
  const colors = { axisLabel: '#111111', grid: '#222222', series: ['#333333', '#444444'] as [string, string] }
  const metrics = [{ period: '2026-11-09 15:13:30', cpu_percent: 1 }, { period: '2026-11-09 15:14:00', cpu_percent: 2 }]

  it('builds the time row and one row per series with a dot class and a bold value', () => {
    const html = tooltipHtml({ time: '09:00', rows: [{ name: 'Read', value: '1 iops' }, { name: 'Write', value: '2 iops' }] })
    expect(html).toContain('<div class="usage-tip__time">09:00</div>')
    expect(html).toContain('<span class="usage-tip__dot usage-tip__dot--0"></span>Read<b>1 iops</b>')
    expect(html).toContain('<span class="usage-tip__dot usage-tip__dot--1"></span>Write<b>2 iops</b>')
    expect(html).not.toContain('style=')
  })

  it('escapes the time, the names and the values', () => {
    const html = tooltipHtml({ time: '<i>t</i>', rows: [{ name: '<script>x</script>', value: '"1" & 2' }] })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<i>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('takes the time from a full period, and by index when the value is not one (a shown label)', () => {
    expect(tooltipTime('2026-11-09 15:14:00', 0, metrics)).toBe('2026-11-09 15:14:00')
    expect(tooltipTime(undefined, 1, metrics, { dateFormat: 'DD/MM/YYYY' })).toBe('09/11/2026 15:14:00')
    expect(tooltipTime(2, 0, metrics)).toBe('2026-11-09 15:13:30')
  })

  it('builds the custom tooltip from the series and reads "No Data" for null', () => {
    const options = graphOptions(() => metrics, graphConfig('disk-iops'), t, colors)
    const custom = options.tooltip?.custom as (ctx: unknown) => string
    const html = custom({
      series: [[5, 7], [null, 9]],
      dataPointIndex: 0,
      w: { globals: { seriesNames: ['Read', 'Write'], categoryLabels: [] } },
    })
    expect(html).toContain('2026-11-09 15:13:30')
    expect(html).toContain('Read<b>5 iops</b>')
    expect(html).toContain('Write<b>heading.hosting.usage.graphs.noData</b>')
  })

  it('finds the tooltip time in the buckets of the moment it opens', () => {
    let current: typeof metrics = metrics
    const options = graphOptions(() => current, graphConfig('cpu-percent'), t, colors)
    const custom = options.tooltip?.custom as (ctx: unknown) => string
    current = [{ period: '2026-11-09 16:00:00', cpu_percent: 4 }]
    const html = custom({ series: [[4]], dataPointIndex: 0, w: { globals: { seriesNames: ['Usage'], categoryLabels: ['16:00'] } } })
    expect(html).toContain('2026-11-09 16:00:00')
  })
})
