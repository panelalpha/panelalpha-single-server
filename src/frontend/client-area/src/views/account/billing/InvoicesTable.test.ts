import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import * as billingApi from './billing.api'
import { invoicesHeaders } from './invoices-table'
import InvoicesTable from './InvoicesTable.vue'

vi.mock('./billing.api', () => ({
  getBilling: vi.fn(),
  getInvoicePaymentUrl: vi.fn(),
  invoiceDownloadUrl: (id: number | string) => `https://api.test/api/billing/invoices/${id}/download`,
}))

function makeInvoice (id: number, status: string): billingApi.Invoice {
  return { id, number: `INV-${id}`, date: '2026-01-01', duedate: '2999-01-01', total: id * 10, total_formatted: `$${id * 10}.00`, status }
}

async function mountTable (items: billingApi.Invoice[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(InvoicesTable, {
    props: {
      items,
      loading: false,
      headers: invoicesHeaders(key => key),
      page: 1,
      itemsPerPage: 10,
      possibleItemsPerPage: [[10, 20, 30]],
      sortBy: false,
      sortDesc: false,
      searchTerm: '',
    },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

describe('InvoicesTable actions', () => {
  let open: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    open = vi.spyOn(window, 'open').mockReturnValue(null)
  })

  afterEach(() => {
    open.mockRestore()
  })

  it('shows Pay Now only for Unpaid invoices and Download for all', async () => {
    const { wrapper } = await mountTable([makeInvoice(1, 'Paid'), makeInvoice(2, 'Unpaid'), makeInvoice(3, 'Cancelled')])

    expect(wrapper.findAll('[data-testid="billing-pay-now"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="billing-download"]')).toHaveLength(3)
    expect(wrapper.get('[data-testid="billing-pay-now"]').text()).toBe('button.billing.pay_now')
    // The Pay Now button sits in the row of the Unpaid invoice.
    expect(wrapper.findAll('tbody tr')[1]!.find('[data-testid="billing-pay-now"]').exists()).toBe(true)
  })

  it('opens the payment page for an http(s) URL', async () => {
    vi.mocked(billingApi.getInvoicePaymentUrl).mockResolvedValue('https://pay.test/2')
    const { wrapper, alerts } = await mountTable([makeInvoice(2, 'Unpaid')])

    await wrapper.get('[data-testid="billing-pay-now"]').trigger('click')
    await flushPromises()

    expect(billingApi.getInvoicePaymentUrl).toHaveBeenCalledWith(2)
    expect(open).toHaveBeenCalledWith('https://pay.test/2')
    expect(alerts.activeAlerts).toHaveLength(0)
  })

  it('shows an alert and opens nothing for a URL that is not http(s)', async () => {
    vi.mocked(billingApi.getInvoicePaymentUrl).mockResolvedValue('javascript:alert(1)')
    const { wrapper, alerts } = await mountTable([makeInvoice(2, 'Unpaid')])

    await wrapper.get('[data-testid="billing-pay-now"]').trigger('click')
    await flushPromises()

    expect(open).not.toHaveBeenCalled()
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
  })

  it('shows an alert when the payment-url request fails', async () => {
    vi.mocked(billingApi.getInvoicePaymentUrl).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountTable([makeInvoice(2, 'Unpaid')])

    await wrapper.get('[data-testid="billing-pay-now"]').trigger('click')
    await flushPromises()

    expect(open).not.toHaveBeenCalled()
    expect(alerts.activeAlerts).toHaveLength(1)
  })

  // Quirk kept from legacy: one loader for the whole table.
  it('spins every Pay Now button while one request runs', async () => {
    let resolve: (url: unknown) => void = () => {}
    vi.mocked(billingApi.getInvoicePaymentUrl).mockReturnValue(new Promise(done => {
      resolve = done
    }))
    const { wrapper } = await mountTable([makeInvoice(2, 'Unpaid'), makeInvoice(3, 'Unpaid')])
    const buttons = wrapper.findAll('[data-testid="billing-pay-now"]')
    expect(buttons).toHaveLength(2)
    expect(buttons.some(button => button.classes('v-btn--loading'))).toBe(false)

    await buttons[0]!.trigger('click')

    expect(wrapper.findAll('[data-testid="billing-pay-now"]').map(button => button.classes('v-btn--loading'))).toEqual([true, true])

    resolve('https://pay.test/2')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="billing-pay-now"]').some(button => button.classes('v-btn--loading'))).toBe(false)
  })

  it('names every Download button by its tooltip text', async () => {
    const { wrapper } = await mountTable([makeInvoice(1, 'Paid'), makeInvoice(2, 'Unpaid')])

    const buttons = wrapper.findAll('[data-testid="billing-download"]')
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button.attributes('aria-label')).toBe('Download')
    }
  })

  it('gives the overdue icon an accessible name and keeps it exposed', async () => {
    const { wrapper } = await mountTable([{ ...makeInvoice(2, 'Unpaid'), duedate: '2000-01-01' }])

    const icon = wrapper.get('[data-testid="billing-overdue"] .v-icon')
    expect(icon.attributes('role')).toBe('img')
    expect(icon.attributes('aria-hidden')).not.toBe('true')
    expect(icon.attributes('aria-label')).toBe('tooltip.billing.invoice.duedate.exceeded')
  })

  it('opens the invoice download URL in a new tab', async () => {
    const { wrapper } = await mountTable([makeInvoice(7, 'Paid')])

    await wrapper.get('[data-testid="billing-download"]').trigger('click')

    expect(open).toHaveBeenCalledWith('https://api.test/api/billing/invoices/7/download', '_blank')
  })
})
