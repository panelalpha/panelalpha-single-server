import type { HostingServerAccount } from '@/views/hosting/hosting.types'
import type { DOMWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VDialog, VSelect } from 'vuetify/components'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
import HostingFtpTable from '@/views/hosting/ui/HostingFtpTable.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { mountKit } from '@/test/mount-kit'
import * as sftpApi from './sftp.api'
import SftpView from './SftpView.vue'

vi.mock('./sftp.api', () => ({
  listSftpAccounts: vi.fn(),
  createSftpAccount: vi.fn(),
  updateSftpAccount: vi.fn(),
  deleteSftpAccount: vi.fn(),
  getSftpServerInfo: vi.fn(),
  disconnectAllSftp: vi.fn(),
  setSftpAccessType: vi.fn(),
}))

const accounts = [
  { user: 'example_deploy', created_at: null, updated_at: '2026-09-20T10:00:00.000Z' },
  { user: 'example_backup', created_at: null, updated_at: null },
]

const twoAccounts = makeService({
  server_accounts: [
    { id: 11, domain: 'one.example.com' },
    { id: 12, domain: 'two.example.com' },
  ],
})

const sshService = makeService({
  plan_settings: { allow_user_enable_ssh_access: true },
})

// Wrappers whose test failed before `unmount()`; `afterEach` removes them so the teleported dialog and menu do not leak into the next test.
const openWrappers = new Set<{ unmount: () => void }>()

async function mountSftp (service = makeService()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(SftpView, { props: { service }, global: { plugins: [pinia] } })
  const unmount = wrapper.unmount.bind(wrapper)
  wrapper.unmount = () => {
    openWrappers.delete(wrapper)
    unmount()
  }
  openWrappers.add(wrapper)
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

type Mounted = Awaited<ReturnType<typeof mountSftp>>['wrapper']

/** Opens the Actions menu and returns the items teleported to the body (the menu is not inside the wrapper). */
async function openActionsMenu (wrapper: Mounted) {
  await wrapper.get('[data-testid="sftp-actions-button"]').trigger('click')
  await flushPromises()
  return document.querySelectorAll<HTMLElement>('[data-testid="sftp-actions-item"]')
}

describe('SftpView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.resetAllMocks()
    vi.mocked(sftpApi.listSftpAccounts).mockResolvedValue({
      data: accounts,
      meta: { access_type: 'sftp', actions: ['edit_password'] },
    })
  })

  afterEach(() => {
    window.innerWidth = width
    for (const wrapper of openWrappers) {
      wrapper.unmount()
    }
  })

  it('loads the list of the first server account on mount', async () => {
    const { wrapper } = await mountSftp(twoAccounts)

    expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(1)
    expect(sftpApi.listSftpAccounts).toHaveBeenCalledWith(11)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  describe('title and Add by page type', () => {
    it('titles the page and the Add button as SFTP when the plan has no SSH access', async () => {
      const { wrapper } = await mountSftp()

      expect(wrapper.get('[data-testid="sftp-title"]').text()).toBe('heading.hosting.sftp.title')
      expect(wrapper.get('[data-testid="sftp-add"]').text()).toBe('button.sftp.add')
      wrapper.unmount()
    })

    it('titles the page and the Add button as SSH when the plan allows SSH access', async () => {
      const { wrapper } = await mountSftp(sshService)

      expect(wrapper.get('[data-testid="sftp-title"]').text()).toBe('heading.hosting.ssh.title')
      expect(wrapper.get('[data-testid="sftp-add"]').text()).toBe('button.ssh.add')
      wrapper.unmount()
    })
  })

  describe('row actions', () => {
    it('shows the edit action only for rows whose account lists edit_password', async () => {
      const { wrapper } = await mountSftp()
      expect(wrapper.findAll('tbody tr')[0]!.findAll('.actions-row .v-btn')).toHaveLength(3)
      wrapper.unmount()

      vi.mocked(sftpApi.listSftpAccounts).mockResolvedValue({ data: accounts, meta: { access_type: 'sftp', actions: [] } })
      const without = await mountSftp()
      expect(without.wrapper.findAll('tbody tr')[0]!.findAll('.actions-row .v-btn')).toHaveLength(2)
      without.wrapper.unmount()
    })

    it('shows the dash for the mobile usage cell, because SFTP rows have no usage', async () => {
      window.innerWidth = 500
      const { wrapper } = await mountSftp()

      const usage = wrapper.findAll('tbody tr')[0]!.findAll('.mobile-table-item__value')[2]!
      expect(usage.text()).toBe('"---"')
      wrapper.unmount()
    })
  })

  describe('Actions menu', () => {
    it('offers only Disconnect all when the plan does not allow SSH access', async () => {
      const { wrapper } = await mountSftp()

      const items = await openActionsMenu(wrapper)

      expect(items).toHaveLength(1)
      expect(items[0]!.textContent).toContain('button.disconnect.all')
      wrapper.unmount()
    })

    it('offers Manage SSH access as the second item when the plan allows SSH access', async () => {
      const { wrapper } = await mountSftp(sshService)

      const items = await openActionsMenu(wrapper)

      expect(items).toHaveLength(2)
      expect(items[1]!.textContent).toContain('button.manageSshAccess')
      wrapper.unmount()
    })
  })

  describe('server account selector', () => {
    it('shows the selector for several server accounts and reloads the list for the chosen one', async () => {
      const { wrapper } = await mountSftp(twoAccounts)

      expect(wrapper.find('[data-testid="sftp-account-selector"]').exists()).toBe(true)
      wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', twoAccounts.server_accounts[1])
      await flushPromises()

      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(2)
      expect(sftpApi.listSftpAccounts).toHaveBeenLastCalledWith(12)
      wrapper.unmount()
    })

    it('drops an older reload response that arrives after a newer one, so the newer rows stay', async () => {
      const { wrapper } = await mountSftp(twoAccounts)
      let resolveOlder: (value: sftpApi.SftpAccountsResponse) => void = () => {}
      let resolveNewer: (value: sftpApi.SftpAccountsResponse) => void = () => {}
      vi.mocked(sftpApi.listSftpAccounts)
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

      resolveNewer({ data: [{ user: 'newer_only', created_at: null, updated_at: null }], meta: { access_type: 'sftp', actions: [] } })
      await flushPromises()
      resolveOlder({ data: [{ user: 'older_a', created_at: null, updated_at: null }, { user: 'older_b', created_at: null, updated_at: null }], meta: { access_type: 'ssh', actions: [] } })
      await flushPromises()

      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.get('tbody tr').text()).toContain('newer_only')
      expect(wrapper.get('tbody tr').text()).not.toContain('older_a')
      wrapper.unmount()
    })

    it('hides the selector for a single server account', async () => {
      const { wrapper } = await mountSftp()

      expect(wrapper.find('[data-testid="sftp-account-selector"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('keeps the old rows on screen without a skeleton until the reload answers', async () => {
      const { wrapper } = await mountSftp(twoAccounts)
      let resolveSecond: (value: sftpApi.SftpAccountsResponse) => void = () => {}
      vi.mocked(sftpApi.listSftpAccounts).mockReturnValueOnce(new Promise(resolve => {
        resolveSecond = resolve
      }))

      wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', twoAccounts.server_accounts[1])
      await flushPromises()

      expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
      expect(wrapper.findAll('tbody tr')).toHaveLength(2)

      resolveSecond({ data: [{ user: 'second_only', created_at: null, updated_at: null }], meta: { access_type: 'sftp', actions: [] } })
      await flushPromises()

      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.get('tbody tr').text()).toContain('second_only')
      wrapper.unmount()
    })
  })

  it('shows the diagnostic alert and makes no request for an account in diagnostic mode', async () => {
    const { wrapper, alerts } = await mountSftp(makeService({
      server_accounts: [{ id: 11, domain: 'one.example.com', diagnostic_mode: true }],
    }))

    expect(sftpApi.listSftpAccounts).not.toHaveBeenCalled()
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'message.hostingAccountInDiagnosticMode' })
    expect(wrapper.find('[data-testid="sftp-table"]').exists()).toBe(false)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('project variant', () => {
    async function mountProject (service = makeService()) {
      const pinia = createPinia()
      setActivePinia(pinia)
      const wrapper = await mountKit(SftpView, { props: { service, variant: 'project' }, global: { plugins: [pinia] } })
      await flushPromises()
      return { wrapper, alerts: useAlertsStore() }
    }

    it('has the advanced page root and the page-title header', async () => {
      const { wrapper } = await mountProject()

      expect(wrapper.classes()).toContain('advanced-hosting-page')
      const container = wrapper.get('.page-title.page-title--advanced')
      expect(container.get('.page-title__title-box h4.page-title__title').attributes('data-testid')).toBe('sftp-title')
      const filters = container.get('.page-title__filter-controls')
      expect(filters.classes()).not.toContain('justify-end')
      expect(filters.classes()).not.toContain('align-end')
      expect(wrapper.find('.title-row').exists()).toBe(false)
      wrapper.unmount()
    })

    it('keeps the hosting header and root in the default variant', async () => {
      const { wrapper } = await mountSftp()

      expect(wrapper.classes()).not.toContain('advanced-hosting-page')
      expect(wrapper.find('.page-title--advanced').exists()).toBe(false)
      expect(wrapper.find('.title-row').exists()).toBe(true)
      wrapper.unmount()
    })

    it('does not show the account selector even for several accounts', async () => {
      const { wrapper } = await mountProject(twoAccounts)

      expect(wrapper.find('[data-testid="sftp-account-selector"]').exists()).toBe(false)
      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(1)
      expect(sftpApi.listSftpAccounts).toHaveBeenCalledWith(11)
      wrapper.unmount()
    })

    it('titles the page as SFTP and offers only Disconnect all, also when the plan allows SSH access', async () => {
      const { wrapper } = await mountProject(sshService)

      expect(wrapper.get('[data-testid="sftp-title"]').text()).toBe('heading.hosting.sftp.title')
      expect(wrapper.get('[data-testid="sftp-add"]').text()).toBe('button.sftp.add')
      const menu = await openActionsMenu(wrapper)
      expect(menu).toHaveLength(1)
      expect(menu[0]!.textContent).toContain('button.disconnect.all')
      wrapper.unmount()
    })

    it('prefixes the username of a WP Cloud account with the username in the Add modal', async () => {
      const { wrapper } = await mountProject(makeService({
        server_accounts: [{ id: 11, domain: 'one.example.com', server_type: 'wp-cloud', username: 'example', details: { remote_id: 'example-wpc' } } as unknown as HostingServerAccount],
      }))

      await wrapper.get('[data-testid="sftp-add"]').trigger('click')
      await flushPromises()

      const prefixes = wrapper.findAllComponents(BasicModalField).map(field => field.props('field').prefix)
      expect(prefixes).toContain('example_')
      expect(prefixes).not.toContain('example-wpc-')
      wrapper.unmount()
    })

    it('does not reload for a new service reference with the same account id', async () => {
      const { wrapper } = await mountProject()

      await wrapper.setProps({ service: makeService() })
      await flushPromises()

      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('reloads for a new account id', async () => {
      const { wrapper } = await mountProject()

      await wrapper.setProps({ service: makeService({ server_accounts: [{ id: 12, domain: 'two.example.com' }] }) })
      await flushPromises()

      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(2)
      expect(sftpApi.listSftpAccounts).toHaveBeenLastCalledWith(12)
      wrapper.unmount()
    })

    it('makes no request and keeps the skeleton without an account id', async () => {
      const { wrapper } = await mountProject(makeService({
        server_accounts: [{ id: undefined, domain: 'example.com' } as unknown as HostingServerAccount],
      }))

      expect(sftpApi.listSftpAccounts).not.toHaveBeenCalled()
      expect(wrapper.findComponent(HostingFtpTable).props('itemsLoading')).toBe(true)
      wrapper.unmount()
    })

    it('shows the diagnostic alert and no table', async () => {
      const { wrapper, alerts } = await mountProject(makeService({
        server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: true }],
      }))

      expect(sftpApi.listSftpAccounts).not.toHaveBeenCalled()
      expect(alerts.activeAlerts).toHaveLength(1)
      expect(wrapper.find('[data-testid="sftp-table"]').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  it('hides the search, Actions and Add in the title bar for an empty list, like legacy `v-if="items.length > 0"`', async () => {
    vi.mocked(sftpApi.listSftpAccounts).mockResolvedValue({ data: [], meta: { access_type: 'sftp', actions: [] } })
    const { wrapper } = await mountSftp()

    expect(wrapper.find('[data-testid="sftp-search"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sftp-actions-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sftp-add"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the error alert and stops loading when the list request fails', async () => {
    vi.mocked(sftpApi.listSftpAccounts).mockRejectedValue({ response: { data: { message: 'SFTP service is unavailable' } } })
    const { wrapper, alerts } = await mountSftp()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'SFTP service is unavailable' }])
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says the list could not be loaded instead of the empty state, and loads it again from Retry', async () => {
    vi.mocked(sftpApi.listSftpAccounts).mockRejectedValueOnce({ response: { data: { message: 'The server did not answer in time. Please try again in a moment.' } } })
    const { wrapper } = await mountSftp()

    expect(wrapper.get('[data-testid="sftp-load-error"]').text()).toContain('The server did not answer in time.')
    expect(wrapper.find('[data-testid="sftp-empty"]').exists()).toBe(false)

    vi.mocked(sftpApi.listSftpAccounts).mockResolvedValue({ data: [], meta: { actions: [], access_type: null } })
    await wrapper.get('[data-testid="sftp-load-error"] [data-testid="error-card-retry"]').trigger('click')
    await flushPromises()

    expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="sftp-load-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sftp-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('clears the search term when the table asks to clear the filters', async () => {
    const { wrapper } = await mountSftp()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'zzz-no-match')
    await flushPromises()
    expect(wrapper.findComponent(HostingFtpTable).props('searchTerm')).toBe('zzz-no-match')

    wrapper.findComponent(HostingFtpTable).vm.$emit('clear-filters')
    await flushPromises()
    expect(wrapper.findComponent(HostingFtpTable).props('searchTerm')).toBe('')
    wrapper.unmount()
  })

  describe('account modals', () => {
    beforeEach(() => {
      vi.mocked(sftpApi.createSftpAccount).mockResolvedValue(undefined)
      vi.mocked(sftpApi.updateSftpAccount).mockResolvedValue(undefined)
      vi.mocked(sftpApi.deleteSftpAccount).mockResolvedValue(undefined)
      vi.mocked(sftpApi.getSftpServerInfo).mockResolvedValue({ host: 'sftp.example.com', port: 2222 })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /** Clicks a row action of the first row: 0 Info, 1 Edit, 2 Delete (legacy order for `edit_password`). */
    async function clickRowAction (wrapper: Awaited<ReturnType<typeof mountSftp>>['wrapper'], index: number) {
      await wrapper.findAll('.actions-row .v-btn')[index]!.trigger('click')
      await flushPromises()
      return wrapper.findComponent(BasicModal)
    }

    /** Clicks the Add button of the title bar and waits for the modal. */
    async function openAdd (wrapper: Awaited<ReturnType<typeof mountSftp>>['wrapper']) {
      await wrapper.get('[data-testid="sftp-add"]').trigger('click')
      await flushPromises()
      return wrapper.findComponent(BasicModal)
    }

    function fieldAt (wrapper: Awaited<ReturnType<typeof mountSftp>>['wrapper'], index: number) {
      return wrapper.findAllComponents(BasicModalField)[index]!
    }

    /** The submit button is the first button of the card actions; Cancel is the second. */
    function submitOf (modal: { findAll: (selector: string) => DOMWrapper<Element>[] }): DOMWrapper<Element> {
      return modal.findAll('.v-card-actions .v-btn')[0]!
    }

    it('opens Add synchronously with the username field, the method select and the hidden public key', async () => {
      const { wrapper } = await mountSftp(makeService({
        server_accounts: [{ id: 11, domain: 'one.example.com', server_type: 'panelalpha', username: 'example' }],
      }))

      const modal = await openAdd(wrapper)

      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(1)
      expect(modal.props('title')).toBe('heading.hosting.sftp.modal.add.title')
      expect(fieldAt(wrapper, 0).text()).toContain('example_')
      expect(fieldAt(wrapper, 2).find('input').isVisible()).toBe(true)
      expect(fieldAt(wrapper, 3).find('input').isVisible()).toBe(false)
      wrapper.unmount()
    })

    it('posts the four form keys, alerts, reloads and closes, without a highlight', async () => {
      const { wrapper, alerts } = await mountSftp()
      const modal = await openAdd(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('blog')
      fieldAt(wrapper, 2).find('input').setValue('secret123')
      await flushPromises()
      submitOf(modal).trigger('click')
      await flushPromises()

      expect(sftpApi.createSftpAccount).toHaveBeenCalledWith(11, {
        username: 'blog',
        type: 'password',
        password: 'secret123',
        public_key: null,
      })
      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(2)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.sftp.add.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(0)
      wrapper.unmount()
    })

    it('keeps Add open and shows the API error when the create request fails', async () => {
      vi.mocked(sftpApi.createSftpAccount).mockRejectedValue({ response: { data: { message: 'Quota exceeded' } } })
      const { wrapper, alerts } = await mountSftp()
      const modal = await openAdd(wrapper)

      fieldAt(wrapper, 0).find('input').setValue('blog')
      fieldAt(wrapper, 2).find('input').setValue('secret123')
      await flushPromises()
      submitOf(modal).trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Quota exceeded' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(false)
      wrapper.unmount()
    })

    it('switches the password field for the public key when the method changes to SSH Key', async () => {
      const { wrapper } = await mountSftp()
      await openAdd(wrapper)

      fieldAt(wrapper, 1).findComponent(VSelect).vm.$emit('update:modelValue', 'public_key')
      await flushPromises()

      expect(fieldAt(wrapper, 2).find('input').isVisible()).toBe(false)
      expect(fieldAt(wrapper, 3).find('input').isVisible()).toBe(true)
      wrapper.unmount()
    })

    it('puts the edited user in the PUT path and sends the three keys, then highlights the row for 1 s', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { wrapper, alerts } = await mountSftp()
      const modal = await clickRowAction(wrapper, 1)

      expect(modal.props('title')).toBe('heading.hosting.sftp.modal.update.title')
      fieldAt(wrapper, 1).find('input').setValue('secret123')
      await flushPromises()
      submitOf(modal).trigger('click')
      await flushPromises()

      expect(sftpApi.updateSftpAccount).toHaveBeenCalledWith(11, 'example_deploy', {
        type: 'password',
        password: 'secret123',
        public_key: null,
      })
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.sftp.update.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(1)
      expect(wrapper.find('tbody tr.highlight').text()).toContain('example_deploy')

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(0)
      wrapper.unmount()
    })

    it('spins the row info button while the server info loads, then shows the escaped host and port', async () => {
      let resolveInfo: (info: { host: string, port: number }) => void = () => {}
      vi.mocked(sftpApi.getSftpServerInfo).mockReturnValue(new Promise(resolve => {
        resolveInfo = resolve
      }))
      const { wrapper } = await mountSftp()

      await wrapper.findAll('.actions-row .v-btn')[0]!.trigger('click')
      await nextTick()
      expect(wrapper.findAll('.actions-row .v-btn')[0]!.classes()).toContain('v-btn--loading')

      resolveInfo({ host: 'sftp<b>.example.com', port: 2222 })
      await flushPromises()

      expect(sftpApi.getSftpServerInfo).toHaveBeenCalledWith(11)
      const modal = wrapper.findComponent(BasicModal)
      expect(modal.props('message')).toContain('<span class="d-inline-block">sftp&lt;b&gt;.example.com</span>')
      expect(modal.props('buttons').map((button: { id: string }) => button.id)).toEqual(['cancel'])
      expect(wrapper.findAll('.actions-row .v-btn')[0]!.classes()).not.toContain('v-btn--loading')
      wrapper.unmount()
    })

    it('shows the error alert and no modal when the server info request fails', async () => {
      vi.mocked(sftpApi.getSftpServerInfo).mockRejectedValue({ response: { data: { message: 'No info' } } })
      const { wrapper, alerts } = await mountSftp()

      await clickRowAction(wrapper, 0)

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'No info' })
      expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
      wrapper.unmount()
    })

    it('keeps the Delete button disabled until the confirm checkbox is ticked, then deletes the account', async () => {
      const { wrapper, alerts } = await mountSftp()
      const modal = await clickRowAction(wrapper, 2)

      expect(modal.props('confirmRequired')).toBe(true)
      expect(submitOf(modal).attributes('disabled')).toBeDefined()

      fieldAt(wrapper, 0).find('input[type="checkbox"]').setValue(true)
      await flushPromises()
      expect(submitOf(modal).attributes('disabled')).toBeUndefined()

      submitOf(modal).trigger('click')
      await flushPromises()

      expect(sftpApi.deleteSftpAccount).toHaveBeenCalledWith(11, 'example_deploy')
      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(2)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.sftp.delete.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
      wrapper.unmount()
    })

    it('opens Info after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
      const { wrapper } = await mountSftp()
      await clickRowAction(wrapper, 0)

      const overlay = expectOverlayBeforeCard('[data-testid="sftp-modal"]')
      expectLegacyTransition(wrapper)
      await clickOverlay(overlay)

      expect(openDialogs(wrapper)).toBe(0)
      wrapper.unmount()
    })
  })

  describe('server modals', () => {
    beforeEach(() => {
      vi.mocked(sftpApi.disconnectAllSftp).mockResolvedValue(undefined)
      vi.mocked(sftpApi.setSftpAccessType).mockResolvedValue(undefined)
    })

    /** Opens the Actions menu and clicks one item: 0 Disconnect all, 1 Manage SSH access (SSH plans only). */
    async function clickActionsItem (wrapper: Mounted, index: number) {
      const items = await openActionsMenu(wrapper)
      items[index]!.click()
      await flushPromises()
      return wrapper.findComponent(BasicModal)
    }

    /** The submit button is the first button of the card actions; Cancel is the second. */
    function submitOf (modal: { findAll: (selector: string) => DOMWrapper<Element>[] }): DOMWrapper<Element> {
      return modal.findAll('.v-card-actions .v-btn')[0]!
    }

    function fieldAt (wrapper: Mounted, index: number) {
      return wrapper.findAllComponents(BasicModalField)[index]!
    }

    it('opens Disconnect all from the Actions menu with its title and message', async () => {
      const { wrapper } = await mountSftp()

      const modal = await clickActionsItem(wrapper, 0)

      expect(modal.props('title')).toBe('heading.hosting.sftp.modal.disconnect.title')
      expect(modal.props('message')).toBe('heading.hosting.sftp.modal.disconnect.message')
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      wrapper.unmount()
    })

    it('posts disconnect-all, alerts, closes and does not reload the list', async () => {
      const { wrapper, alerts } = await mountSftp()
      const modal = await clickActionsItem(wrapper, 0)

      submitOf(modal).trigger('click')
      await flushPromises()

      expect(sftpApi.disconnectAllSftp).toHaveBeenCalledWith(11)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.sftp.disconnect.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('keeps Disconnect all open and shows the API error when the request fails', async () => {
      vi.mocked(sftpApi.disconnectAllSftp).mockRejectedValue({ response: { data: { message: 'Server busy' } } })
      const { wrapper, alerts } = await mountSftp()
      const modal = await clickActionsItem(wrapper, 0)

      submitOf(modal).trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Server busy' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(false)
      wrapper.unmount()
    })

    it('opens Manage access with the page access type and posts the chosen one without a loader or a reload', async () => {
      let resolveSet: () => void = () => {}
      vi.mocked(sftpApi.setSftpAccessType).mockReturnValueOnce(new Promise<void>(resolve => {
        resolveSet = resolve
      }))
      const { wrapper, alerts } = await mountSftp(sshService)
      const modal = await clickActionsItem(wrapper, 1)

      expect(modal.props('title')).toBe('heading.hosting.ssh.modal.manageSSH.title')
      expect(fieldAt(wrapper, 0).findComponent(VSelect).props('modelValue')).toBe('sftp')

      fieldAt(wrapper, 0).findComponent(VSelect).vm.$emit('update:modelValue', 'ssh')
      await flushPromises()
      submitOf(modal).trigger('click')
      await nextTick()

      expect(sftpApi.setSftpAccessType).toHaveBeenCalledWith(11, 'ssh')
      expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(false)
      expect(wrapper.findComponent(BasicModal).find('.v-btn--loading').exists()).toBe(false)

      resolveSet()
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.hosting.ssh.setAccessType.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
      expect(sftpApi.listSftpAccounts).toHaveBeenCalledTimes(1)

      await clickActionsItem(wrapper, 1)
      expect(fieldAt(wrapper, 0).findComponent(VSelect).props('modelValue')).toBe('sftp')
      wrapper.unmount()
    })

    it('shows the API error and keeps Manage access open when the set request fails', async () => {
      vi.mocked(sftpApi.setSftpAccessType).mockRejectedValue({ response: { data: { message: 'Access locked' } } })
      const { wrapper, alerts } = await mountSftp(sshService)
      const modal = await clickActionsItem(wrapper, 1)

      submitOf(modal).trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Access locked' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      wrapper.unmount()
    })
  })
})
