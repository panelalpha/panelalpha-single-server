// Frame of the General cards: the column, the card, the title and the actions. Written on the hand-made
// cards, kept green on `InfoCard`. The behaviour of the cards: InstallationInfoCard.test.ts, SourceInfoCards.test.ts.
import type { RawInstance } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { PRIVILEGES } from '@/entities/privileges/privileges'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import GeneralCardSkeleton from './GeneralCardSkeleton.vue'
import InstallationInfoCard from './InstallationInfoCard.vue'
import InstanceAnalyticsCardSystem from './InstanceAnalyticsCardSystem.vue'
import InstanceAnalyticsCardVisitors from './InstanceAnalyticsCardVisitors.vue'
import LoadingSpeedInfoCard from './LoadingSpeedInfoCard.vue'
import SiteDetailsInfoCard from './SiteDetailsInfoCard.vue'

// The quarter column of the General grid (`cols="12" sm="6" md="6" xl="3"`).
const QUARTER = ['v-col--cols-12', 'v-col--cols-sm-6', 'v-col--cols-md-6', 'v-col--cols-xl-3']

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 3,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    status: 'active',
    version: '6.5.1',
    privileges: [PRIVILEGES.WORDPRESS_UPDATE, PRIVILEGES.MANAGE_PLUGINS],
    labels: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function withHome (home: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome(home as never)
  return pinia
}

const metric = { series: { labels: [], datasets: [[]] }, current: '0', delta: null }
const stubs = { ApexChart: true, ProgressSpeedChart: true }

describe('General info cards frame (kit-page-frame)', () => {
  it('Installation: a quarter column, an elevated card with the title and the actions row', async () => {
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance: toInstanceResource(raw()) } })

    expect(wrapper.get('.responsive-card').classes()).toEqual(expect.arrayContaining(QUARTER))
    expect(wrapper.get('.v-card').classes()).toContain('elevation-4')
    expect(wrapper.get('.v-card-title').text()).toBe('heading.instance.siteDetails.installation.title')
    expect(wrapper.find('.v-card-actions .v-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Site details: a quarter column, a card without a title, the overlay buttons and the no-preview text', async () => {
    const pinia = withHome({ app: {} })
    const wrapper = await mountKit(SiteDetailsInfoCard, { props: { instance: toInstanceResource(raw()) }, global: { plugins: [pinia] } })

    expect(wrapper.get('.responsive-card').classes()).toEqual(expect.arrayContaining(QUARTER))
    expect(wrapper.get('.site-details-card').classes()).toContain('v-card')
    expect(wrapper.find('.v-card-title').exists()).toBe(false)
    expect(wrapper.get('.visit-button').text()).toBe('button.openProject')
    expect(wrapper.text()).toContain('message.notPreview.title')
    wrapper.unmount()
  })

  it('Loading speed: the title with the full report link when PageSpeed is on', async () => {
    const pinia = withHome({ app: { page_speed_enabled: true } })
    const wrapper = await mountKit(LoadingSpeedInfoCard, {
      props: { instance: toInstanceResource(raw()) },
      global: { plugins: [pinia], stubs },
    })

    expect(wrapper.get('.responsive-card').classes()).toEqual(expect.arrayContaining(QUARTER))
    const title = wrapper.get('.v-card-title')
    expect(title.text()).toContain('heading.instance.siteDetails.loadingSpeed.title')
    expect(title.get('a.full-report-link').attributes('href')).toBe('https://pagespeed.web.dev/report?url=https%3A%2F%2Facme.example.com')
    wrapper.unmount()
  })

  it('Loading speed: no report link and the disabled text without PageSpeed and without a score', async () => {
    const pinia = withHome({ app: {} })
    const wrapper = await mountKit(LoadingSpeedInfoCard, {
      props: { instance: toInstanceResource(raw()) },
      global: { plugins: [pinia], stubs },
    })

    expect(wrapper.get('.v-card-title').text()).toBe('heading.instance.siteDetails.loadingSpeed.title')
    expect(wrapper.find('.full-report-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('heading.instance.siteDetails.loadingSpeed.disabled')
    wrapper.unmount()
  })

  it('Loading speed: single server without the flag and without a score shows the illustration, not the rings, and keeps the report link', async () => {
    const pinia = withHome({ app: { page_speed_enabled: false, single_server: { active: true } } })
    const wrapper = await mountKit(LoadingSpeedInfoCard, {
      props: { instance: toInstanceResource(raw()) },
      global: { plugins: [pinia], stubs },
    })

    expect(wrapper.find('progress-speed-chart-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('heading.instance.siteDetails.loadingSpeed.disabled')
    expect(wrapper.find('a.full-report-link').exists()).toBe(true)
    expect(wrapper.find('.p-4 a.text-primary').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Loading speed: PageSpeed on without a score shows the two rings and the disabled text; a score shows both labels', async () => {
    const pinia = withHome({ app: { page_speed_enabled: true, single_server: { active: true } } })
    const wrapper = await mountKit(LoadingSpeedInfoCard, {
      props: { instance: toInstanceResource(raw()) },
      global: { plugins: [pinia], stubs },
    })

    expect(wrapper.findAll('progress-speed-chart-stub')).toHaveLength(2)
    expect(wrapper.text()).toContain('heading.instance.siteDetails.loadingSpeed.disabled')
    wrapper.unmount()

    const scored = await mountKit(LoadingSpeedInfoCard, {
      props: { instance: toInstanceResource(raw({ performance_score: { desktop: 0.95, mobile: 0.4 } } as Partial<RawInstance>)) },
      global: { plugins: [withHome({ app: { page_speed_enabled: false, single_server: { active: true } } })], stubs },
    })
    expect(scored.findAll('progress-speed-chart-stub')).toHaveLength(2)
    expect(scored.text()).toContain('heading.instance.siteDetails.loadingSpeed.desktop')
    expect(scored.text()).toContain('heading.instance.siteDetails.loadingSpeed.mobile')
    scored.unmount()
  })

  it('Analytics visitors: a half column; the class and the test id sit on the card', async () => {
    const wrapper = await mountKit(InstanceAnalyticsCardVisitors, {
      props: { loading: false, unique: metric, session: metric },
      global: { stubs },
    })

    expect(wrapper.get('.responsive-card').classes()).toEqual(expect.arrayContaining(['v-col--cols-12', 'v-col--cols-xl-6']))
    const card = wrapper.get('[data-testid="instance-analytics-visitors"]')
    expect(card.classes()).toEqual(expect.arrayContaining(['v-card', 'analytics-card', 'analytics-card--visitors']))
    expect(card.find('.v-card-text .v-tabs').exists()).toBe(true)
    expect(wrapper.find('.v-card-title').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Analytics system: half beside the visitors card, full width without it, a skeleton while loading', async () => {
    const half = await mountKit(InstanceAnalyticsCardSystem, {
      props: { loading: false, metric, reportProviderEnabled: true },
      global: { stubs },
    })
    expect(half.get('.responsive-card').classes()).toContain('v-col--cols-xl-6')
    expect(half.get('[data-testid="instance-analytics-system"]').classes()).toEqual(expect.arrayContaining(['v-card', 'analytics-card--system']))
    half.unmount()

    const full = await mountKit(InstanceAnalyticsCardSystem, {
      props: { loading: true, metric, reportProviderEnabled: false },
      global: { stubs },
    })
    expect(full.get('.responsive-card').classes()).toContain('v-col--cols-12')
    expect(full.get('.responsive-card').classes()).not.toContain('v-col--cols-xl-6')
    expect(full.find('[data-testid="instance-analytics-system"] .v-skeleton-loader').exists()).toBe(true)
    expect(full.find('[data-testid="instance-analytics-system"] .v-card-text').exists()).toBe(false)
    full.unmount()
  })

  it('Skeleton: every variant is a quarter column with an elevated card and no title', async () => {
    for (const variant of ['installation', 'siteDetails', 'security', 'loadingSpeed'] as const) {
      const wrapper = await mountKit(GeneralCardSkeleton, { props: { variant } })

      expect(wrapper.get('.responsive-card').classes()).toEqual(expect.arrayContaining(QUARTER))
      expect(wrapper.get('.v-card').classes()).toContain('elevation-4')
      expect(wrapper.find('.v-card .skeleton-loader').exists()).toBe(true)
      expect(wrapper.find('.v-card-title').exists()).toBe(false)
      wrapper.unmount()
    }
  })
})
