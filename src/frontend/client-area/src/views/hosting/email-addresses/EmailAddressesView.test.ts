import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VSelect } from 'vuetify/components'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/views/hosting/dialog-shell.fixtures'
import { resetEmailRecordsCache } from '@/views/hosting/email-domain-records'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { resolveTxt } from '@/entities/domain/dns-google'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import AccountConfigurationDetails from './AccountConfigurationDetails.vue'
import { modalFieldName } from './email-account-modals'
import EmailAddressesView from './EmailAddressesView.vue'

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
const ACCOUNTS_URL = '/services/1/email/domains/1/accounts'
const SECOND_ACCOUNTS_URL = '/services/1/email/domains/2/accounts'

function domainsBody () {
  return {
    data: [
      { id: 1, domain: 'example.com', dkim_records: [], spf_records: [] },
      { id: 2, domain: 'shop.example.com', dkim_records: [], spf_records: [] },
    ],
    meta: { is_email_dns_records_showed: false },
  }
}

const accounts = [
  { email: 'info@example.com', disk_usage: 12, disk_quota: 512, created_at: null, updated_at: '2026-09-20T10:00:00.000Z' },
  { email: 'sales@example.com', disk_usage: 3, disk_quota: 'unlimited', created_at: null, updated_at: null },
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

async function mountView () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(EmailAddressesView, { props: { service: makeService() }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

describe('EmailAddressesView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.clearAllMocks()
    clearAllCachedGet()
    resetEmailRecordsCache()
    answerWith({
      [DOMAINS_URL]: domainsBody(),
      [ACCOUNTS_URL]: { data: accounts },
      [SECOND_ACCOUNTS_URL]: { data: [accounts[1]] },
    })
  })

  afterEach(() => {
    window.innerWidth = width
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of an account with the legacy markup', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountView()

    expect(normalizeHtml(wrapper.findAll('tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.email</div><div class="mobile-table-item__value"><span class="bold p-3">info@example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.usageQuota</div><div class="mobile-table-item__value"><span class="bold p-3">form.value.sizeMB / form.value.sizeMB</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.show"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.logIn"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  // Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
  it('renders the Edit, Details, Delete and Webmail icons of an account row with their tooltips unchanged', async () => {
    const { wrapper } = await mountView()

    expect(await iconButtonsSnapshot(wrapper.get('tbody tr'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.update"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.emailAddress.update</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.show"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.emailAddress.show</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.emailAddress.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.emailAddress.logIn"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.emailAddress.logIn</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('shows the empty state while the domains load, then loads the accounts of the first domain once they answer', async () => {
    let resolveDomains: (value: unknown) => void = () => {}
    answerWith({
      [DOMAINS_URL]: () => new Promise(resolve => {
        resolveDomains = value => resolve({ data: value })
      }),
      [ACCOUNTS_URL]: { data: accounts },
    })

    const wrapper = await mountKit(EmailAddressesView, { props: { service: makeService() }, global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="email-addresses-empty"]').exists()).toBe(true)
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    expect(calledUrls()).toEqual([DOMAINS_URL])

    resolveDomains(domainsBody())
    await flushPromises()

    expect(calledUrls()).toEqual([DOMAINS_URL, ACCOUNTS_URL])
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  it('shows the skeleton while the accounts load', async () => {
    let resolveAccounts: (value: unknown) => void = () => {}
    answerWith({
      [DOMAINS_URL]: domainsBody(),
      [ACCOUNTS_URL]: () => new Promise(resolve => {
        resolveAccounts = value => resolve({ data: value })
      }),
    })

    const { wrapper } = await mountView()
    expect(wrapper.find('.data-table--loading').exists()).toBe(true)
    expect(wrapper.find('[data-testid="email-addresses-add"]').exists()).toBe(false)

    resolveAccounts({ data: accounts })
    await flushPromises()
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the title column width in a class (the 1401 px rule), not an inline style', async () => {
    const { wrapper } = await mountView()

    const column = wrapper.get('[data-testid="email-addresses-title"]').element.closest('.v-col')
    expect(column?.classList.contains('email-addresses-title-col')).toBe(true)
    expect(column?.getAttribute('style') ?? '').toBe('')
    wrapper.unmount()
  })

  it('names the row icons always; the Add buttons keep their text on mobile and need no aria-label (issue #23)', async () => {
    const { wrapper } = await mountView()
    const icons = wrapper.findAll('tbody tr')[0]!.findAll('.actions-row .v-btn')

    expect(icons.map(icon => icon.attributes('aria-label'))).toEqual([
      'button.emailAddress.update',
      'button.emailAddress.show',
      'button.emailAddress.delete',
      'button.emailAddress.logIn',
    ])
    expect(wrapper.get('[data-testid="email-addresses-add"]').attributes('aria-label')).toBeUndefined()
    wrapper.unmount()

    window.innerWidth = 375
    const mobile = await mountView()
    expect(mobile.wrapper.get('[data-testid="email-addresses-add"]').text()).toBe('Add Address')
    expect(mobile.wrapper.get('[data-testid="email-addresses-add"]').attributes('aria-label')).toBeUndefined()
    mobile.wrapper.unmount()

    answerWith({ [DOMAINS_URL]: domainsBody(), [ACCOUNTS_URL]: { data: [] } })
    const empty = await mountView()
    expect(empty.wrapper.get('[data-testid="email-addresses-empty-add"]').text()).toBe('button.emailAddress.add')
    empty.wrapper.unmount()
  })

  it('shows the usage and quota of each account, with the unlimited text for an unlimited quota', async () => {
    const { wrapper } = await mountView()

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('info@example.com')
    expect(rows[0]!.text()).toContain('form.value.sizeMB')
    expect(rows[1]!.text()).toContain('sales@example.com')
    expect(rows[1]!.text()).toContain('form.value.unlimited')
    wrapper.unmount()
  })

  it('does not change the cached domains response the frame shares', async () => {
    const body = domainsBody()
    const before = structuredClone(body)
    answerWith({ [DOMAINS_URL]: body, [ACCOUNTS_URL]: { data: accounts } })

    const { wrapper } = await mountView()

    expect(body).toEqual(before)
    wrapper.unmount()
  })

  it('reloads the accounts of the chosen domain when the domain changes, and keeps the search term', async () => {
    const { wrapper } = await mountView()
    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'info')
    await flushPromises()

    wrapper.findComponent(VSelect).vm.$emit('update:modelValue', domainsBody().data[1])
    await flushPromises()

    expect(calledUrls()).toContain(SECOND_ACCOUNTS_URL)
    expect(wrapper.findComponent(DataIteratorFilterControls).props('searchTerm')).toBe('info')
    wrapper.unmount()
  })

  it('shows the search and the Add button only while the list has accounts', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-testid="email-addresses-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="email-addresses-add"]').exists()).toBe(true)
    wrapper.unmount()

    answerWith({ [DOMAINS_URL]: domainsBody(), [ACCOUNTS_URL]: { data: [] } })
    const empty = await mountView()
    expect(empty.wrapper.find('[data-testid="email-addresses-search"]').exists()).toBe(false)
    expect(empty.wrapper.find('[data-testid="email-addresses-add"]').exists()).toBe(false)
    expect(empty.wrapper.find('[data-testid="email-addresses-empty"]').exists()).toBe(true)
    empty.wrapper.unmount()
  })

  it('shows the alert and no table when the domains fail', async () => {
    answerWith({ [DOMAINS_URL]: () => Promise.reject(new Error('boom')) })

    const { wrapper, alerts } = await mountView()

    expect(wrapper.find('[data-testid="email-addresses-table"]').exists()).toBe(false)
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(calledUrls()).not.toContain(ACCOUNTS_URL)
    wrapper.unmount()
  })

  it('shows the alert and no table when the accounts fail', async () => {
    answerWith({ [DOMAINS_URL]: domainsBody(), [ACCOUNTS_URL]: () => Promise.reject(new Error('boom')) })

    const { wrapper, alerts } = await mountView()

    expect(wrapper.find('[data-testid="email-addresses-table"]').exists()).toBe(false)
    expect(alerts.activeAlerts).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the records chip only when the service reports it, and checks the records of every domain', async () => {
    answerWith({ [DOMAINS_URL]: domainsBody(), [ACCOUNTS_URL]: { data: accounts }, [SECOND_ACCOUNTS_URL]: { data: [accounts[1]] } })
    const hidden = await mountView()
    expect(hidden.wrapper.find('.record-configuration').exists()).toBe(false)
    hidden.wrapper.unmount()

    answerWith({
      [DOMAINS_URL]: { ...domainsBody(), meta: { is_email_dns_records_showed: true } },
      [ACCOUNTS_URL]: { data: accounts },
      [SECOND_ACCOUNTS_URL]: { data: [accounts[1]] },
    })
    clearAllCachedGet()
    const shown = await mountView()
    expect(shown.wrapper.find('.record-configuration').exists()).toBe(true)
    shown.wrapper.unmount()
  })

  it('opens the SPF and DKIM records of the chosen domain from the chip', async () => {
    answerWith({
      [DOMAINS_URL]: {
        data: [
          { id: 1, domain: 'example.com', dkim_records: [], spf_records: [{ name: 'example.com', type: 'TXT', value: 'v=spf1 -all' }] },
          { id: 2, domain: 'shop.example.com', dkim_records: [], spf_records: [] },
        ],
        meta: { is_email_dns_records_showed: true },
      },
      [ACCOUNTS_URL]: { data: accounts },
      [SECOND_ACCOUNTS_URL]: { data: [accounts[1]] },
    })
    vi.mocked(resolveTxt).mockResolvedValue(null)

    const { wrapper } = await mountView()
    await wrapper.get('.record-configuration').trigger('click')
    await flushPromises()

    const modal = document.body.querySelector('.record-configuration-modal')
    expect(modal).not.toBeNull()
    expect(modal!.classList.contains('card-width-560')).toBe(true)
    expect(modal!.getAttribute('style') ?? '').not.toContain('width')
    expect(modal!.textContent).toContain('v=spf1 -all')
    expect(modal!.querySelector('.record-box .record-label.failed')).not.toBeNull()
    expect(modal!.querySelectorAll('.record-box')[1]!.textContent).toContain('message.emptyTable.noRecords')

    wrapper.unmount()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('shows the empty state and requests no accounts when the service has no email domains', async () => {
    answerWith({ [DOMAINS_URL]: { data: [], meta: { is_email_dns_records_showed: false } } })

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="email-addresses-empty"]').exists()).toBe(true)
    expect(calledUrls()).toEqual([DOMAINS_URL])
    expect(wrapper.find('[data-testid="email-addresses-search"]').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('Add and Edit modals', () => {
    const NEW_ACCOUNT = { email: 'new@example.com', disk_usage: 0, disk_quota: 'unlimited', created_at: null, updated_at: null }

    /** The modal field with this name (`text-select` is `email`, the rest are their `name`). */
    function fieldComponent (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], name: string) {
      return wrapper.findAllComponents(BasicModalField).find(component => modalFieldName(component.props('field') as ModalField) === name)!
    }

    /** Fills the Add form. The text-select emits its merged value (`BasicModalField.setPart`), so the whole value goes in. */
    async function fillAdd (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], email: string, password: string) {
      fieldComponent(wrapper, 'email').vm.$emit('update:modelValue', { unlimited_quota: true, password, domain: 'example.com', email })
      fieldComponent(wrapper, 'password').vm.$emit('update:modelValue', password)
      await flushPromises()
    }

    beforeEach(() => {
      vi.mocked(api.post).mockReset()
      vi.mocked(api.put).mockReset()
    })

    it('Add with no domain (the empty state of a service without domains) does not open the modal', async () => {
      answerWith({ [DOMAINS_URL]: { data: [], meta: { is_email_dns_records_showed: false } } })

      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-addresses-empty-add"]').trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
      expect(api.post).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('Add from the title bar opens the Add modal with the selected domain', async () => {
      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-addresses-add"]').trigger('click')
      await flushPromises()

      const modal = wrapper.findComponent(BasicModal)
      expect(modal.exists()).toBe(true)
      expect(modal.props('title')).toBe('heading.hosting.emailAddress.modal.add.title')
      expect(fieldComponent(wrapper, 'email').props('field')).toMatchObject({ suffix: '@', options: [{ value: 'example.com' }] })
      expect(fieldComponent(wrapper, 'quota').props('field')).toMatchObject({ hidden: true })
      wrapper.unmount()
    })

    it('Add with an empty form is stopped by the form rules: no request, the modal stays open', async () => {
      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-addresses-add"]').trigger('click')
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
      await flushPromises()

      expect(api.post).not.toHaveBeenCalled()
      expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
      wrapper.unmount()
    })

    it('Add success posts the account, alerts, reloads the list and highlights the new row for 1 s', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      let saved = false
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [ACCOUNTS_URL]: () => ({ data: { data: saved ? [...accounts, NEW_ACCOUNT] : accounts } }),
      })
      vi.mocked(api.post).mockImplementation(async () => {
        saved = true
        return { data: { success: true } }
      })

      const { wrapper, alerts } = await mountView()
      await wrapper.get('[data-testid="email-addresses-add"]').trigger('click')
      await flushPromises()
      await fillAdd(wrapper, 'new', 'secret123')

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
      await flushPromises()

      expect(api.post).toHaveBeenCalledWith(ACCOUNTS_URL, {
        unlimited_quota: true,
        quota: 0,
        domain: 'example.com',
        email: 'new',
        password: 'secret123',
      })
      expect(calledUrls().filter(url => url === ACCOUNTS_URL)).toHaveLength(2)
      expect(alerts.activeAlerts).toHaveLength(1)
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
      await wrapper.get('[data-testid="email-addresses-add"]').trigger('click')
      await flushPromises()
      await fillAdd(wrapper, 'new', 'secret123')

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(calledUrls().filter(url => url === ACCOUNTS_URL)).toHaveLength(1)
      expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
      wrapper.unmount()
    })

    it('Edit from the row opens the Edit modal, with the limited quota shown', async () => {
      const { wrapper } = await mountView()
      await wrapper.findAll('tbody tr')[0]!.find('.actions-row .v-btn').trigger('click')
      await flushPromises()

      const modal = wrapper.findComponent(BasicModal)
      // The test translator returns the key; the escaped address in the title is covered by email-account-modals.test.ts.
      expect(modal.props('title')).toBe('heading.hosting.emailAddress.modal.update.title')
      expect(fieldComponent(wrapper, 'quota').props('field')).toMatchObject({ hidden: false })
      wrapper.unmount()
    })

    it('Edit submit puts the account with the quota as a number and no new password, then reloads and alerts', async () => {
      vi.mocked(api.put).mockResolvedValue({ data: { success: true } })

      const { wrapper, alerts } = await mountView()
      await wrapper.findAll('tbody tr')[0]!.find('.actions-row .v-btn').trigger('click')
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'update')
      await flushPromises()

      expect(api.put).toHaveBeenCalledWith('/services/1/email/domains/1/accounts/info@example.com', {
        hiddenPassword: null,
        password: null,
        unlimited_quota: false,
        quota: 512,
      })
      expect(calledUrls().filter(url => url === ACCOUNTS_URL)).toHaveLength(2)
      expect(alerts.activeAlerts).toHaveLength(1)
      wrapper.unmount()
    })

    it('Edit error shows the alert and keeps the modal open', async () => {
      vi.mocked(api.put).mockRejectedValue(new Error('boom'))

      const { wrapper, alerts } = await mountView()
      await wrapper.findAll('tbody tr')[0]!.find('.actions-row .v-btn').trigger('click')
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'update')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
      wrapper.unmount()
    })

    it('"Set New Password" reveals the password field in Edit', async () => {
      const { wrapper } = await mountView()
      await wrapper.findAll('tbody tr')[0]!.find('.actions-row .v-btn').trigger('click')
      await flushPromises()

      expect(fieldComponent(wrapper, 'password').props('field')).toMatchObject({ hidden: true })
      fieldComponent(wrapper, 'hiddenPassword').vm.$emit('button-click')
      await flushPromises()

      expect(fieldComponent(wrapper, 'password').props('field')).toMatchObject({ hidden: false })
      wrapper.unmount()
    })
    it('opens Add after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="email-addresses-add"]').trigger('click')
      await flushPromises()

      const overlay = expectOverlayBeforeCard('[data-testid="email-addresses-modal"]')
      expectLegacyTransition(wrapper)
      await clickOverlay(overlay)

      expect(openDialogs(wrapper)).toBe(0)
      wrapper.unmount()
    })
  })

  describe('Delete, Details and webmail', () => {
    const DETAILS_URL = '/services/1/email/domains/1/accounts/info@example.com'
    const WEBMAIL_URL = '/services/1/email/domains/1/accounts/info@example.com/webmail-sso-url'
    const DELETE_URL = '/services/1/email/domains/1/accounts/info@example.com'
    const DETAILS_BODY = {
      smtp_username: 'info@example.com',
      inbox_host: 'mail.example.com',
      imap_port: 993,
      imap_insecure_port: 143,
      pop3_port: 995,
      pop3_insecure_port: 110,
      smtp_host: 'mail.example.com',
      smtp_port: 465,
      smtp_insecure_port: 587,
    }

    /** The row action at this place of the first row: 0 Edit, 1 Details, 2 Delete, 3 Webmail. */
    function rowAction (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], index: number) {
      return wrapper.findAll('tbody tr')[0]!.findAll('.actions-row .v-btn')[index]!
    }

    function fieldComponent (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], name: string) {
      return wrapper.findAllComponents(BasicModalField).find(component => modalFieldName(component.props('field') as ModalField) === name)!
    }

    beforeEach(() => {
      vi.mocked(api.delete).mockReset()
      vi.unstubAllGlobals()
    })

    it('Delete from the row opens the warning modal, and its button waits for the confirm checkbox', async () => {
      const { wrapper } = await mountView()
      await rowAction(wrapper, 2).trigger('click')
      await flushPromises()

      const modal = wrapper.findComponent(BasicModal)
      expect(modal.props('title')).toBe('heading.hosting.emailAddress.modal.delete.title')
      expect(modal.props('color')).toBe('error')
      expect(modal.props('confirmRequired')).toBe(true)
      expect(modal.props('confirmed')).toBe(false)

      fieldComponent(wrapper, 'confirm').vm.$emit('update:modelValue', true)
      await flushPromises()

      expect(wrapper.findComponent(BasicModal).props('confirmed')).toBe(true)
      wrapper.unmount()
    })

    it('Delete without the confirm checkbox sends nothing', async () => {
      const { wrapper } = await mountView()
      await rowAction(wrapper, 2).trigger('click')
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
      await flushPromises()

      expect(api.delete).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('Delete success deletes the account, alerts and reloads the list', async () => {
      vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

      const { wrapper, alerts } = await mountView()
      await rowAction(wrapper, 2).trigger('click')
      await flushPromises()
      fieldComponent(wrapper, 'confirm').vm.$emit('update:modelValue', true)
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
      await flushPromises()

      expect(api.delete).toHaveBeenCalledWith(DELETE_URL)
      expect(calledUrls().filter(url => url === ACCOUNTS_URL)).toHaveLength(2)
      expect(alerts.activeAlerts).toHaveLength(1)
      wrapper.unmount()
    })

    it('Delete error shows the alert and keeps the modal open', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('boom'))

      const { wrapper, alerts } = await mountView()
      await rowAction(wrapper, 2).trigger('click')
      await flushPromises()
      fieldComponent(wrapper, 'confirm').vm.$emit('update:modelValue', true)
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
      wrapper.unmount()
    })

    it('Details: the spinner stays on the eye button until the answer, then the dialog shows the settings', async () => {
      let resolveDetails: (value: unknown) => void = () => {}
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [ACCOUNTS_URL]: { data: accounts },
        [DETAILS_URL]: () => new Promise(resolve => {
          resolveDetails = resolve
        }),
      })

      const { wrapper } = await mountView()
      await rowAction(wrapper, 1).trigger('click')
      await flushPromises()

      expect(rowAction(wrapper, 1).classes()).toContain('v-btn--loading')
      expect(wrapper.findComponent(AccountConfigurationDetails).exists()).toBe(false)

      resolveDetails({ data: { data: DETAILS_BODY } })
      await flushPromises()

      expect(rowAction(wrapper, 1).classes()).not.toContain('v-btn--loading')
      expect(wrapper.findComponent(AccountConfigurationDetails).props('details')).toEqual(DETAILS_BODY)
      expect(wrapper.findComponent(AccountConfigurationDetails).classes()).toContain('card-width-560')
      expect(wrapper.findComponent(AccountConfigurationDetails).attributes('style') ?? '').not.toContain('width')
      wrapper.unmount()
    })

    it('Details are cached: a second click on the same account makes no request', async () => {
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [ACCOUNTS_URL]: { data: accounts },
        [DETAILS_URL]: { data: DETAILS_BODY },
      })

      const { wrapper } = await mountView()
      await rowAction(wrapper, 1).trigger('click')
      await flushPromises()
      await rowAction(wrapper, 1).trigger('click')
      await flushPromises()

      expect(calledUrls().filter(url => url === DETAILS_URL)).toHaveLength(1)
      wrapper.unmount()
    })

    it('Details error shows the alert and opens nothing', async () => {
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [ACCOUNTS_URL]: { data: accounts },
        [DETAILS_URL]: () => Promise.reject(new Error('boom')),
      })

      const { wrapper, alerts } = await mountView()
      await rowAction(wrapper, 1).trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(wrapper.findComponent(AccountConfigurationDetails).exists()).toBe(false)
      wrapper.unmount()
    })

    it('Webmail: the spinner stays on the mail button until the URL answers, then the browser goes to it', async () => {
      const location = { href: '' }
      vi.stubGlobal('location', location)
      let resolveWebmail: (value: unknown) => void = () => {}
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [ACCOUNTS_URL]: { data: accounts },
        [WEBMAIL_URL]: () => new Promise(resolve => {
          resolveWebmail = resolve
        }),
      })

      const { wrapper } = await mountView()
      await rowAction(wrapper, 3).trigger('click')
      await flushPromises()

      expect(rowAction(wrapper, 3).classes()).toContain('v-btn--loading')

      resolveWebmail({ data: { data: { url: 'https://webmail.example.com/sso/1' } } })
      await flushPromises()

      expect(location.href).toBe('https://webmail.example.com/sso/1')
      expect(rowAction(wrapper, 3).classes()).not.toContain('v-btn--loading')
      wrapper.unmount()
    })

    it('Webmail asks for a fresh URL on every click (no cache)', async () => {
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [ACCOUNTS_URL]: { data: accounts },
        [WEBMAIL_URL]: { data: { url: 'https://webmail.example.com/sso/1' } },
      })
      vi.stubGlobal('location', { href: '' })

      const { wrapper } = await mountView()
      await rowAction(wrapper, 3).trigger('click')
      await flushPromises()
      await rowAction(wrapper, 3).trigger('click')
      await flushPromises()

      expect(calledUrls().filter(url => url === WEBMAIL_URL)).toHaveLength(2)
      wrapper.unmount()
    })

    it('Webmail error shows the alert and does not navigate', async () => {
      const location = { href: '' }
      vi.stubGlobal('location', location)
      answerWith({
        [DOMAINS_URL]: domainsBody(),
        [ACCOUNTS_URL]: { data: accounts },
        [WEBMAIL_URL]: () => Promise.reject(new Error('boom')),
      })

      const { wrapper, alerts } = await mountView()
      await rowAction(wrapper, 3).trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(location.href).toBe('')
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
    answerWith({
      [DOMAINS_URL]: domainsBody(),
      [ACCOUNTS_URL]: { data: accounts },
      [SECOND_ACCOUNTS_URL]: { data: [accounts[1]] },
    })
  })

  afterEach(() => {
    window.innerWidth = width
  })

  const emails = (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) => wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text())

  it('keeps the order of the list until a header is clicked, then sorts and flips the direction', async () => {
    const { wrapper } = await mountView()
    expect(emails(wrapper)).toEqual(['info@example.com', 'sales@example.com'])

    await wrapper.get('tr.custom-sort .item--email .custom-sort__item').trigger('click')
    await nextTick()
    expect(emails(wrapper)).toEqual(['sales@example.com', 'info@example.com'])

    await wrapper.get('tr.custom-sort .item--email .custom-sort__item').trigger('click')
    await nextTick()
    expect(emails(wrapper)).toEqual(['info@example.com', 'sales@example.com'])
    wrapper.unmount()
  })

  it('renders the usage and the updated text of each account in their cells', async () => {
    const { wrapper } = await mountView()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.findAll('td')).toHaveLength(4)
    expect(rows[1]!.findAll('td')[1]!.text()).toContain('unlimited')
    wrapper.unmount()
  })

  it('filters by the search term, shows no-results for no match and brings the list back with Clear filters', async () => {
    const { wrapper } = await mountView()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'sales')
    await flushPromises()
    expect(emails(wrapper)).toEqual(['sales@example.com'])

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'zzz')
    await flushPromises()
    expect(wrapper.find('.no-results-container').exists()).toBe(true)
    expect(wrapper.find('[data-testid="email-addresses-empty"]').exists()).toBe(false)

    await wrapper.get('.no-results-container button').trigger('click')
    await flushPromises()
    expect(emails(wrapper)).toHaveLength(2)
    wrapper.unmount()
  })

  it('pages the accounts by 8 and moves to the second page from the footer', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ email: `user${index + 1}@example.com`, disk_usage: 1, disk_quota: 512, created_at: null, updated_at: null }))
    answerWith({ [DOMAINS_URL]: domainsBody(), [ACCOUNTS_URL]: { data: many } })
    const { wrapper } = await mountView()

    expect(wrapper.findAll('tbody tr')).toHaveLength(8)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the empty message in the table for an account list with no accounts, with no header and no footer', async () => {
    answerWith({ [DOMAINS_URL]: domainsBody(), [ACCOUNTS_URL]: { data: [] } })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="email-addresses-empty"]').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the skeleton while the accounts load and no rows', async () => {
    answerWith({ [DOMAINS_URL]: domainsBody(), [ACCOUNTS_URL]: () => new Promise(() => {}) })
    const { wrapper } = await mountView()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('tbody tr .v-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the email, the usage and the four actions of each account in a card below 976 px', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountView()

    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const cards = wrapper.findAll('tbody tr .mobile-table-item')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.findAll('.mobile-table-item__header').map(label => label.text())).toEqual([
      'table.header.email',
      'table.header.usageQuota',
      'table.header.actions',
    ])
    expect(cards[0]!.text()).toContain('info@example.com')
    expect(cards[0]!.findAll('.mobile-table-item__value')[2]!.findAll('.v-btn')).toHaveLength(4)
    wrapper.unmount()
  })
})
