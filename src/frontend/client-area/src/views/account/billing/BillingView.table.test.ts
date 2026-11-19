import type { HomeResponse } from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import { mountKit } from '@/test/mount-kit'
import * as billingApi from './billing.api'
import BillingView from './BillingView.vue'

vi.mock('./billing.api', () => ({
  getBilling: vi.fn(),
  getInvoicePaymentUrl: vi.fn(),
  invoiceDownloadUrl: (id: number | string) => `https://api.test/api/billing/invoices/${id}/download`,
}))

function makeInvoices (count: number): billingApi.Invoice[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1
    return {
      id,
      number: `INV-${id}`,
      date: `2026-01-${String(id).padStart(2, '0')}`,
      duedate: '2999-01-01',
      total: id * 10,
      total_formatted: `$${id * 10}.00`,
      status: 'Paid',
    }
  })
}

function makeDetails (invoices: billingApi.Invoice[]): billingApi.BillingDetails {
  return {
    firstname: 'Jan',
    lastname: 'Kowalski',
    companyname: 'Acme',
    address1: 'Main 1',
    postcode: '00-001',
    city: 'Warsaw',
    state: 'Mazovia',
    country: 'PL',
    invoices,
  }
}

function makeHome (services: unknown[] = []): HomeResponse {
  return { app: { billing_enabled: true }, user: { services } } as unknown as HomeResponse
}

async function mountBilling (home: HomeResponse = makeHome()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().home = home
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] })
  const wrapper = await mountKit(BillingView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

type Wrapper = Awaited<ReturnType<typeof mountBilling>>['wrapper']

/** The table rows as their number cell text (the first column). */
function rowNumbers (wrapper: Wrapper): string[] {
  return wrapper.findAll('tbody tr').map(row => row.find('td')!.text())
}

function numbers (from: number, to: number): string[] {
  const result: string[] = []
  for (let id = from; id >= to; id--) {
    result.push(`INV-${id}`)
  }
  return result
}

async function goToPage (wrapper: Wrapper, page: number): Promise<void> {
  const button = wrapper.findAll('.v-pagination__item button').find(item => item.text() === String(page))!
  await button.trigger('click')
  await flushPromises()
}

async function search (wrapper: Wrapper, term: string): Promise<void> {
  wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', term)
  await flushPromises()
}

describe('BillingView invoices table', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.resetAllMocks()
    vi.mocked(billingApi.getBilling).mockResolvedValue(makeDetails(makeInvoices(25)))
  })

  afterEach(() => {
    window.innerWidth = width
    vi.useRealTimers()
  })

  it('sorts by number descending and shows 10 rows with a pager of 3 pages', async () => {
    // date and total run against id, so only a sort by id gives INV-25…16
    const invoices = makeInvoices(25).map(invoice => {
      const reversed = 26 - Number(invoice.id)
      return { ...invoice, date: `2026-01-${String(reversed).padStart(2, '0')}`, total: reversed * 10 }
    })
    vi.mocked(billingApi.getBilling).mockResolvedValue(makeDetails(invoices))
    const { wrapper } = await mountBilling()

    expect(rowNumbers(wrapper)).toEqual(numbers(25, 16))
    const pages = wrapper.findAll('.v-pagination__item').map(item => item.text())
    expect(pages).toEqual(['1', '2', '3'])
  })

  // The pager reaches invoices from the 11th on, and every page change refetches.
  it('opens page 2 through the pager, refetches and keeps page 2 after the refetch', async () => {
    const { wrapper } = await mountBilling()
    expect(billingApi.getBilling).toHaveBeenCalledTimes(1)

    await goToPage(wrapper, 2)

    expect(billingApi.getBilling).toHaveBeenCalledTimes(2)
    expect(rowNumbers(wrapper)).toEqual(numbers(15, 6))
  })

  it('keeps page 2 and the previous invoices with an alert when the refetch fails', async () => {
    const { wrapper, alerts } = await mountBilling()
    vi.mocked(billingApi.getBilling).mockRejectedValueOnce(new Error('boom'))

    await goToPage(wrapper, 2)

    expect(rowNumbers(wrapper)).toEqual(numbers(15, 6))
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.find('[data-testid="billing-empty"]').exists()).toBe(false)
  })

  // A search without matches shows the no-results container and "Clear filters" resets the search.
  it('shows no-results for a search without matches and clears the search from it', async () => {
    const { wrapper } = await mountBilling()

    await search(wrapper, 'nobody-has-this')

    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    expect(wrapper.find('[data-testid="billing-empty"]').exists()).toBe(false)

    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')
    await flushPromises()

    expect(wrapper.findComponent(DataIteratorFilterControls).props('searchTerm')).toBe('')
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(false)
    expect(rowNumbers(wrapper)).toEqual(numbers(25, 16))
  })

  it('searches the raw total but not the formatted one', async () => {
    const { wrapper } = await mountBilling()

    await search(wrapper, '250')
    expect(rowNumbers(wrapper)).toEqual(['INV-25'])

    await search(wrapper, '$250')
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
  })

  it('shows a skeleton without the sort row while loading', async () => {
    vi.mocked(billingApi.getBilling).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountBilling()

    expect(wrapper.find('.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.v-data-table tbody.item').exists()).toBe(true)
    expect(wrapper.find('.v-data-table thead.sort').exists()).toBe(true)
  })

  it('shows the mobile skeleton at lgAndDown', async () => {
    window.innerWidth = 800
    vi.mocked(billingApi.getBilling).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountBilling()

    expect(wrapper.findAll('.mobile-item')).toHaveLength(5)
  })

  it('marks only an Unpaid invoice past its due date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 23, 12))
    const invoices = makeInvoices(25)
    invoices[24] = { ...invoices[24]!, status: 'Unpaid', duedate: '2026-10-01' }
    invoices[23] = { ...invoices[23]!, status: 'Unpaid', duedate: '2026-11-01' }
    invoices[22] = { ...invoices[22]!, status: 'Paid', duedate: '2026-10-01' }
    vi.mocked(billingApi.getBilling).mockResolvedValue(makeDetails(invoices))

    const { wrapper } = await mountBilling()

    const overdue = wrapper.findAll('[data-testid="billing-overdue"]')
    expect(overdue).toHaveLength(1)
    expect(overdue[0]!.text()).toContain('2026-10-01')
    expect(overdue[0]!.find('.mdi, .v-icon').exists()).toBe(true)
  })

  it('shows the formatted total, the number with an id fallback and the status label', async () => {
    const invoices = makeInvoices(2)
    invoices[1] = { ...invoices[1]!, number: null, status: 'Unpaid' }
    vi.mocked(billingApi.getBilling).mockResolvedValue(makeDetails(invoices))

    const { wrapper } = await mountBilling()

    expect(rowNumbers(wrapper)).toEqual(['2', 'INV-1'])
    const cells = wrapper.findAll('tbody tr')[0]!.findAll('td').map(cell => cell.text())
    expect(cells[3]).toBe('$20.00')
    expect(cells[4]).toBe('unpaid')
  })

  // The refetch quirk kept from legacy: `data: null` after the invoices keeps the table and switches the card for good.
  describe('card after a refetch with data: null', () => {
    async function mountThenNull (home: HomeResponse) {
      const mounted = await mountBilling(home)
      vi.mocked(billingApi.getBilling).mockResolvedValueOnce(null)
      await goToPage(mounted.wrapper, 2)
      return mounted
    }

    it('shows the first payment info and stays there after a refetch with data', async () => {
      const { wrapper } = await mountThenNull(makeHome())

      expect(rowNumbers(wrapper)).toEqual(numbers(15, 6))
      expect(wrapper.get('[data-testid="billing-no-account"]').text()).toBe('heading.billing.details.firstPaymentInfo')
      expect(wrapper.find('[data-testid="billing-details"] ul').exists()).toBe(false)

      await goToPage(wrapper, 3)

      expect(wrapper.find('[data-testid="billing-no-account"]').exists()).toBe(true)
      expect(rowNumbers(wrapper)).toEqual(numbers(5, 1))
    })

    it('shows the trial info with an Upgrade button for a trial service with a link', async () => {
      const { wrapper } = await mountThenNull(makeHome([{ status: 'active', is_trial: true, plan_upgrade_link: 'https://upgrade.test/plan' }]))

      const card = wrapper.get('[data-testid="billing-no-account"]')
      expect(card.text()).toContain('heading.billing.details.trialInfo')
      expect(card.get('a').attributes('href')).toBe('https://upgrade.test/plan')
    })

    it('shows the trial info without a button for a trial service without a link', async () => {
      const { wrapper } = await mountThenNull(makeHome([{ status: 'active', is_trial: true }]))

      const card = wrapper.get('[data-testid="billing-no-account"]')
      expect(card.text()).toContain('heading.billing.details.trialInfo')
      expect(card.find('a').exists()).toBe(false)
    })
  })
})

// Characterization before the data table move: behavior only.
describe('BillingView invoices table (kit-data-table-account-reseller)', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.resetAllMocks()
    vi.mocked(billingApi.getBilling).mockResolvedValue(makeDetails(makeInvoices(25)))
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('re-sorts through the header and refetches on each click', async () => {
    const { wrapper } = await mountBilling()
    expect(rowNumbers(wrapper)[0]).toBe('INV-25')

    await wrapper.get('tr.custom-sort .item--total .custom-sort__item').trigger('click')
    await flushPromises()
    await wrapper.get('tr.custom-sort .item--total .custom-sort__item').trigger('click')
    await flushPromises()

    expect(rowNumbers(wrapper)[0]).toBe('INV-1')
    // Mount plus one request per sort click (current behavior).
    expect(billingApi.getBilling).toHaveBeenCalledTimes(3)
  })

  it('marks every row with billing-row', async () => {
    const { wrapper } = await mountBilling()

    expect(wrapper.findAll('[data-testid="billing-row"]')).toHaveLength(10)
  })

  it('keeps the footer with its testid', async () => {
    const { wrapper } = await mountBilling()

    expect(wrapper.find('[data-testid="billing-footer"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="billing-footer"] .v-pagination').exists()).toBe(true)
  })
})
