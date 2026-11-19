import type * as InstancesApi from './instances.api'
import type { RawInstance } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as deployLogsApi from '@/entities/project/instance-deploy-logs.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import DnsSslIndicator from '@/entities/project/ui/DnsSslIndicator.vue'
import PreviewSiteModal from '@/entities/project/ui/PreviewSiteModal.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import InstanceItem from './InstanceItem.vue'
import PreviewSiteButton from './PreviewSiteButton.vue'

vi.mock('./instances.api', async importOriginal => {
  const actual: typeof InstancesApi = await importOriginal()
  return {
    ...actual,
    uploadDeployArchive: vi.fn(),
    redeployInstance: vi.fn(),
  }
})
vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  listDeployLogs: vi.fn(),
  getDeployLogsLive: vi.fn(),
  getDeployLog: vi.fn(),
  cancelDeploy: vi.fn(),
  downloadDeployLog: vi.fn(),
}))

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    service_created_at: '2026-01-01T00:00:00.000Z',
    version: '6.5.0',
    has_automatic_backup: true,
    backup_details: [{ id: 1, type: 'automatic' }],
    async_status: { installation: 'finished' },
    labels: [],
    privileges: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

async function mountItem (overrides: Partial<RawInstance> = {}, props: Record<string, unknown> = {}, singleServer = false, integrations: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { integrations, single_server: { active: singleServer } }, user: {} })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  const item = toInstanceResource(raw(overrides))
  const wrapper = await mountKit(InstanceItem, { props: { item, ...props }, global: { plugins: [pinia, router] } })
  return { wrapper, item }
}

/** How many `PreviewSiteModal`s of the card are open (the DNS indicator brings its own closed one). */
function openedPreviews (wrapper: Awaited<ReturnType<typeof mountItem>>['wrapper']): number {
  return wrapper.findAllComponents(PreviewSiteModal).filter(modal => modal.props('modelValue')).length
}

describe('InstanceItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders the legacy card: title link, url link, no-preview image', async () => {
    const { wrapper } = await mountItem()
    expect(wrapper.classes()).toContain('data-iterator-card')
    const title = wrapper.get('.data-iterator-card__title')
    expect(title.text()).toBe('Acme')
    expect(title.element.closest('a')?.getAttribute('href')).toBe('/instances/7/general')
    const url = wrapper.get('a.instance-domain-link')
    expect(url.attributes('href')).toBe('https://acme.example.com')
    expect(url.attributes('target')).toBe('_blank')
    expect(wrapper.find('.v-card__img-not-available').exists()).toBe(true)
    expect(wrapper.find('.preview-not-available').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the screenshot instead of the placeholder', async () => {
    const { wrapper } = await mountItem({ screenshot_time: 123 })
    expect(wrapper.find('.v-card__img-not-available').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-card__image').exists()).toBe(true)
    wrapper.unmount()
  })

  it('marks a selected card and emits checked from the checkbox', async () => {
    const { wrapper } = await mountItem({}, { checked: true })
    expect(wrapper.classes()).toContain('data-iterator-card--selected')
    await wrapper.get('.data-iterator-card__checkbox-container input').setValue(false)
    expect(wrapper.emitted('checked')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  // The card box is icon-less and label-less: a screen reader reads "checkbox" alone without a name (a11y).
  it('names the selection checkbox after the project', async () => {
    const { wrapper } = await mountItem()
    expect(wrapper.get('.data-iterator-card__checkbox-container input').attributes('aria-label')).toBe('button.selectProject')
    wrapper.unmount()
  })

  it('marks a suspended or cancelled card and emits unsuspend with true when no link is set', async () => {
    const { wrapper } = await mountItem({ service_status: 'suspended' })
    expect(wrapper.classes()).toContain('data-iterator-card--suspended')
    expect(wrapper.text()).toContain('message.serviceSuspended')
    await wrapper.get('.instance-actions--suspended').trigger('click')
    expect(wrapper.emitted('unsuspend')?.[0]).toEqual([true])
    wrapper.unmount()

    const cancelled = await mountItem({ service_status: 'cancelled' })
    expect(cancelled.wrapper.classes()).toContain('data-iterator-card--suspended')
    cancelled.wrapper.unmount()
  })

  it('emits unsuspend with the link of /home when the user has one', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().hydrateHome({ app: {}, user: { service_unsuspend_link: 'https://pay.example.com' } })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    const wrapper = await mountKit(InstanceItem, {
      props: { item: toInstanceResource(raw({ service_status: 'suspended' })) },
      global: { plugins: [pinia, router] },
    })
    await wrapper.get('.instance-actions--suspended').trigger('click')
    expect(wrapper.emitted('unsuspend')?.[0]).toEqual(['https://pay.example.com'])
    wrapper.unmount()
  })

  it('renders live and staging chips from the instance and its sub-instances', async () => {
    const child = raw({ id: 8, staging: true, name: 'Acme staging', url: 'https://staging.acme.example.com' })
    const { wrapper } = await mountItem({ staging_apps: [child] })
    const chips = wrapper.findAll('.label-simple').map(label => label.text())
    expect(chips).toEqual(['live', 'staging'])
    wrapper.unmount()
  })

  it('shows the label chips and re-emits a clicked label as toggle-filter', async () => {
    const { wrapper } = await mountItem({ labels: [{ title: 'Prod', color: '#07C07E' }] })
    const chip = wrapper.get('.label-chip')
    expect(chip.text()).toBe('Prod')
    await chip.trigger('click')
    expect(wrapper.emitted('toggle-filter')?.[0]).toEqual([{ title: 'Prod', color: '#07C07E' }])
    wrapper.unmount()
  })

  it('shows the shares chip only with the privilege and a share count', async () => {
    const withShares = await mountItem({
      privileges: ['general.manage_shared_access'],
      shared_access: [{ email: 'a@example.com', role: 'view_only' }, { email: 'b@example.com', role: 'developer' }],
    })
    expect(withShares.wrapper.find('.shares-label').text()).toBe('2')
    await withShares.wrapper.get('.shares-label').trigger('click')
    expect(withShares.wrapper.emitted('share')).toHaveLength(1)
    withShares.wrapper.unmount()

    const noPrivilege = await mountItem({ shared_access: [{ email: 'a@example.com', role: 'view_only' }] })
    expect(noPrivilege.wrapper.find('.shares-label').exists()).toBe(false)
    noPrivilege.wrapper.unmount()
  })

  it('does not link the title while the installation runs', async () => {
    const { wrapper } = await mountItem({ async_status: { installation: 'in_progress' } })
    expect(wrapper.find('.data-iterator-card__checkbox-container').exists()).toBe(false)
    expect(wrapper.find('.v-card__img-installation-pending').exists()).toBe(true)
    expect(wrapper.get('.data-iterator-card__title').element.closest('a')).toBeNull()
    wrapper.unmount()
  })

  it('skips the DNS/SSL indicator for an IP url', async () => {
    const { wrapper } = await mountItem({ url: 'http://203.0.113.10' })
    expect(wrapper.find('.dns-ssl-icon').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('hover overlay and card variants', () => {
    it('links the overlay and the Manage site button to the instance and lists WP Admin', async () => {
      const { wrapper } = await mountItem()
      const overlay = wrapper.get('a.instance-actions')
      expect(overlay.attributes('href')).toBe('/instances/7/general')
      const buttons = wrapper.findAll('.instance-actions__content .v-btn')
      expect(buttons.map(button => button.text())).toEqual(['button.site.manage', 'button.wpAdmin'])
      wrapper.unmount()
    })

    it('has no link on the overlay of an inactive instance', async () => {
      const { wrapper } = await mountItem({ status: 'pending' })
      expect(wrapper.get('a.instance-actions').attributes('href')).not.toBe('/instances/7/general')
      wrapper.unmount()
    })

    it('emits wp-admin with the instance from the WP Admin button', async () => {
      const { wrapper, item } = await mountItem()
      await wrapper.findAll('.instance-actions__content .v-btn')[1]!.trigger('click')
      expect(wrapper.emitted('wp-admin')?.[0]).toEqual([item])
      wrapper.unmount()
    })

    it('offers "Why?" on the overlay of a card without a screenshot only', async () => {
      const without = await mountItem()
      expect(without.wrapper.find('.instance-actions__content .preview-not-available__text').exists()).toBe(true)
      without.wrapper.unmount()

      const withShot = await mountItem({ screenshot_time: 123 })
      expect(withShot.wrapper.find('.instance-actions__content .preview-not-available__text').exists()).toBe(false)
      withShot.wrapper.unmount()
    })

    it('shows the installation progress, "management not available" and Cancel, which only emits', async () => {
      const { wrapper, item } = await mountItem({ async_status: { installation: 'in_progress' }, import_details: null } as Partial<RawInstance>)
      expect(wrapper.get('.installation-pending__text').text()).toBe('message.status.install.inProgress')
      const content = wrapper.get('.instance-actions__content')
      expect(content.classes()).toContain('instance-actions__content--pending')
      expect(content.text()).toContain('message.managementNotAvailable')
      expect(wrapper.find('.instance-actions__content .link-hover').exists()).toBe(false)

      await wrapper.get('.cancel-installation-btn').trigger('click')
      expect(wrapper.emitted('cancel-install')?.[0]).toEqual([item])
      expect(wrapper.find('.v-dialog').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows the failed installation on the red gradient with Try again and Cancel', async () => {
      const { wrapper, item } = await mountItem({ async_status: { installation: 'failed' }, import_details: null } as Partial<RawInstance>)
      expect(wrapper.get('.v-card__img').classes()).toContain('v-card__img-installation-pending--error')
      expect(wrapper.get('.installation-pending__text').text()).toContain('message.status.install.failed')
      expect(wrapper.get('.instance-actions__content').classes()).toContain('instance-actions__content--error')

      const buttons = wrapper.findAll('.instance-actions__content .v-btn')
      expect(buttons.map(button => button.text())).toEqual(['button.try', 'button.installation.cancel'])
      await buttons[0]!.trigger('click')
      await buttons[1]!.trigger('click')
      expect(wrapper.emitted('retry-install')?.[0]).toEqual([item])
      expect(wrapper.emitted('cancel-install')?.[0]).toEqual([item])
      wrapper.unmount()
    })

    it('shows the import progress with its step and percent, Import details and Cancel', async () => {
      const importDetails = { current_step: { name: 'installNewInstance', percent: 40 } }
      const { wrapper, item } = await mountItem({ async_status: { installation: 'in_progress' }, import_details: importDetails } as Partial<RawInstance>)
      expect(wrapper.find('.installation-pending').exists()).toBe(false)
      const pending = wrapper.get('.import-pending__step')
      expect(pending.text()).toContain('message.status.importing.inProgress')
      expect(pending.text()).toContain('heading.instance.modal.importDetails.step.installNewInstance.title')
      expect(pending.text()).toContain('40%')

      const content = wrapper.get('.instance-actions__content')
      expect(content.text()).toContain('message.status.importing.inProgress')
      const buttons = wrapper.findAll('.instance-actions__content .v-btn')
      expect(buttons.map(button => button.text())).toEqual(['button.import.details', 'button.import.cancel'])
      await buttons[0]!.trigger('click')
      await buttons[1]!.trigger('click')
      expect(wrapper.emitted('import-details')?.[0]).toEqual([item])
      expect(wrapper.emitted('cancel-install')?.[0]).toEqual([item])
      wrapper.unmount()
    })

    it('shows an import without a step percent as an indeterminate bar', async () => {
      const { wrapper } = await mountItem({ async_status: { installation: 'in_progress' }, import_details: { current_step: null } } as Partial<RawInstance>)
      expect(wrapper.find('.import-pending__progress .v-progress-linear__indeterminate').exists()).toBe(true)
      expect(wrapper.get('.import-pending__progress').attributes('aria-valuenow')).toBeUndefined()
      expect(wrapper.find('.import-pending__step .justify-space-between').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows the failed import with Import details and no Try again', async () => {
      const { wrapper, item } = await mountItem({ async_status: { installation: 'failed' }, import_details: { current_step: null } } as Partial<RawInstance>)
      expect(wrapper.get('.import-pending__text').text()).toContain('message.status.importing.failed')
      const buttons = wrapper.findAll('.instance-actions__content .v-btn')
      expect(buttons.map(button => button.text())).toEqual(['button.import.details', 'button.import.cancel'])
      await buttons[0]!.trigger('click')
      expect(wrapper.emitted('import-details')?.[0]).toEqual([item])
      wrapper.unmount()
    })

    it('has no overlay buttons on a suspended card, only the unsuspend prompt', async () => {
      const { wrapper } = await mountItem({ service_status: 'suspended' })
      expect(wrapper.find('.instance-actions__content').exists()).toBe(false)
      expect(wrapper.find('a.instance-actions').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('app-lite single server', () => {
    const custom = (overrides: Partial<RawInstance> = {}) => ({ type: 'custom', import_details: null, ...overrides }) as Partial<RawInstance>

    it('links the card to /projects (the overlay and the title), with the app behaviour unchanged on multi server', async () => {
      const lite = await mountItem(custom(), {}, true)
      expect(lite.wrapper.get('.data-iterator-card__title').element.closest('a')?.getAttribute('href')).toBe('/projects/7/general')
      expect(lite.wrapper.get('a.instance-actions').attributes('href')).toBe('/projects/7')
      lite.wrapper.unmount()

      const app = await mountItem()
      expect(app.wrapper.get('.data-iterator-card__title').element.closest('a')?.getAttribute('href')).toBe('/instances/7/general')
      expect(app.wrapper.get('a.instance-actions').attributes('href')).toBe('/instances/7/general')
      app.wrapper.unmount()
    })

    it('labels the overlay buttons of a custom project "Manage" and "Open project" (external-link icon), and opens the preview dialog', async () => {
      // A single server always opens the project.
      const { wrapper } = await mountItem(custom(), {}, true)
      const buttons = wrapper.findAll('.instance-actions__content .v-btn')
      expect(buttons.map(button => button.text())).toEqual(['button.manage', 'button.openProject'])
      expect(buttons[1]!.find('.v-icon').exists()).toBe(true)
      await buttons[1]!.trigger('click')
      await wrapper.vm.$nextTick()
      expect(openedPreviews(wrapper)).toBe(1)
      expect(wrapper.emitted('app-login')).toBeUndefined()
      expect(wrapper.emitted('wp-admin')).toBeUndefined()
      wrapper.unmount()
    })

    it('opens a panelalpha.online project in a new tab instead of the preview dialog', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      const { wrapper } = await mountItem(custom({ url: 'https://demo.panelalpha.online' }), {}, true)
      await wrapper.findAll('.instance-actions__content .v-btn')[1]!.trigger('click')
      expect(open).toHaveBeenCalledWith('https://demo.panelalpha.online', '_blank', 'noopener,noreferrer')
      expect(openedPreviews(wrapper)).toBe(0)
      open.mockRestore()
      wrapper.unmount()
    })

    it('does not render the Preview Site row under single server, even with the provider and DNS propagation', async () => {
      // The app-lite card has no PreviewSiteButton; the app-only row stays for multi server with the provider.
      const { wrapper } = await mountItem({}, {}, true, { preview_site_provider_enabled: true })
      wrapper.findComponent(DnsSslIndicator).vm.$emit('dns-propagation-in-progress')
      await wrapper.vm.$nextTick()
      expect(wrapper.findComponent(PreviewSiteButton).exists()).toBe(false)
      wrapper.unmount()
    })

    it('renders the Preview Site row under multi server with the provider during DNS propagation', async () => {
      const { wrapper } = await mountItem({}, {}, false, { preview_site_provider_enabled: true })
      wrapper.findComponent(DnsSslIndicator).vm.$emit('dns-propagation-in-progress')
      await wrapper.vm.$nextTick()
      expect(wrapper.findComponent(PreviewSiteButton).exists()).toBe(true)
      wrapper.unmount()
    })

    it('labels the overlay of a wordpress site under single server "Manage site" and "Open project"', async () => {
      const { wrapper } = await mountItem({}, {}, true)
      const buttons = wrapper.findAll('.instance-actions__content .v-btn')
      expect(buttons.map(button => button.text())).toEqual(['button.site.manage', 'button.openProject'])
      wrapper.unmount()
    })

    it('shows the deploy-in-progress image and overlay with Show logs and Cancel deploy', async () => {
      const { wrapper, item } = await mountItem(custom({ async_status: { installation: 'in_progress' } }), {}, true)
      expect(wrapper.find('.deploy-pending').exists()).toBe(true)
      expect(wrapper.find('.deploy-pending--error').exists()).toBe(false)
      expect(wrapper.get('.deploy-pending__text').text()).toBe('deployLogs.deployInProgress')
      expect(wrapper.find('.installation-pending').exists()).toBe(false)

      const content = wrapper.get('.instance-actions__content')
      expect(content.text()).toContain('deployLogs.deployInProgress')
      const row = wrapper.get('.instance-actions__row')
      expect(row.findAll('.v-btn').map(button => button.text())).toEqual(['deployLogs.showLogs', 'deployLogs.cancelDeploy'])

      vi.mocked(deployLogsApi.cancelDeploy).mockResolvedValue()
      await row.findAll('.v-btn')[1]!.trigger('click')
      await vi.waitFor(() => expect(deployLogsApi.cancelDeploy).toHaveBeenCalledWith(item.id))
      expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'deployLogs.deployCancelled' })
      wrapper.unmount()
    })

    it('shows the deploy-failed image and overlay with Show logs, the download icon, Try again and Cancel', async () => {
      const { wrapper, item } = await mountItem(custom({ async_status: { installation: 'failed' } }), {}, true)
      expect(wrapper.find('.deploy-pending--error').exists()).toBe(true)
      expect(wrapper.get('.deploy-pending__text').text()).toBe('deployLogs.deployFailed')
      expect(wrapper.get('[data-testid="instance-actions-message"]').text()).toBe('deployLogs.deployFailed')
      expect(wrapper.find('[data-testid="instance-show-logs"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="instance-download-logs"]').attributes('title')).toBe('deployLogs.downloadLog')

      await wrapper.get('[data-testid="instance-retry-install"]').trigger('click')
      await wrapper.get('[data-testid="instance-cancel-install"]').trigger('click')
      expect(wrapper.emitted('retry-install')?.[0]).toEqual([item])
      expect(wrapper.emitted('cancel-install')?.[0]).toEqual([item])
      wrapper.unmount()
    })

    it('Show logs opens the modal live while the deploy runs, and the latest log after a failure', async () => {
      vi.mocked(deployLogsApi.getDeployLogsLive).mockResolvedValue({ panel: { id: 9 }, engine: { status: 'running', stage: 'preparing', stages: [], lines: [], next_offset: 0 } })
      const running = await mountItem(custom({ async_status: { installation: 'in_progress' } }), {}, true)
      await running.wrapper.get('[data-testid="instance-show-logs"]').trigger('click')
      await vi.waitFor(() => expect(deployLogsApi.getDeployLogsLive).toHaveBeenCalledWith(7, 0))
      expect(deployLogsApi.listDeployLogs).not.toHaveBeenCalled()
      running.wrapper.unmount()
      document.body.innerHTML = ''

      vi.mocked(deployLogsApi.listDeployLogs).mockResolvedValue([{ id: 31, status: 'failed' }, { id: 30, status: 'finished' }])
      vi.mocked(deployLogsApi.getDeployLog).mockResolvedValue({ status: 'failed', stages: [], lines: [{ msg: 'boom' }], error: null })
      const failed = await mountItem(custom({ async_status: { installation: 'failed' } }), {}, true)
      await failed.wrapper.get('[data-testid="instance-show-logs"]').trigger('click')
      await vi.waitFor(() => expect(deployLogsApi.getDeployLog).toHaveBeenCalledWith(7, 31))
      failed.wrapper.unmount()
      document.body.innerHTML = ''
    })

    it('downloads the latest log, or alerts when the project has no deploys', async () => {
      vi.mocked(deployLogsApi.downloadDeployLog).mockResolvedValue()
      vi.mocked(deployLogsApi.listDeployLogs).mockResolvedValueOnce([{ id: 31 }]).mockResolvedValueOnce([])
      const { wrapper } = await mountItem(custom({ async_status: { installation: 'failed' } }), {}, true)
      await wrapper.get('[data-testid="instance-download-logs"]').trigger('click')
      await vi.waitFor(() => expect(deployLogsApi.downloadDeployLog).toHaveBeenCalledWith(7, 31))

      await wrapper.get('[data-testid="instance-download-logs"]').trigger('click')
      await vi.waitFor(() => expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'deployLogs.noDeploys' }))
      expect(deployLogsApi.downloadDeployLog).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('raises no deploy issue for a custom project (they come from app-health)', async () => {
      const { wrapper } = await mountItem(custom(), {}, true)
      expect(wrapper.find('.status-indicator--warning').exists()).toBe(false)
      wrapper.unmount()
    })
  })
})
