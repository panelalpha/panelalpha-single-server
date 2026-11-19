import type { HostingServerAccount } from '@/views/hosting/hosting.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VDialog } from 'vuetify/components'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
import HostingFtpTable from '@/views/hosting/ui/HostingFtpTable.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { mountKit } from '@/test/mount-kit'
import * as ftpApi from './ftp.api'
import FtpView from './FtpView.vue'

vi.mock('./ftp.api', () => ({
  listFtpAccounts: vi.fn(),
  createFtpAccount: vi.fn(),
  updateFtpAccount: vi.fn(),
  deleteFtpAccount: vi.fn(),
  getFtpServerInfo: vi.fn(),
  listAccountDomains: vi.fn(),
}))

const account = {
  user: 'shop@example.com',
  directory: '/home/example/shop',
  diskused: 120,
  diskquota: 1024,
  created_at: null,
  updated_at: null,
  actions: ['edit_password'],
}

const twoAccounts = makeService({
  server_accounts: [
    { id: 11, domain: 'one.example.com' },
    { id: 12, domain: 'two.example.com' },
  ],
})

async function mountFtp (service = makeService()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(FtpView, { props: { service }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

/** Clicks the title-bar Add button and waits for the domains and the modal. */
async function openAddModal (wrapper: Awaited<ReturnType<typeof mountFtp>>['wrapper']) {
  await wrapper.get('[data-testid="ftp-add"]').trigger('click')
  await flushPromises()
  return wrapper.findComponent(BasicModal)
}

function fieldAt (wrapper: Awaited<ReturnType<typeof mountFtp>>['wrapper'], index: number) {
  return wrapper.findAllComponents(BasicModalField)[index]!
}

describe('FtpView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.resetAllMocks()
    vi.mocked(ftpApi.listFtpAccounts).mockResolvedValue({ data: [account], meta: { usage: true } })
    vi.mocked(ftpApi.listAccountDomains).mockResolvedValue([{ domain: 'example.com' }, { domain: 'shop.example.com' }])
    vi.mocked(ftpApi.getFtpServerInfo).mockResolvedValue({ host: 'ftp.example.com', port: 21 })
    vi.mocked(ftpApi.createFtpAccount).mockResolvedValue(undefined)
    vi.mocked(ftpApi.updateFtpAccount).mockResolvedValue(undefined)
    vi.mocked(ftpApi.deleteFtpAccount).mockResolvedValue(undefined)
  })

  afterEach(() => {
    window.innerWidth = width
    vi.useRealTimers()
  })

  it('loads the list of the first server account on mount', async () => {
    const { wrapper } = await mountFtp(twoAccounts)

    expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(1)
    expect(ftpApi.listFtpAccounts).toHaveBeenCalledWith(11)
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the empty state without the search and Add in the title bar when the account has no FTP accounts', async () => {
    vi.mocked(ftpApi.listFtpAccounts).mockResolvedValue({ data: [], meta: { usage: true } })
    const { wrapper } = await mountFtp()

    expect(wrapper.find('[data-testid="ftp-search"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ftp-add"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ftp-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens the Add modal from the Add button of the empty state', async () => {
    vi.mocked(ftpApi.listFtpAccounts).mockResolvedValue({ data: [], meta: { usage: true } })
    const { wrapper } = await mountFtp()

    await wrapper.get('[data-testid="ftp-empty-add"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(BasicModal).props('title')).toBe('heading.hosting.ftp.modal.add.title')
    wrapper.unmount()
  })

  it('shows the account selector for several server accounts and reloads the list for the chosen one', async () => {
    const { wrapper } = await mountFtp(twoAccounts)

    expect(wrapper.find('[data-testid="ftp-account-selector"]').exists()).toBe(true)
    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', twoAccounts.server_accounts[1])
    await flushPromises()

    expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(2)
    expect(ftpApi.listFtpAccounts).toHaveBeenLastCalledWith(12)
    wrapper.unmount()
  })

  it('drops an older reload response that arrives after a newer one, so the newer rows stay', async () => {
    const { wrapper } = await mountFtp(twoAccounts)
    let resolveOlder: (value: ftpApi.FtpAccountsResponse) => void = () => {}
    let resolveNewer: (value: ftpApi.FtpAccountsResponse) => void = () => {}
    vi.mocked(ftpApi.listFtpAccounts)
      .mockReturnValueOnce(new Promise(resolve => {
        resolveOlder = resolve
      }))
      .mockReturnValueOnce(new Promise(resolve => {
        resolveNewer = resolve
      }))

    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', twoAccounts.server_accounts[1])
    await flushPromises()
    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', twoAccounts.server_accounts[0])
    await flushPromises()

    resolveNewer({ data: [{ ...account, user: 'newer@example.com' }], meta: { usage: true } })
    await flushPromises()
    resolveOlder({ data: [{ ...account, user: 'older@example.com' }, { ...account, user: 'older-2@example.com' }], meta: { usage: true } })
    await flushPromises()

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.get('tbody tr').text()).toContain('newer@example.com')
    expect(wrapper.get('tbody tr').text()).not.toContain('older@example.com')
    wrapper.unmount()
  })

  it('hides the account selector for a single server account', async () => {
    const { wrapper } = await mountFtp()

    expect(wrapper.find('[data-testid="ftp-account-selector"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the diagnostic alert and makes no request for an account in diagnostic mode', async () => {
    const { wrapper, alerts } = await mountFtp(makeService({
      server_accounts: [{ id: 11, domain: 'one.example.com', diagnostic_mode: true }],
    }))

    expect(ftpApi.listFtpAccounts).not.toHaveBeenCalled()
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'message.hostingAccountInDiagnosticMode' })
    expect(wrapper.find('[data-testid="ftp-table"]').exists()).toBe(false)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('project variant', () => {
    async function mountProject (service = makeService()) {
      const pinia = createPinia()
      setActivePinia(pinia)
      const wrapper = await mountKit(FtpView, { props: { service, variant: 'project' }, global: { plugins: [pinia] } })
      await flushPromises()
      return { wrapper, alerts: useAlertsStore() }
    }

    it('has the advanced page root and the page-title header', async () => {
      const { wrapper } = await mountProject()

      expect(wrapper.classes()).toContain('advanced-hosting-page')
      const container = wrapper.get('.page-title.page-title--advanced')
      expect(container.get('.page-title__title-box h4.page-title__title').attributes('data-testid')).toBe('ftp-title')
      const filters = container.get('.page-title__filter-controls')
      expect(filters.classes()).not.toContain('justify-end')
      expect(filters.classes()).not.toContain('align-end')
      expect(wrapper.find('.title-row').exists()).toBe(false)
      wrapper.unmount()
    })

    it('keeps the hosting header and root in the default variant', async () => {
      const { wrapper } = await mountFtp()

      expect(wrapper.classes()).not.toContain('advanced-hosting-page')
      expect(wrapper.find('.page-title--advanced').exists()).toBe(false)
      expect(wrapper.find('.title-row').exists()).toBe(true)
      wrapper.unmount()
    })

    it('does not show the account selector even for several accounts', async () => {
      const { wrapper } = await mountProject(twoAccounts)

      expect(wrapper.find('[data-testid="ftp-account-selector"]').exists()).toBe(false)
      expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(1)
      expect(ftpApi.listFtpAccounts).toHaveBeenCalledWith(11)
      wrapper.unmount()
    })

    it('does not reload for a new service reference with the same account id', async () => {
      const { wrapper } = await mountProject()

      await wrapper.setProps({ service: makeService() })
      await flushPromises()

      expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('reloads for a new account id', async () => {
      const { wrapper } = await mountProject()

      await wrapper.setProps({ service: makeService({ server_accounts: [{ id: 12, domain: 'two.example.com' }] }) })
      await flushPromises()

      expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(2)
      expect(ftpApi.listFtpAccounts).toHaveBeenLastCalledWith(12)
      wrapper.unmount()
    })

    it('makes no request and keeps the skeleton without an account id', async () => {
      const { wrapper } = await mountProject(makeService({
        server_accounts: [{ id: undefined, domain: 'example.com' } as unknown as HostingServerAccount],
      }))

      expect(ftpApi.listFtpAccounts).not.toHaveBeenCalled()
      expect(wrapper.findComponent(HostingFtpTable).props('itemsLoading')).toBe(true)
      wrapper.unmount()
    })

    it('shows the diagnostic alert like the hosting variant', async () => {
      const { wrapper, alerts } = await mountProject(makeService({
        server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: true }],
      }))

      expect(ftpApi.listFtpAccounts).not.toHaveBeenCalled()
      expect(alerts.activeAlerts).toHaveLength(1)
      wrapper.unmount()
    })
  })

  it('shows the error alert and stops loading when the list request fails', async () => {
    vi.mocked(ftpApi.listFtpAccounts).mockRejectedValue({ response: { data: { message: 'FTP service is unavailable' } } })
    const { wrapper, alerts } = await mountFtp()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'FTP service is unavailable' }])
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says the list could not be loaded instead of the empty state, and loads it again from Retry', async () => {
    vi.mocked(ftpApi.listFtpAccounts).mockRejectedValueOnce({ response: { data: { message: 'The server did not answer in time. Please try again in a moment.' } } })
    const { wrapper } = await mountFtp()

    expect(wrapper.get('[data-testid="ftp-load-error"]').text()).toContain('The server did not answer in time.')
    expect(wrapper.find('[data-testid="ftp-empty"]').exists()).toBe(false)

    vi.mocked(ftpApi.listFtpAccounts).mockResolvedValue({ data: [], meta: { usage: false } })
    await wrapper.get('[data-testid="ftp-load-error"] [data-testid="error-card-retry"]').trigger('click')
    await flushPromises()

    expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="ftp-load-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ftp-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('clears the search term when the table asks to clear the filters', async () => {
    const { wrapper } = await mountFtp()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'zzz-no-match')
    await flushPromises()
    expect(wrapper.findComponent(HostingFtpTable).props('searchTerm')).toBe('zzz-no-match')

    wrapper.findComponent(HostingFtpTable).vm.$emit('clear-filters')
    await flushPromises()
    expect(wrapper.findComponent(HostingFtpTable).props('searchTerm')).toBe('')
    wrapper.unmount()
  })

  describe('Add', () => {
    it('opens with the domains of the account and the unlimited checkbox ticked', async () => {
      const { wrapper } = await mountFtp()

      const modal = await openAddModal(wrapper)

      expect(ftpApi.listAccountDomains).toHaveBeenCalledWith(11)
      expect(modal.props('title')).toBe('heading.hosting.ftp.modal.add.title')
      expect(wrapper.findAllComponents(BasicModalField).map(field => field.props('field').type)).toEqual([
        'text-select',
        'generatePassword',
        'text',
        'checkbox',
        'text',
      ])
      expect(fieldAt(wrapper, 3).props('modelValue')).toBe(true)
      wrapper.unmount()
    })

    it('shows the quota field only when unlimited is unticked', async () => {
      const { wrapper } = await mountFtp()
      await openAddModal(wrapper)

      expect(fieldAt(wrapper, 4).find('input').isVisible()).toBe(false)

      fieldAt(wrapper, 3).find('input').setValue(false)
      await flushPromises()

      expect(fieldAt(wrapper, 4).find('input').isVisible()).toBe(true)
      wrapper.unmount()
    })

    it('posts the typed values with quota 0, highlights the new row for 1 s, reloads and closes', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const added = { ...account, user: 'blog@example.com', updated_at: null }
      vi.mocked(ftpApi.listFtpAccounts)
        .mockResolvedValueOnce({ data: [account], meta: { usage: true } })
        .mockResolvedValue({ data: [added, account], meta: { usage: true } })
      const { wrapper, alerts } = await mountFtp()
      const modal = await openAddModal(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('blog')
      fieldAt(wrapper, 1).find('input').setValue('secret123')
      fieldAt(wrapper, 2).find('input').setValue('/blog')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(ftpApi.createFtpAccount).toHaveBeenCalledWith(11, {
        domain: 'example.com',
        unlimited_quota: true,
        user: 'blog',
        password: 'secret123',
        directory: '/blog',
        quota: 0,
      })
      expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(2)
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(1)
      expect(wrapper.find('tbody tr.highlight').text()).toContain('blog@example.com')
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.ftp.add.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(0)
      wrapper.unmount()
    })

    it('keeps the modal open and shows the API error when the create request fails', async () => {
      vi.mocked(ftpApi.createFtpAccount).mockRejectedValue({ response: { data: { message: 'Quota exceeded' } } })
      const { wrapper, alerts } = await mountFtp()
      const modal = await openAddModal(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('blog')
      fieldAt(wrapper, 1).find('input').setValue('secret123')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Quota exceeded' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(false)
      expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('does not send a username without a domain part', async () => {
      const { wrapper } = await mountFtp()
      const modal = await openAddModal(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('')
      fieldAt(wrapper, 1).find('input').setValue('secret123')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(ftpApi.createFtpAccount).not.toHaveBeenCalled()
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      wrapper.unmount()
    })

    it('shows the generic error and no modal when the account has no domains', async () => {
      vi.mocked(ftpApi.listAccountDomains).mockResolvedValue([])
      const { wrapper, alerts } = await mountFtp()

      await openAddModal(wrapper)

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Something went wrong. Please try again.' })
      expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('Info', () => {
    it('spins the row button while the server info loads, then shows the escaped host and port', async () => {
      let resolveInfo: (info: { host: string, port: number }) => void = () => {}
      vi.mocked(ftpApi.getFtpServerInfo).mockReturnValue(new Promise(resolve => {
        resolveInfo = resolve
      }))
      const { wrapper } = await mountFtp()

      await wrapper.findAll('.actions-row .v-btn')[0]!.trigger('click')
      await nextTick()
      expect(wrapper.findAll('.actions-row .v-btn')[0]!.classes()).toContain('v-btn--loading')

      resolveInfo({ host: 'ftp<b>.example.com', port: 21 })
      await flushPromises()

      expect(ftpApi.getFtpServerInfo).toHaveBeenCalledWith(11)
      const modal = wrapper.findComponent(BasicModal)
      expect(modal.props('message')).toContain('<span class="d-inline-block">ftp&lt;b&gt;.example.com</span>')
      expect(modal.props('buttons').map((button: { id: string }) => button.id)).toEqual(['cancel'])
      expect(wrapper.findAll('.actions-row .v-btn')[0]!.classes()).not.toContain('v-btn--loading')
      wrapper.unmount()
    })

    it('shows the error alert and no modal when the server info request fails', async () => {
      vi.mocked(ftpApi.getFtpServerInfo).mockRejectedValue({ response: { data: { message: 'No info' } } })
      const { wrapper, alerts } = await mountFtp()

      await wrapper.findAll('.actions-row .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'No info' })
      expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('Edit', () => {
    async function openEditModal (wrapper: Awaited<ReturnType<typeof mountFtp>>['wrapper']) {
      await wrapper.findAll('.actions-row .v-btn')[1]!.trigger('click')
      await flushPromises()
      return wrapper.findComponent(BasicModal)
    }

    it('opens the password change of the row with the account name, one password field and Update', async () => {
      const { wrapper } = await mountFtp()

      const modal = await openEditModal(wrapper)

      expect(modal.props('title')).toBe('heading.hosting.ftp.modal.update.title')
      expect(modal.props('message')).toContain('<b>heading.hosting.ftp.modal.update.info:</b> shop@example.com')
      expect(modal.props('buttons').map((button: { id: string }) => button.id)).toEqual(['update', 'cancel'])
      expect(modal.props('buttons')[0].label).toBe('button.update')
      expect(wrapper.findAllComponents(BasicModalField).map(field => field.props('field').type)).toEqual(['generatePassword'])
      expect(fieldAt(wrapper, 0).props('field')).toMatchObject({ name: 'password', tooltip: 'tooltip.edit_ftp_account.password' })
      wrapper.unmount()
    })

    it('sends the new password, highlights the row, reloads and closes', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { wrapper, alerts } = await mountFtp()
      const modal = await openEditModal(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('new-secret1')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(ftpApi.updateFtpAccount).toHaveBeenCalledWith(11, 'shop@example.com', { password: 'new-secret1' })
      expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(2)
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(1)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.ftp.update.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(0)
      wrapper.unmount()
    })

    it('holds a refused password under the field, keeps the dialog open and clears it when the password changes', async () => {
      vi.mocked(ftpApi.updateFtpAccount).mockRejectedValue({
        response: { status: 422, data: { message: 'The password field must be at least 8 characters.', errors: { password: ['The password field must be at least 8 characters.'] } } },
      })
      const { wrapper, alerts } = await mountFtp()
      const modal = await openEditModal(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('new-secret1')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(fieldAt(wrapper, 0).props('field').errorMessages).toEqual(['The password field must be at least 8 characters.'])
      expect(fieldAt(wrapper, 0).get('.v-messages__message').text()).toBe('The password field must be at least 8 characters.')
      expect(alerts.activeAlerts).toHaveLength(0)
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)

      fieldAt(wrapper, 0).find('input').setValue('new-secret2')
      await flushPromises()
      expect(fieldAt(wrapper, 0).props('field').errorMessages).toEqual([])
      expect(fieldAt(wrapper, 0).find('.v-messages__message').exists()).toBe(false)
      wrapper.unmount()
    })

    it('does not send a password shorter than the rule the API applies', async () => {
      const { wrapper } = await mountFtp()
      const modal = await openEditModal(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('short')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(ftpApi.updateFtpAccount).not.toHaveBeenCalled()
      expect(fieldAt(wrapper, 0).get('.v-messages__message').text()).toBe('form.validation.minLength')
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      wrapper.unmount()
    })

    it('keeps the dialog open and shows the alert when the request fails otherwise', async () => {
      vi.mocked(ftpApi.updateFtpAccount).mockRejectedValue({ response: { status: 500, data: { message: 'FTP service is unavailable' } } })
      const { wrapper, alerts } = await mountFtp()
      const modal = await openEditModal(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('new-secret1')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'FTP service is unavailable' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      wrapper.unmount()
    })
  })

  describe('Delete', () => {
    it('keeps the Delete button disabled until the confirm checkbox is ticked, then deletes the account', async () => {
      const { wrapper, alerts } = await mountFtp()

      await wrapper.findAll('.actions-row .v-btn')[2]!.trigger('click')
      await flushPromises()
      const modal = wrapper.findComponent(BasicModal)
      expect(modal.props('confirmRequired')).toBe(true)
      expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeDefined()

      fieldAt(wrapper, 0).find('input[type="checkbox"]').setValue(true)
      await flushPromises()
      expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeUndefined()

      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(ftpApi.deleteFtpAccount).toHaveBeenCalledWith(11, 'shop@example.com')
      expect(ftpApi.listFtpAccounts).toHaveBeenCalledTimes(2)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.ftp.delete.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
      wrapper.unmount()
    })

    it('does not delete while the confirm checkbox is unticked, even if a click reaches the modal', async () => {
      const { wrapper } = await mountFtp()

      await wrapper.findAll('.actions-row .v-btn')[2]!.trigger('click')
      await flushPromises()
      wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
      await flushPromises()

      expect(ftpApi.deleteFtpAccount).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('keeps the modal open and shows the error when the delete request fails', async () => {
      vi.mocked(ftpApi.deleteFtpAccount).mockRejectedValue({ response: { data: { message: 'Locked' } } })
      const { wrapper, alerts } = await mountFtp()

      await wrapper.findAll('.actions-row .v-btn')[2]!.trigger('click')
      await flushPromises()
      fieldAt(wrapper, 0).find('input[type="checkbox"]').setValue(true)
      await flushPromises()
      wrapper.findComponent(BasicModal).findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Locked' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      wrapper.unmount()
    })
  })
  describe('dialog shell (kit-dialog-hosting)', () => {
    it('opens Add after the legacy overlay, with the legacy transition, and closes it on an overlay click', async () => {
      const { wrapper } = await mountFtp()
      await openAddModal(wrapper)

      const overlay = expectOverlayBeforeCard('[data-testid="ftp-modal"]')
      expectLegacyTransition(wrapper)
      await clickOverlay(overlay)

      expect(openDialogs(wrapper)).toBe(0)
      wrapper.unmount()
    })

    it('ignores an overlay click while the create request runs', async () => {
      vi.mocked(ftpApi.createFtpAccount).mockReturnValue(new Promise(() => {}))
      const { wrapper } = await mountFtp()
      const modal = await openAddModal(wrapper)
      fieldAt(wrapper, 0).find('input').setValue('blog')
      fieldAt(wrapper, 1).find('input').setValue('secret123')
      await flushPromises()
      modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(VDialog).props('persistent')).toBe(true)
      await clickOverlay(expectOverlayBeforeCard('[data-testid="ftp-modal"]'))

      expect(openDialogs(wrapper)).toBe(1)
      wrapper.unmount()
    })
  })
})
