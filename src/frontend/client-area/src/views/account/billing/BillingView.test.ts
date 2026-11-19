import type { HomeResponse } from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as billingApi from './billing.api'
import BillingView from './BillingView.vue'

vi.mock('./billing.api', () => ({
  getBilling: vi.fn(),
  getInvoicePaymentUrl: vi.fn(),
  invoiceDownloadUrl: (id: number | string) => `https://api.test/api/billing/invoices/${id}/download`,
}))

function makeHome (app: Record<string, unknown> = {}): HomeResponse {
  return { app: { billing_enabled: true, ...app }, user: { services: [] } } as unknown as HomeResponse
}

async function mountBilling (home: HomeResponse | null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.home = home
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] })
  const push = vi.spyOn(router, 'push')
  const wrapper = await mountKit(BillingView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, push, alerts: useAlertsStore() }
}

describe('BillingView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('redirects to /instances without a request when billing is disabled (app)', async () => {
    const { push } = await mountBilling(makeHome({ billing_enabled: false }))

    expect(push).toHaveBeenCalledWith('/instances')
    expect(billingApi.getBilling).not.toHaveBeenCalled()
  })

  it('redirects to /projects without a request when billing is disabled (single server)', async () => {
    const { push } = await mountBilling(makeHome({ billing_enabled: false, single_server: { active: true } }))

    expect(push).toHaveBeenCalledWith('/projects')
    expect(billingApi.getBilling).not.toHaveBeenCalled()
  })

  it('shows the title and the empty view for an empty invoice list', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue({ firstname: 'Jan', invoices: [] } as unknown as billingApi.BillingDetails)
    const { wrapper, push } = await mountBilling(makeHome())

    expect(push).not.toHaveBeenCalled()
    expect(billingApi.getBilling).toHaveBeenCalledTimes(1)
    expect(wrapper.get('h1').text()).toBe('heading.billing.title')
    expect(wrapper.find('[data-testid="billing-empty"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="billing-empty-back"]').attributes('href')).toBe('/instances')
  })

  it('shows the empty view for data: null', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue(null)
    const { wrapper } = await mountBilling(makeHome())

    expect(wrapper.find('[data-testid="billing-empty"]').exists()).toBe(true)
  })

  it('shows the empty view and an alert when the request fails', async () => {
    vi.mocked(billingApi.getBilling).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountBilling(makeHome())

    expect(wrapper.find('[data-testid="billing-empty"]').exists()).toBe(true)
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
  })

  it('leaves the empty view for the content once invoices arrive', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue({
      firstname: 'Jan',
      invoices: [{ id: 1, date: '2026-01-01', duedate: '2026-01-15', total: 10, total_formatted: '$10.00', status: 'Paid' }],
    } as unknown as billingApi.BillingDetails)
    const { wrapper } = await mountBilling(makeHome())

    expect(wrapper.find('[data-testid="billing-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="billing-content"]').exists()).toBe(true)
  })

  it('shows a progress bar in the card while the request is pending', async () => {
    vi.mocked(billingApi.getBilling).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountBilling(makeHome())

    const card = wrapper.get('[data-testid="billing-details"]')
    expect(card.find('.v-card-text .v-progress-linear').exists()).toBe(true)
    expect(card.find('ul').exists()).toBe(false)
  })

  it('shows the customer details in the card', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue({
      firstname: 'Jan',
      lastname: 'Kowalski',
      companyname: 'Acme',
      address1: 'Main 1',
      postcode: '00-001',
      city: 'Warsaw',
      state: 'Mazovia',
      country: 'PL',
      invoices: [{ id: 1, date: '2026-01-01', duedate: '2026-01-15', total: 10, total_formatted: '$10.00', status: 'Paid' }],
    })
    const { wrapper } = await mountBilling(makeHome())

    const card = wrapper.get('[data-testid="billing-details"]')
    expect(card.text()).toContain('heading.billing.details.title')
    expect(card.findAll('li').map(li => li.text())).toEqual(['Acme', 'Jan Kowalski', 'Main 1', '00-001 Warsaw', 'Mazovia'])
    expect(card.find('.v-card-text .v-progress-linear').exists()).toBe(false)
  })
})
