import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VSelect } from 'vuetify/components'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard } from '@/views/hosting/dialog-shell.fixtures'
import { modalFieldName } from '@/views/hosting/email-addresses/email-account-modals'
import { resetEmailRecordsCache } from '@/views/hosting/email-domain-records'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { resolveTxt } from '@/entities/domain/dns-google'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { fromNow } from '@/shared/time/from-now'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import DataTable from '@/shared/ui/data-table/DataTable.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import EmailForwardersView from './EmailForwardersView.vue'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  apiBaseUrl: () => '/api',
}))

vi.mock('@/entities/domain/dns-google', () => ({
  resolveTxt: vi.fn(),
}))

const DOMAINS_URL = '/services/1/email/domains'
const FORWARDERS_URL = '/services/1/email/domains/1/forwarders'
const SECOND_FORWARDERS_URL = '/services/1/email/domains/2/forwarders'

function domainsBody () {
  return {
    data: [
      { id: 1, domain: 'example.com', dkim_records: [], spf_records: [] },
      { id: 2, domain: 'shop.example.com', dkim_records: [], spf_records: [] },
    ],
    meta: { is_email_dns_records_showed: false },
  }
}

const forwarders = [
  { email: 'info@example.com', forward_to: 'me@mail.com', updated_at: '2026-09-20T10:00:00.000Z' },
  { email: 'sales@example.com', forward_to: 'team+sales@mail.com', updated_at: null },
]

/** Answers every `api.get` by its url; a value that is a function is called per request (for a pending or failing answer). */
function answerWith (routes: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    const route = routes[url]
    if (typeof route === 'function') {
      return route()
    }
    if (route === undefined) {
      throw new Error(`unexpected request ${url}`)
    }
    return { data: route }
  })
}

function calledUrls (): string[] {
  return vi.mocked(api.get).mock.calls.map(call => call[0] as string)
}

function deferred<T> () {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

async function mountView (service = makeService()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(EmailForwardersView, { props: { service }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

// The Add/Delete dialog. The first VDialog is the records modal; BasicModal stays mounted after close, so assert the dialog state.
function formDialog (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
  return wrapper.findAllComponents({ name: 'VDialog' })[1]!
}

describe('EmailForwardersView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.clearAllMocks()
    clearAllCachedGet()
    resetEmailRecordsCache()
    vi.mocked(resolveTxt).mockReset()
    answerWith({
      [DOMAINS_URL]: domainsBody(),
      [FORWARDERS_URL]: { data: forwarders },
      [SECOND_FORWARDERS_URL]: { data: [forwarders[1]] },
    })
  })

  afterEach(() => {
    window.innerWidth = width
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a forwarder with the legacy markup', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountView()

    expect(normalizeHtml(wrapper.findAll('tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.email</div><div class="mobile-table-item__value"><span class="bold p-3">info@example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.forwardTo</div><div class="mobile-table-item__value"><span class="bold p-3">me@mail.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailForwarder.delete" data-testid="email-forwarders-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  // Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
  it('renders the Delete icon of a forwarder row with its tooltip unchanged', async () => {
    const { wrapper } = await mountView()

    expect(await iconButtonsSnapshot(wrapper.get('tbody tr'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailForwarder.delete" data-testid="email-forwarders-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.emailForwarder.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('shows the empty state while the domains load, then loads the forwarders of the first domain once they answer', async () => {
    const domains = deferred<unknown>()
    answerWith({
      [DOMAINS_URL]: () => domains.promise.then(value => ({ data: value })),
      [FORWARDERS_URL]: { data: forwarders },
    })

    const wrapper = await mountKit(EmailForwardersView, { props: { service: makeService() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="email-forwarders-empty"]').exists()).toBe(true)
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    expect(calledUrls()).toEqual([DOMAINS_URL])

    domains.resolve(domainsBody())
    await flushPromises()

    expect(calledUrls()).toEqual([DOMAINS_URL, FORWARDERS_URL])
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  it('shows the skeleton while the forwarders load', async () => {
    const pending = deferred<unknown>()
    answerWith({
      [DOMAINS_URL]: domainsBody(),
      [FORWARDERS_URL]: () => pending.promise.then(value => ({ data: value })),
    })

    const { wrapper } = await mountView()
    expect(wrapper.find('.data-table--loading').exists()).toBe(true)
    expect(wrapper.find('[data-testid="email-forwarders-add"]').exists()).toBe(false)

    pending.resolve({ data: forwarders })
    await flushPromises()
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the address, the destination and the relative time of each forwarder, and a dash without a date', async () => {
    const { wrapper } = await mountView()

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('info@example.com')
    expect(rows[0]!.text()).toContain('me@mail.com')
    expect(rows[0]!.text()).toContain(fromNow(forwarders[0]!.updated_at!))
    expect(rows[0]!.text()).not.toContain('-')
    expect(rows[1]!.text()).toContain('sales@example.com')
    expect(rows[1]!.text()).toContain('team+sales@mail.com')
    expect(rows[1]!.text()).toContain('-')
    wrapper.unmount()
  })

  it('does not change the cached domains response the frame shares', async () => {
    const body = domainsBody()
    const before = structuredClone(body)
    answerWith({ [DOMAINS_URL]: body, [FORWARDERS_URL]: { data: forwarders } })

    const { wrapper } = await mountView()

    expect(body).toEqual(before)
    wrapper.unmount()
  })

  it('reloads the forwarders of the chosen domain when the domain changes, and keeps the search term', async () => {
    const { wrapper } = await mountView()
    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'sales')
    await flushPromises()

    wrapper.findComponent(VSelect).vm.$emit('update:modelValue', domainsBody().data[1])
    await flushPromises()

    expect(calledUrls()).toContain(SECOND_FORWARDERS_URL)
    expect(wrapper.findComponent(DataIteratorFilterControls).props('searchTerm')).toBe('sales')
    wrapper.unmount()
  })

  it('shows the search and the Add button only while the list has forwarders', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-testid="email-forwarders-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="email-forwarders-add"]').exists()).toBe(true)
    wrapper.unmount()

    answerWith({ [DOMAINS_URL]: domainsBody(), [FORWARDERS_URL]: { data: [] } })
    const empty = await mountView()
    expect(empty.wrapper.find('[data-testid="email-forwarders-search"]').exists()).toBe(false)
    expect(empty.wrapper.find('[data-testid="email-forwarders-add"]').exists()).toBe(false)
    expect(empty.wrapper.find('[data-testid="email-forwarders-empty"]').exists()).toBe(true)
    expect(empty.wrapper.find('[data-testid="email-forwarders-empty"] svg').exists()).toBe(true)
    expect(empty.wrapper.find('[data-testid="email-forwarders-empty-add"]').exists()).toBe(true)
    empty.wrapper.unmount()
  })

  it('names the Delete icons always; the Add buttons keep their text on mobile and need no aria-label (issue #23)', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.get('[data-testid="email-forwarders-delete"]').attributes('aria-label')).toBe('button.emailForwarder.delete')
    expect(wrapper.get('[data-testid="email-forwarders-add"]').attributes('aria-label')).toBeUndefined()
    wrapper.unmount()

    window.innerWidth = 500
    const { wrapper: mobile } = await mountView()
    expect(mobile.get('[data-testid="email-forwarders-add"]').text()).toBe('button.emailForwarder.add')
    expect(mobile.get('[data-testid="email-forwarders-add"]').attributes('aria-label')).toBeUndefined()
    mobile.unmount()

    answerWith({ [DOMAINS_URL]: domainsBody(), [FORWARDERS_URL]: { data: [] } })
    const { wrapper: mobileEmpty } = await mountView()
    expect(mobileEmpty.get('[data-testid="email-forwarders-empty-add"]').text()).toBe('button.emailForwarder.add')
    mobileEmpty.unmount()
  })

  it('shows the empty state and requests no forwarders when the service has no email domains', async () => {
    answerWith({ [DOMAINS_URL]: { data: [], meta: { is_email_dns_records_showed: false } } })

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="email-forwarders-empty"]').exists()).toBe(true)
    expect(calledUrls()).toEqual([DOMAINS_URL])
    expect(wrapper.find('[data-testid="email-forwarders-search"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the alert and no table when the domains fail', async () => {
    answerWith({ [DOMAINS_URL]: () => Promise.reject(new Error('boom')) })

    const { wrapper, alerts } = await mountView()

    expect(wrapper.find('[data-testid="email-forwarders-table"]').exists()).toBe(false)
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(calledUrls()).not.toContain(FORWARDERS_URL)
    wrapper.unmount()
  })

  it('shows the alert and no table when the forwarders fail', async () => {
    answerWith({ [DOMAINS_URL]: domainsBody(), [FORWARDERS_URL]: () => Promise.reject(new Error('boom')) })

    const { wrapper, alerts } = await mountView()

    expect(wrapper.find('[data-testid="email-forwarders-table"]').exists()).toBe(false)
    expect(alerts.activeAlerts).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the no-results state for a search without a match, and clear-filters brings the list back', async () => {
    const { wrapper } = await mountView()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'zzz-no-match')
    await flushPromises()
    expect(wrapper.find('.no-results-container').exists()).toBe(true)

    wrapper.findComponent(DataTable).vm.$emit('clear-filters')
    await flushPromises()
    expect(wrapper.findComponent(DataTable).props('searchTerm')).toBe('')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  it('reloads the domains when the service changes', async () => {
    const { wrapper } = await mountView()
    expect(calledUrls().filter(url => url === DOMAINS_URL)).toHaveLength(1)

    clearAllCachedGet()
    vi.mocked(api.get).mockClear()
    answerWith({
      '/services/2/email/domains': { data: [{ id: 5, domain: 'other.com', dkim_records: [], spf_records: [] }], meta: { is_email_dns_records_showed: false } },
      '/services/2/email/domains/5/forwarders': { data: [] },
    })
    await wrapper.setProps({ service: makeService({ id: 2 }) })
    await flushPromises()

    expect(calledUrls()).toEqual(['/services/2/email/domains', '/services/2/email/domains/5/forwarders'])
    wrapper.unmount()
  })

  describe('SPF and DKIM records', () => {
    const SPF = { name: 'example.com', type: 'TXT', value: 'v=spf1 -all' }
    const DKIM = { name: 'default._domainkey.example.com', type: 'TXT', value: 'v=DKIM1; p=KEY' }

    function recordsDomains (showed: boolean) {
      return {
        data: [
          { id: 1, domain: 'example.com', dkim_records: [DKIM], spf_records: [SPF] },
          { id: 2, domain: 'shop.example.com', dkim_records: [], spf_records: [] },
        ],
        meta: { is_email_dns_records_showed: showed },
      }
    }

    function answerRecords (showed: boolean) {
      answerWith({
        [DOMAINS_URL]: recordsDomains(showed),
        [FORWARDERS_URL]: { data: forwarders },
        [SECOND_FORWARDERS_URL]: { data: [forwarders[1]] },
      })
    }

    it('hides the chip when the service does not report records, and when there are no domains', async () => {
      vi.mocked(resolveTxt).mockResolvedValue(null)
      answerRecords(false)
      const hidden = await mountView()
      expect(hidden.wrapper.find('.record-configuration').exists()).toBe(false)
      hidden.wrapper.unmount()

      answerWith({ [DOMAINS_URL]: { data: [], meta: { is_email_dns_records_showed: true } } })
      clearAllCachedGet()
      const none = await mountView()
      expect(none.wrapper.find('.record-configuration').exists()).toBe(false)
      none.wrapper.unmount()
    })

    it('shows the chip skeleton while the records are checked', async () => {
      const pending = deferred<string | null>()
      vi.mocked(resolveTxt).mockReturnValue(pending.promise)
      answerRecords(true)

      const { wrapper } = await mountView()
      expect(wrapper.findAll('.record-skeleton')).toHaveLength(2)

      pending.resolve(null)
      await flushPromises()
      expect(wrapper.findAll('.record-skeleton')).toHaveLength(0)
      wrapper.unmount()
    })

    it('shows configured when the DNS answers with the records, and failed with the dot when it does not', async () => {
      vi.mocked(resolveTxt).mockImplementation(async name => ({
        'example.com': 'v=spf1 -all',
        'default._domainkey.example.com': 'v=DKIM1; p=KEY',
      } as Record<string, string>)[name] ?? null)
      answerRecords(true)
      const ok = await mountView()
      expect(ok.wrapper.get('.record-spf .record-label').classes()).toContain('configured')
      expect(ok.wrapper.get('.record-dkim .record-label').classes()).toContain('configured')
      expect(ok.wrapper.find('.v-field .select-dot').exists()).toBe(false)
      ok.wrapper.unmount()

      resetEmailRecordsCache()
      clearAllCachedGet()
      vi.mocked(resolveTxt).mockResolvedValue(null)
      answerRecords(true)
      const bad = await mountView()
      expect(bad.wrapper.get('.record-spf .record-label').classes()).toContain('failed')
      expect(bad.wrapper.find('.v-field .select-main-item .select-dot').exists()).toBe(true)
      bad.wrapper.unmount()
    })

    it('opens the records of the chosen domain from the chip', async () => {
      vi.mocked(resolveTxt).mockResolvedValue(null)
      answerRecords(true)

      const { wrapper } = await mountView()
      await wrapper.get('.record-configuration').trigger('click')
      await flushPromises()

      const modal = document.body.querySelector('.record-configuration-modal')
      expect(modal).not.toBeNull()
      expect(modal!.textContent).toContain('v=spf1 -all')
      expect(modal!.querySelectorAll('.record-box')[1]!.textContent).toContain('v=DKIM1; p=KEY')
      expect(modal!.classList.contains('card-width-560')).toBe(true)

      wrapper.unmount()
      for (const node of document.body.querySelectorAll('.v-overlay-container')) {
        node.remove()
      }
    })

    it('keeps the records of the domains response intact', async () => {
      vi.mocked(resolveTxt).mockResolvedValue(null)
      const body = recordsDomains(true)
      const before = structuredClone(body)
      answerWith({ [DOMAINS_URL]: body, [FORWARDERS_URL]: { data: forwarders } })

      const { wrapper } = await mountView()

      expect(body).toEqual(before)
      expect(body.data[0]!.spf_records).toEqual([SPF])
      wrapper.unmount()
    })
  })

  describe('Add modal', () => {
    const NEW_FORWARDER = { email: 'new@example.com', forward_to: 'me@mail.com', updated_at: null }

    function fieldComponent (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], name: string) {
      return wrapper.findAllComponents(BasicModalField).find(component => modalFieldName(component.props('field') as ModalField) === name)!
    }

    /** Fills the Add form. The text-select emits its merged value (`BasicModalField.setPart`), so the whole value goes in. */
    async function fillAdd (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], email: string, destination: string) {
      fieldComponent(wrapper, 'email').vm.$emit('update:modelValue', { domain: 'example.com', email })
      fieldComponent(wrapper, 'destination').vm.$emit('update:modelValue', destination)
      await flushPromises()
    }

    beforeEach(() => {
      vi.mocked(api.post).mockReset()
    })

    it('Add from the title bar opens the Add modal with the domain selected in the selector', async () => {
      const { wrapper } = await mountView()
      wrapper.findComponent(VSelect).vm.$emit('update:modelValue', domainsBody().data[1])
      await flushPromises()
      await wrapper.get('[data-testid="email-forwarders-add"]').trigger('click')
      await flushPromises()

      const modal = wrapper.findComponent(BasicModal)
      expect(modal.exists()).toBe(true)
      expect(modal.props('title')).toBe('heading.hosting.emailForwarders.modal.add.title')
      expect(modal.classes()).toContain('card-width-560')
      expect(fieldComponent(wrapper, 'email').props('field')).toMatchObject({ suffix: '@', options: [{ value: 'shop.example.com' }] })
      wrapper.unmount()
    })

    it('Add from the empty state opens the same modal', async () => {
      answerWith({ [DOMAINS_URL]: domainsBody(), [FORWARDERS_URL]: { data: [] } })

      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-forwarders-empty-add"]').trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
      wrapper.unmount()
    })

    it('Add with no domain (the empty state of a service without domains) opens nothing and does not throw', async () => {
      answerWith({ [DOMAINS_URL]: { data: [], meta: { is_email_dns_records_showed: false } } })

      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-forwarders-empty-add"]').trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
      expect(api.post).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('Add success posts the forwarder, alerts, reloads the list, closes the modal and highlights the new row for 1 s', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      let saved = false
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [FORWARDERS_URL]: () => ({ data: { data: saved ? [...forwarders, NEW_FORWARDER] : forwarders } }),
      })
      vi.mocked(api.post).mockImplementation(async () => {
        saved = true
        return { data: { success: true } }
      })

      const { wrapper, alerts } = await mountView()
      await wrapper.get('[data-testid="email-forwarders-add"]').trigger('click')
      await flushPromises()
      await fillAdd(wrapper, 'new', 'me@mail.com')

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
      await flushPromises()

      expect(api.post).toHaveBeenCalledWith(FORWARDERS_URL, { domain: 'example.com', email: 'new', destination: 'me@mail.com' })
      expect(calledUrls().filter(url => url === FORWARDERS_URL)).toHaveLength(2)
      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: true })
      expect(formDialog(wrapper).props('modelValue')).toBe(false)
      expect(wrapper.find('tbody tr.highlight').text()).toContain('new@example.com')

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(wrapper.find('tbody tr.highlight').exists()).toBe(false)

      vi.useRealTimers()
      wrapper.unmount()
    })

    it('Add error shows the alert, reloads nothing and keeps the modal open', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('boom'))

      const { wrapper, alerts } = await mountView()
      await wrapper.get('[data-testid="email-forwarders-add"]').trigger('click')
      await flushPromises()
      await fillAdd(wrapper, 'new', 'me@mail.com')

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
      expect(calledUrls().filter(url => url === FORWARDERS_URL)).toHaveLength(1)
      expect(formDialog(wrapper).props('modelValue')).toBe(true)
      expect(formDialog(wrapper).props('persistent')).toBe(false)
      expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(false)
      wrapper.unmount()
    })

    it('Add with an invalid destination is stopped by the form rules: no request, the modal stays open', async () => {
      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-forwarders-add"]').trigger('click')
      await flushPromises()
      await fillAdd(wrapper, 'new', 'abc')

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
      await flushPromises()

      expect(api.post).not.toHaveBeenCalled()
      expect(formDialog(wrapper).props('modelValue')).toBe(true)
      wrapper.unmount()
    })

    it('a second click while the form validates sends only one request', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { success: true } })

      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-forwarders-add"]').trigger('click')
      await flushPromises()
      await fillAdd(wrapper, 'new', 'me@mail.com')

      const modal = wrapper.findComponent(BasicModal)
      modal.vm.$emit('button-click', 'add')
      modal.vm.$emit('button-click', 'add')
      await flushPromises()

      expect(api.post).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })
    it('opens Add after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-forwarders-add"]').trigger('click')
      await flushPromises()

      const overlay = expectOverlayBeforeCard('[data-testid="email-forwarders-modal"]')
      expectLegacyTransition(wrapper)
      await clickOverlay(overlay)

      expect(formDialog(wrapper).props('modelValue')).toBe(false)
      wrapper.unmount()
    })
  })

  describe('Delete modal', () => {
    const DELETE_URL = '/services/1/email/domains/1/forwarders/sales@example.com?forward_to=team%2Bsales%40mail.com'

    beforeEach(() => {
      vi.mocked(api.delete).mockReset()
    })

    async function openDelete (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
      await wrapper.findAll('tbody tr')[1]!.get('[data-testid="email-forwarders-delete"]').trigger('click')
      await flushPromises()
    }

    it('the row bin opens the Delete modal, whose button stays disabled until the checkbox is checked', async () => {
      const { wrapper } = await mountView()
      await openDelete(wrapper)

      const modal = wrapper.findComponent(BasicModal)
      expect(modal.props('title')).toBe('heading.hosting.emailForwarders.modal.delete.title')
      expect(modal.props('confirmRequired')).toBe(true)
      expect(modal.props('confirmed')).toBe(false)
      expect(modal.findAll('.v-card-actions .v-btn')[0]!.classes()).toContain('v-btn--disabled')

      modal.vm.$emit('button-click', 'delete')
      await flushPromises()
      expect(api.delete).not.toHaveBeenCalled()

      wrapper.findAllComponents(BasicModalField)[0]!.vm.$emit('update:modelValue', true)
      await flushPromises()
      expect(wrapper.findComponent(BasicModal).props('confirmed')).toBe(true)
      expect(wrapper.findComponent(BasicModal).findAll('.v-card-actions .v-btn')[0]!.classes()).not.toContain('v-btn--disabled')
      wrapper.unmount()
    })

    it('Delete sends the address unencoded and the destination encoded (a + and an @), then alerts, reloads and closes', async () => {
      vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

      const { wrapper, alerts } = await mountView()
      await openDelete(wrapper)
      wrapper.findAllComponents(BasicModalField)[0]!.vm.$emit('update:modelValue', true)
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
      await flushPromises()

      expect(api.delete).toHaveBeenCalledWith(DELETE_URL)
      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: true })
      expect(calledUrls().filter(url => url === FORWARDERS_URL)).toHaveLength(2)
      expect(formDialog(wrapper).props('modelValue')).toBe(false)
      wrapper.unmount()
    })

    it('Delete error shows the alert and keeps the modal open', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('boom'))

      const { wrapper, alerts } = await mountView()
      await openDelete(wrapper)
      wrapper.findAllComponents(BasicModalField)[0]!.vm.$emit('update:modelValue', true)
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
      expect(calledUrls().filter(url => url === FORWARDERS_URL)).toHaveLength(1)
      expect(formDialog(wrapper).props('modelValue')).toBe(true)
      wrapper.unmount()
    })

    it('the bin works in the mobile layout too', async () => {
      window.innerWidth = 500
      const { wrapper } = await mountView()

      expect(wrapper.findAll('.mobile-table-item__row').length).toBeGreaterThan(0)
      const bin = wrapper.find('[data-testid="email-forwarders-delete"]')
      expect(bin.exists()).toBe(true)
      await bin.trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
      wrapper.unmount()
    })
  })
})

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.clearAllMocks()
    clearAllCachedGet()
    resetEmailRecordsCache()
    vi.mocked(resolveTxt).mockReset()
    answerWith({
      [DOMAINS_URL]: domainsBody(),
      [FORWARDERS_URL]: { data: forwarders },
      [SECOND_FORWARDERS_URL]: { data: [forwarders[1]] },
    })
  })

  afterEach(() => {
    window.innerWidth = width
  })

  const emails = (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) => wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text())

  it('keeps the order of the list until a header is clicked, then sorts and flips the direction', async () => {
    const { wrapper } = await mountView()
    expect(emails(wrapper)).toEqual(['info@example.com', 'sales@example.com'])

    // The first click picks the column; the direction is the one the page starts with (ascending).
    await wrapper.get('tr.custom-sort .item--email .custom-sort__item').trigger('click')
    await nextTick()
    expect(emails(wrapper)).toEqual(['info@example.com', 'sales@example.com'])

    await wrapper.get('tr.custom-sort .item--email .custom-sort__item').trigger('click')
    await nextTick()
    expect(emails(wrapper)).toEqual(['sales@example.com', 'info@example.com'])
    wrapper.unmount()
  })

  it('shows the target address and the updated text of each forwarder in their cells', async () => {
    const { wrapper } = await mountView()

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.findAll('td')[1]!.text()).toBe('me@mail.com')
    expect(rows[0]!.findAll('td')[2]!.text()).toBe(fromNow('2026-09-20T10:00:00.000Z'))
    expect(rows[1]!.findAll('td')[1]!.text()).toBe('team+sales@mail.com')
    wrapper.unmount()
  })

  it('filters by the search term, shows no-results for no match and brings the list back with Clear filters', async () => {
    const { wrapper } = await mountView()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'team+')
    await flushPromises()
    expect(emails(wrapper)).toEqual(['sales@example.com'])

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'zzz')
    await flushPromises()
    expect(wrapper.find('.no-results-container').exists()).toBe(true)

    await wrapper.get('.no-results-container button').trigger('click')
    await flushPromises()
    expect(emails(wrapper)).toHaveLength(2)
    wrapper.unmount()
  })

  it('pages the forwarders by 8 and moves to the second page from the footer', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ email: `user${index + 1}@example.com`, forward_to: 'me@mail.com', updated_at: null }))
    answerWith({ [DOMAINS_URL]: domainsBody(), [FORWARDERS_URL]: { data: many } })
    const { wrapper } = await mountView()

    expect(wrapper.findAll('tbody tr')).toHaveLength(8)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the empty message with no header and no footer for a domain without forwarders', async () => {
    answerWith({ [DOMAINS_URL]: domainsBody(), [FORWARDERS_URL]: { data: [] } })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="email-forwarders-table"] .no-data').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the skeleton while the forwarders load and no rows', async () => {
    answerWith({ [DOMAINS_URL]: domainsBody(), [FORWARDERS_URL]: () => new Promise(() => {}) })
    const { wrapper } = await mountView()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="email-forwarders-delete"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the fields and the Delete action of each forwarder in a card below 976 px', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountView()

    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const cards = wrapper.findAll('tbody tr .mobile-table-item')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.findAll('.mobile-table-item__header').map(label => label.text())).toEqual([
      'table.header.email',
      'table.header.forwardTo',
      'table.header.actions',
    ])
    expect(cards[0]!.text()).toContain('me@mail.com')
    expect(cards[0]!.find('[data-testid="email-forwarders-delete"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
