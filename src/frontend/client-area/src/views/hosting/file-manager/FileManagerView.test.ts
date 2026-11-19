import type { HostingService } from '@/views/hosting/hosting.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { makeService } from '@/views/hosting/hosting.fixtures'
import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import { initialize } from './file-manager.api'
import FileManagerView from './FileManagerView.vue'

// The card mounts the File Manager, which opens the account over the API; these tests only check the host.
vi.mock('./file-manager.api', () => ({
  initialize: vi.fn(() => new Promise(() => {})),
  content: vi.fn(() => new Promise(() => {})),
}))

const DIAGNOSTIC_ALERT = 'message.hostingAccountInDiagnosticMode'

async function mountFileManager (service: HostingService = makeService(), variant?: 'hosting' | 'project') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(FileManagerView, { props: { service, variant }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

function alertMessages (alerts: ReturnType<typeof useAlertsStore>): unknown[] {
  return alerts.activeAlerts.map(alert => alert.errorMessage)
}

describe('FileManagerView', () => {
  it('shows the title and the file-manager card of the first account, without a selector or alerts', async () => {
    const { wrapper, alerts } = await mountFileManager()

    expect(wrapper.get('[data-testid="file-manager-title"]').text()).toBe('heading.hosting.fileManager.title')
    expect(wrapper.find('[data-testid="file-manager"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="file-manager-account-selector"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-manager-wp-cloud-alert"]').exists()).toBe(false)
    expect(alerts.activeAlerts).toEqual([])
    wrapper.unmount()
  })

  it('keeps the legacy alert and card geometry in classes, not inline styles, for both variants', async () => {
    for (const variant of ['hosting', 'project'] as const) {
      const { wrapper } = await mountFileManager(makeService({ hosting_server_type: 'wp-cloud' }), variant)

      const alert = wrapper.get('[data-testid="file-manager-wp-cloud-alert"]')
      expect(alert.attributes('style')).toBeUndefined()
      expect(alert.classes()).toContain('file-manager-wp-cloud-alert')

      const card = wrapper.get('[data-testid="file-manager"]')
      expect(card.attributes('style')).toBeUndefined()
      expect(card.classes()).toContain('file-manager-frame')
      wrapper.unmount()
    }
  })

  it('shows the account selector only with more than one account', async () => {
    const { wrapper } = await mountFileManager(makeService({
      server_accounts: [{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }],
    }))

    expect(wrapper.find('[data-testid="file-manager-account-selector"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('mounts the File Manager anew for another account, so its local state does not carry over', async () => {
    const { wrapper } = await mountFileManager(makeService({
      server_accounts: [{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }],
    }))
    const first = wrapper.findComponent({ name: 'FileManager' }).vm

    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', { id: 12, domain: 'b.test' })
    await flushPromises()

    const second = wrapper.findComponent({ name: 'FileManager' })
    expect(second.props('accountId')).toBe(12)
    expect(second.vm).not.toBe(first)
    wrapper.unmount()
  })

  it('shows the wp-cloud warning for a wp-cloud service', async () => {
    const { wrapper } = await mountFileManager(makeService({ hosting_server_type: 'wp-cloud' }))

    expect(wrapper.get('[data-testid="file-manager-wp-cloud-alert"]').text()).toBe('heading.hosting.fileManager.alert.wpCloud')
    wrapper.unmount()
  })

  it('alerts on the first visit of a diagnostic account and renders no card', async () => {
    const { wrapper, alerts } = await mountFileManager(makeService({
      server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: true }],
    }))

    expect(alertMessages(alerts)).toEqual([DIAGNOSTIC_ALERT])
    expect(wrapper.find('[data-testid="file-manager"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('alerts and hides the card after switching to a diagnostic account, and shows it again after switching back', async () => {
    const healthy = { id: 11, domain: 'a.test', diagnostic_mode: false }
    const diagnostic = { id: 12, domain: 'b.test', diagnostic_mode: true }
    const { wrapper, alerts } = await mountFileManager(makeService({ server_accounts: [healthy, diagnostic] }))
    expect(alerts.activeAlerts).toEqual([])

    const selector = wrapper.findComponent(ActiveServerAccountSelector)
    selector.vm.$emit('update:modelValue', diagnostic)
    await flushPromises()

    expect(alertMessages(alerts)).toEqual([DIAGNOSTIC_ALERT])
    expect(wrapper.find('[data-testid="file-manager"]').exists()).toBe(false)

    selector.vm.$emit('update:modelValue', healthy)
    await flushPromises()

    expect(alertMessages(alerts)).toEqual([DIAGNOSTIC_ALERT])
    expect(wrapper.find('[data-testid="file-manager"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('selects the first account of another service', async () => {
    const { wrapper, alerts } = await mountFileManager()

    await wrapper.setProps({
      service: makeService({ id: 2, server_accounts: [{ id: 21, domain: 'c.test', diagnostic_mode: true }] }),
    })
    await flushPromises()

    expect(alertMessages(alerts)).toEqual([DIAGNOSTIC_ALERT])
    expect(wrapper.find('[data-testid="file-manager"]').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('project variant', () => {
    it('has the advanced page root, the page-title header and the card of the account, without a selector', async () => {
      const { wrapper, alerts } = await mountFileManager(makeService({
        server_accounts: [{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }],
      }), 'project')

      expect(wrapper.classes()).toContain('advanced-hosting-page')
      const container = wrapper.get('.page-title.page-title--advanced')
      expect(container.get('.page-title__title-box .page-title__title').text()).toBe('heading.hosting.fileManager.title')
      expect(wrapper.get('[data-testid="file-manager-title"]').element.tagName).toBe('H4')
      expect(wrapper.find('[data-testid="file-manager-account-selector"]').exists()).toBe(false)
      expect(wrapper.find('.title-row').exists()).toBe(false)
      expect(wrapper.findComponent({ name: 'FileManager' }).props('accountId')).toBe(11)
      // The card container stays a sibling of the header one (`.page-title + .container`).
      expect(container.element.nextElementSibling?.querySelector('[data-testid="file-manager"]')).not.toBeNull()
      expect(alerts.activeAlerts).toEqual([])
      wrapper.unmount()
    })

    it('keeps the wp-cloud warning in the header container', async () => {
      const { wrapper } = await mountFileManager(makeService({ hosting_server_type: 'wp-cloud' }), 'project')

      const alert = wrapper.get('.page-title--advanced [data-testid="file-manager-wp-cloud-alert"]')
      expect(alert.text()).toBe('heading.hosting.fileManager.alert.wpCloud')
      expect(wrapper.find('.wp-cloud-row .wp-cloud-col').exists()).toBe(true)
      wrapper.unmount()
    })

    it('renders no card and no alert for a diagnostic account', async () => {
      const { wrapper, alerts } = await mountFileManager(makeService({
        server_accounts: [{ id: 11, domain: 'a.test', diagnostic_mode: true }],
      }), 'project')

      expect(wrapper.find('[data-testid="file-manager"]').exists()).toBe(false)
      expect(alerts.activeAlerts).toEqual([])
      wrapper.unmount()
    })

    it('mounts no card and sends no request for an account without id', async () => {
      vi.mocked(initialize).mockClear()
      const { wrapper } = await mountFileManager(makeService({
        server_accounts: [{ id: undefined, domain: 'a.test' } as never],
      }), 'project')

      expect(wrapper.find('[data-testid="file-manager"]').exists()).toBe(false)
      expect(initialize).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('keeps the hosting frame by default', async () => {
      const { wrapper } = await mountFileManager()

      expect(wrapper.classes()).not.toContain('advanced-hosting-page')
      expect(wrapper.find('.page-title--advanced').exists()).toBe(false)
      wrapper.unmount()
    })
  })
})
