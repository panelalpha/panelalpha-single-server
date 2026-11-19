import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const read = (file: string) => readFileSync(join(here, file), 'utf8')

const view = read('MonitoringView.vue')
const monitoring = read('monitoring.ts')
const cardFiles = readdirSync(join(here, 'cards')).filter(file => file.endsWith('.vue'))
const cards = cardFiles.map(file => readFileSync(join(here, 'cards', file), 'utf8'))
const sources = [view, monitoring, ...cards]

// Legacy copy namespaces the Monitoring screen may use. Anything else (a `monitoring.*` or `instance.monitoring.*` key of its own) is a
// per-screen key, which the port does not add.
const LEGACY_PREFIXES = ['heading.', 'message.', 'form.', 'button.', 'general.', 'period.']

describe('monitoring legacy i18n keys', () => {
  it('uses the legacy frame title and the visitors card title', () => {
    expect(view).toContain(`t('heading.instance.siteDetails.analytics.title')`)
    expect(view).toContain(`t('heading.instance.monitoring.chart.visitors')`)
  })

  it('uses the legacy empty-state copy', () => {
    expect(view).toContain(`t('message.emptyTable.monitoring.title')`)
    expect(view).toContain(`t('message.emptyTable.monitoring.description')`)
  })

  it('uses the legacy breakdown title keys, in the table of cards', () => {
    for (const key of [
      'heading.instance.monitoring.chart.visits.country',
      'heading.instance.monitoring.chart.visits.page',
      'heading.instance.monitoring.chart.visits.continent',
      'heading.instance.monitoring.chart.visits.region',
      'heading.instance.monitoring.chart.visits.referrer',
      'heading.instance.monitoring.chart.visits.device',
      'heading.instance.monitoring.chart.visits.deviceBrand',
      'heading.instance.monitoring.chart.visits.os',
      'heading.instance.monitoring.chart.visits.browser',
    ]) {
      expect(monitoring).toContain(`'${key}'`)
    }
  })

  it('takes the period labels from the shared analytics keys', () => {
    expect(read('../../../../entities/project/instance-analytics.ts')).toContain(`'period.lastWeek'`)
  })

  it('uses only legacy copy namespaces in translation calls', () => {
    const keys = sources.flatMap(source => [...source.matchAll(/\bt\(\s*['"`]([^'"`]+)['"`]/g)].map(match => match[1]))
    expect(keys.length).toBeGreaterThan(0)
    const foreign = keys.filter(key => !LEGACY_PREFIXES.some(prefix => key.startsWith(prefix)))
    expect(foreign).toEqual([])
  })

  it('does not define a copy key of its own for the screen', () => {
    for (const source of sources) {
      expect(source).not.toMatch(/['"`](monitoring|instance\.monitoring)\.[a-zA-Z]+['"`]/)
    }
  })
})
