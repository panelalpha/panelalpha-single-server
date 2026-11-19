import type * as InstancesApi from './instances.api'
import type * as LabelsApi from '@/entities/label/labels.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as labelsApi from '@/entities/label/labels.api'
import * as actionsApi from '@/entities/project/instance-actions.api'
import { type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as instancesApi from './instances.api'
import InstancesView from './InstancesView.vue'

// The app-lite pieces of the row actions: "Admin Area" of the kebab (`supports_admin_sso`) opens `AppSsoModal` (users from
// `GET /instances/:id/users`), "Open Project" of the card overlay opens the project (preview dialog), Show Logs opens the deploy logs.

vi.mock('@/entities/project/instance-actions.api', async importOriginal => {
  const actual: typeof actionsApi = await importOriginal()
  return {
    ...actual,
    getAppSsoUsers: vi.fn(),
    createAppSsoUrl: vi.fn(),
    createAppSsoPreviewUrl: vi.fn(),
    getWordpressSsoUsers: vi.fn(),
  }
})

vi.mock('./instances.api', async importOriginal => {
  const actual: typeof InstancesApi = await importOriginal()
  return {
    ...actual,
    listInstances: vi.fn(),
  }
})
vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  listDeployLogs: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/entities/label/labels.api', async importOriginal => {
  const actual: typeof LabelsApi = await importOriginal()
  return {
    ...actual,
    getLabels: vi.fn(),
  }
})

function project (id: number, overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id,
    type: 'custom',
    name: `Project ${id}`,
    url: 'https://203.0.113.20',
    domain: 'project.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    service_created_at: '2026-01-01T00:00:00.000Z',
    async_status: { installation: 'finished' },
    labels: [],
    privileges: ['general.manage_users'],
    supports_admin_sso: true,
    plan_settings: {},
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountView (items: RawInstance[], style: '0' | '1') {
  vi.mocked(instancesApi.listInstances).mockResolvedValue({ data: items.map(item => toInstanceResource(item)), meta: { total: items.length } })
  localStorage.setItem('instancesListStyle', style)
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.hydrateHome({ app: { integrations: {}, single_server: { active: true } }, user: { name: 'Jane', services: [] } })
  vi.spyOn(session, 'ensureHome').mockResolvedValue(session.home!)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(InstancesView, { global: { plugins: [pinia, router] }, attachTo: host })
  await flushPromises()
  return wrapper
}

const USERS = [
  { id: 1, email: 'ann@example.com', username: 'ann' },
  { id: 2, email: null, username: 'bob' },
]

describe('InstancesView app-lite row actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(labelsApi.getLabels).mockResolvedValue([])
    vi.mocked(actionsApi.getAppSsoUsers).mockResolvedValue(USERS)
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('Admin Area of the kebab loads the project users and opens the Admin Area dialog', async () => {
    const wrapper = await mountView([project(3)], '1')

    document.querySelector<HTMLElement>('#instance-item-3')!.click()
    await flushPromises()
    bodyQuery('[data-testid="instance-menu-admin-area"]')!.click()
    await flushPromises()

    expect(vi.mocked(actionsApi.getAppSsoUsers).mock.calls).toEqual([[3]])
    expect(vi.mocked(actionsApi.getWordpressSsoUsers)).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="sso-title"]')?.textContent).toContain('button.adminArea')
    // Users are labelled `email ?? username ?? id`.
    expect(bodyQuery('[data-testid="sso-user-form"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('"Open Project" of the card overlay opens the preview dialog for a project outside panelalpha.online', async () => {
    const wrapper = await mountView([project(3)], '0')

    document.querySelector<HTMLElement>('[data-testid="instance-wp-admin"]')!.click()
    await flushPromises()

    expect(vi.mocked(actionsApi.getAppSsoUsers)).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="preview-site-modal"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('the blue button of a WordPress card logs in to wp-admin (WP Admin dialog), not the preview', async () => {
    vi.mocked(actionsApi.getWordpressSsoUsers).mockResolvedValue(USERS)
    const wrapper = await mountView([project(4, { type: 'wordpress', privileges: ['wordpress.create_sso_link'] })], '0')

    const button = document.querySelector<HTMLElement>('[data-testid="instance-wp-admin"]')!
    expect(button.textContent).toContain('button.wpAdmin')
    button.click()
    await flushPromises()

    expect(vi.mocked(actionsApi.getWordpressSsoUsers).mock.calls).toEqual([[4]])
    expect(bodyQuery('[data-testid="preview-site-modal"]')).toBeNull()
    expect(bodyQuery('[data-testid="sso-user-form"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('the blue button of a WordPress card without the SSO privilege opens the project', async () => {
    const wrapper = await mountView([project(5, { type: 'wordpress', privileges: [] })], '0')

    const button = document.querySelector<HTMLElement>('[data-testid="instance-wp-admin"]')!
    expect(button.textContent).toContain('button.openProject')
    button.click()
    await flushPromises()

    expect(vi.mocked(actionsApi.getWordpressSsoUsers)).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="preview-site-modal"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('shows the error alert and no dialog when the users do not load', async () => {
    vi.mocked(actionsApi.getAppSsoUsers).mockRejectedValue(Object.assign(new Error('no'), { response: { status: 500, data: { message: 'Broken.' } } }))
    const wrapper = await mountView([project(3)], '1')

    document.querySelector<HTMLElement>('#instance-item-3')!.click()
    await flushPromises()
    bodyQuery('[data-testid="instance-menu-admin-area"]')!.click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Broken.' })
    expect(bodyQuery('[data-testid="sso-modal"]')).toBeNull()
    wrapper.unmount()
  })

  it('Show Logs of a custom project kebab opens its deploy logs', async () => {
    const wrapper = await mountView([project(3, { is_container: true, privileges: ['general.manage_users', 'general.view_logs'] })], '1')

    document.querySelector<HTMLElement>('#instance-item-3')!.click()
    await flushPromises()
    bodyQuery('[data-testid="instance-menu-show-logs"]')!.click()
    await flushPromises()

    expect(bodyQuery('[data-testid="deploy-logs-modal"]')).not.toBeNull()
    wrapper.unmount()
  })
})
