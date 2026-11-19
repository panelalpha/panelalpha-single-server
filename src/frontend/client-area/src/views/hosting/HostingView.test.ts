import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as hostingApi from './hosting.api'
import { makeService } from './hosting.fixtures'
import HostingPagesSidebar from './HostingPagesSidebar.vue'
import HostingView from './HostingView.vue'

vi.mock('./hosting.api', () => ({ listServices: vi.fn(), getEmailDomains: vi.fn() }))

const Summary = defineComponent({ props: { service: { type: Object, default: null } }, render: () => h('div', { 'data-testid': 'child-page' }) })
const Root = defineComponent({ render: () => h(RouterView) })

// The service-server children record their mount, so a test can prove that a page the service does not offer is never mounted (its GET
// would answer 404 with an error toast).
let mountedChildren: string[] = []
function probe (name: string) {
  return defineComponent({
    props: { service: { type: Object, default: null } },
    mounted () {
      mountedChildren.push(name)
    },
    render: () => h('div', { 'data-testid': 'child-page' }),
  })
}
const EmailAddressesProbe = probe('email-addresses')
const DnsProbe = probe('dns')
const DomainsProbe = probe('domains')
const CronProbe = probe('cron')
const FtpProbe = probe('ftp')
const SftpProbe = probe('sftp')
const DatabasesProbe = probe('databases')
const FileManagerProbe = probe('file-manager')
const EmailForwardersProbe = probe('email-forwarders')

async function mountFrame (path: string, hasHostingAccess: boolean, singleServer = false) {
  mountedChildren = []
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: singleServer ? { single_server: { active: true } } : {}, user: { has_hosting_access: hasHostingAccess } } as never)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/instances', name: 'instances', component: { render: () => h('div', 'instances') } },
      { path: '/hosting/', component: HostingView, redirect: '/hosting/summary', children: [
        { path: '/hosting/summary', component: Summary },
        { path: '/hosting/usage', component: Summary },
        { path: '/hosting/ftp', component: FtpProbe },
        { path: '/hosting/domains', component: DomainsProbe },
        { path: '/hosting/cron', component: CronProbe },
        { path: '/hosting/sftp', component: SftpProbe },
        { path: '/hosting/databases', component: DatabasesProbe },
        { path: '/hosting/file-manager', component: FileManagerProbe },
        { path: '/hosting/email-addresses', component: EmailAddressesProbe },
        { path: '/hosting/email-forwarders', component: EmailForwardersProbe },
        { path: '/hosting/dns', component: DnsProbe },
      ] },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = await mountKit(Root, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('HostingView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sessionStorage.clear()
  })

  it('redirects to Instances without hosting access and never loads services', async () => {
    const { wrapper, router } = await mountFrame('/hosting/summary', false)

    expect(router.currentRoute.value.name).toBe('instances')
    expect(hostingApi.listServices).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('renders the title, the sidebar and the routed page for the selected service', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 })])
    const { wrapper } = await mountFrame('/hosting/summary', true)

    expect(wrapper.get('[data-testid="hosting-title"]').text()).toBe('heading.navbar.tab.myHosting')
    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the suspended view when the only service is suspended', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1, status: 'suspended' })])
    const { wrapper } = await mountFrame('/hosting/summary', true)

    expect(wrapper.find('[data-testid="hosting-suspended-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  const withDns = () => makeService({
    id: 1,
    privileges: ['hosting.manage_dns'],
    dns_server_enabled: true,
    plan_settings: { dns_management_enabled: true },
  })
  const tabIds = (wrapper: Awaited<ReturnType<typeof mountFrame>>['wrapper']) => wrapper.findAll('[data-testid^="hosting-tab-"]').map(tab => tab.attributes('data-testid'))

  it('single-server without a service: the server Usage with no sidebar and a full width body', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([])
    const { wrapper, router } = await mountFrame('/hosting/usage', true, true)

    expect(router.currentRoute.value.path).toBe('/hosting/usage')
    expect(wrapper.find('[data-testid="hosting-server-usage-only"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(false)
    expect(wrapper.find('.page-frame__body .v-col--cols-lg-12').exists()).toBe(true)
    wrapper.unmount()
  })

  it('single-server: one service without DNS or e-mail has no sidebar', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 })])
    const { wrapper } = await mountFrame('/hosting/usage', true, true)

    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(false)
    expect(wrapper.find('.page-frame__body .v-col--cols-lg-12').exists()).toBe(true)
    wrapper.unmount()
  })

  it('single-server: the sidebar lists Usage first when the service has DNS', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([withDns()])
    const { wrapper } = await mountFrame('/hosting/usage', true, true)

    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(true)
    // jsdom is narrower than 1200px, so the sidebar shows its tabs.
    expect(tabIds(wrapper)).toEqual(['hosting-tab-usage', 'hosting-tab-dns'])
    expect(wrapper.find('.page-frame__body .v-col--cols-lg-10').exists()).toBe(true)
    wrapper.unmount()
  })

  it('single-server: the sidebar lists Usage first when the service has e-mail only (review F6)', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1, privileges: ['hosting.manage_email'], email_server_enabled: true })])
    const { wrapper } = await mountFrame('/hosting/usage', true, true)

    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(true)
    expect(tabIds(wrapper)).toEqual(['hosting-tab-usage', 'hosting-tab-email-addresses', 'hosting-tab-email-forwarders'])
    expect(wrapper.find('.page-frame__body .v-col--cols-lg-10').exists()).toBe(true)
    wrapper.unmount()
  })

  it('single-server: two services without DNS or e-mail keep the sidebar with the plan selector and Usage', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 }), makeService({ id: 2, domain: 'second.example.com' })])
    const { wrapper } = await mountFrame('/hosting/usage', true, true)

    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hosting-plan-selector"]').exists()).toBe(true)
    expect(tabIds(wrapper)).toEqual(['hosting-tab-usage'])
    wrapper.unmount()
  })

  it('single-server: Usage renders with no sidebar while GET /services runs, and stays mounted when the service with DNS arrives', async () => {
    let release: (services: ReturnType<typeof makeService>[]) => void = () => {}
    vi.mocked(hostingApi.listServices).mockReturnValue(new Promise(resolve => {
      release = resolve
    }))
    const { wrapper } = await mountFrame('/hosting/usage', true, true)

    const page = wrapper.get('[data-testid="child-page"]')
    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(false)

    release([withDns()])
    await flushPromises()
    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="child-page"]').element).toBe(page.element)
    wrapper.unmount()
  })

  describe('admin button in the frame head', () => {
    async function mountAdmin (path: string) {
      vi.mocked(hostingApi.listServices).mockResolvedValue([withDns()])
      const pinia = createPinia()
      setActivePinia(pinia)
      useSessionStore().hydrateHome({
        app: { single_server: { active: true } },
        user: { has_hosting_access: true, is_ss_default: true },
        admin: { app_url: 'https://admin.example.com' },
      } as never)
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/hosting/', component: HostingView, children: [
          { path: '/hosting/usage', component: Summary },
          { path: '/hosting/dns', component: DnsProbe },
        ] }],
      })
      await router.push(path)
      await router.isReady()
      const wrapper = await mountKit(Root, { global: { plugins: [pinia, router] } })
      await flushPromises()
      return { wrapper, router }
    }

    it('shows on Usage in the head, linking to <app_url>/server in a new tab, and not on DNS', async () => {
      const { wrapper, router } = await mountAdmin('/hosting/usage')

      const button = wrapper.get('.page-frame__head [data-testid="usage-admin-button"]')
      expect(button.attributes('href')).toBe('https://admin.example.com/server')
      expect(button.attributes('target')).toBe('_blank')
      expect(button.attributes('rel')).toBe('noopener noreferrer')
      expect(button.text()).toBe('button.fullServerManagement')

      await router.push('/hosting/dns')
      await flushPromises()
      expect(wrapper.find('[data-testid="usage-admin-button"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('is hidden for a user that is not the single-server admin, and without the admin app_url', async () => {
      vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 })])
      for (const [user, admin] of [[{ is_ss_default: false }, { app_url: 'https://admin.example.com' }], [{ is_ss_default: true }, {}]] as const) {
        const { wrapper } = await mountFrame('/hosting/usage', true, true)
        useSessionStore().hydrateHome({ app: { single_server: { active: true } }, user: { has_hosting_access: true, ...user }, admin } as never)
        await flushPromises()
        expect(wrapper.find('[data-testid="usage-admin-button"]').exists()).toBe(false)
        wrapper.unmount()
      }
    })

    it('is hidden on the Community panel and when single-server is not active, even for the admin with an app_url (review F6)', async () => {
      vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 })])
      for (const app of [{ single_server: { active: true }, community_panel: true }, { single_server: { active: false } }]) {
        const { wrapper } = await mountFrame('/hosting/usage', true, true)
        useSessionStore().hydrateHome({ app, user: { has_hosting_access: true, is_ss_default: true }, admin: { app_url: 'https://admin.example.com' } } as never)
        await flushPromises()
        expect(wrapper.find('[data-testid="usage-admin-button"]').exists()).toBe(false)
        wrapper.unmount()
      }
    })
  })

  it('single-server: another page waits for GET /services, as legacy', async () => {
    vi.mocked(hostingApi.listServices).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountFrame('/hosting/ftp', true, true)

    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="hosting-sidebar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('single-server without a service: another page goes to Usage', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([])
    const { wrapper, router } = await mountFrame('/hosting/dns', true, true)

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/hosting/usage'))
    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('single-server: no page the menu does not offer mounts, whatever the service would allow', async () => {
    // The service grants every section, as the paid editions' services do: the single-server menu still offers Usage only.
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({
      id: 1,
      privileges: ['hosting.manage_domains', 'hosting.manage_ftp', 'hosting.manage_sftp', 'hosting.manage_mysql', 'hosting.manage_cron', 'hosting.manage_file_manager', 'hosting.manage_email', 'hosting.manage_dns'],
    })])
    for (const page of ['domains', 'cron', 'ftp', 'sftp', 'databases', 'file-manager', 'email-addresses', 'email-forwarders', 'dns']) {
      const { wrapper, router } = await mountFrame(`/hosting/${page}`, true, true)

      await vi.waitFor(() => expect([page, router.currentRoute.value.path]).toEqual([page, '/hosting/usage']))
      expect([page, mountedChildren]).toEqual([page, []])
      wrapper.unmount()
    }
    expect(hostingApi.getEmailDomains).not.toHaveBeenCalled()
  })

  it('single-server: a direct visit to the e-mail pages without an e-mail server goes to Usage and never mounts them', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1, privileges: ['hosting.manage_email'] })])
    const { wrapper, router } = await mountFrame('/hosting/email-addresses', true, true)

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/hosting/usage'))
    expect(mountedChildren).not.toContain('email-addresses')
    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(true)
    // The store only asks for the address records when the service sends an e-mail server.
    expect(hostingApi.getEmailDomains).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('single-server: the e-mail page stays when the service offers an e-mail server', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({
      id: 1,
      privileges: ['hosting.manage_email'],
      email_server_enabled: true,
    })])
    const { wrapper, router } = await mountFrame('/hosting/email-addresses', true, true)

    expect(router.currentRoute.value.path).toBe('/hosting/email-addresses')
    expect(mountedChildren).toContain('email-addresses')
    wrapper.unmount()
  })

  it('multi-server: a DNS page without a DNS server goes to Summary and never mounts', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1, privileges: ['hosting.manage_dns'] })])
    const { router } = await mountFrame('/hosting/dns', true, false)

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/hosting/summary'))
    expect(mountedChildren).not.toContain('dns')
  })

  it('single-server: a failed GET /services keeps the frame empty (title and alert only)', async () => {
    vi.mocked(hostingApi.listServices).mockRejectedValue(new Error('offline'))
    const { wrapper } = await mountFrame('/hosting/usage', true, true)

    expect(wrapper.find('[data-testid="hosting-server-usage-only"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('multi-server without a service still renders nothing below the title', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([])
    const { wrapper } = await mountFrame('/hosting/summary', true)

    expect(wrapper.find('[data-testid="hosting-server-usage-only"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('selects the service of ?id= and removes the id from the query', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 }), makeService({ id: 2 })])
    const { wrapper, router } = await mountFrame('/hosting/summary?id=2', true)

    await vi.waitFor(() => expect(router.currentRoute.value.query.id).toBeUndefined())
    expect(wrapper.get('[data-testid="hosting-sidebar"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('prefers the plan remembered in sessionStorage over ?id=', async () => {
    sessionStorage.setItem('selectedPlanId', '2')
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 }), makeService({ id: 2 })])
    const { wrapper, router } = await mountFrame('/hosting/summary?id=1', true)

    expect(router.currentRoute.value.query.id).toBe('1')
    wrapper.unmount()
  })

  describe('plan change', () => {
    // The DNS page needs a service that offers DNS, otherwise the entry rule sends the first load to Usage before the plan can change.
    const withFtp = makeService({
      id: 1,
      privileges: ['hosting.manage_ftp', 'hosting.manage_dns'],
      dns_server_enabled: true,
      plan_settings: { dns_management_enabled: true },
    })
    const withoutFtp = makeService({ id: 2, privileges: [] })

    async function changePlan (path: string, singleServer: boolean, target: ReturnType<typeof makeService>) {
      vi.mocked(hostingApi.listServices).mockResolvedValue([withFtp, withoutFtp])
      const { wrapper, router } = await mountFrame(path, true, singleServer)
      const push = vi.spyOn(router, 'push')
      wrapper.findComponent(HostingPagesSidebar).vm.$emit('update:active-service', target)
      await flushPromises()
      return { wrapper, router, push }
    }

    it('single-server: a section the menu does not offer is gone before the plan change, which never goes to Summary', async () => {
      const { wrapper, router, push } = await changePlan('/hosting/ftp', true, withFtp)

      expect(push).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/hosting/usage')
      wrapper.unmount()
    })

    it('single-server: stays on Summary', async () => {
      const { wrapper, router, push } = await changePlan('/hosting/summary', true, withoutFtp)

      expect(push).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/hosting/summary')
      wrapper.unmount()
    })

    it('single-server: stays on DNS when the new service has DNS', async () => {
      const withDns = makeService({
        id: 3,
        dns_server_enabled: true,
        privileges: ['hosting.manage_dns'],
        plan_settings: { dns_management_enabled: true },
      })
      const { wrapper, router, push } = await changePlan('/hosting/dns', true, withDns)

      expect(push).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/hosting/dns')
      wrapper.unmount()
    })

    it('single-server: DNS without DNS for the new service goes to Usage, never Summary', async () => {
      const { wrapper, router, push } = await changePlan('/hosting/dns', true, withoutFtp)

      expect(push).toHaveBeenCalledTimes(1)
      expect(push).toHaveBeenCalledWith('/hosting/usage')
      expect(router.currentRoute.value.path).toBe('/hosting/usage')
      wrapper.unmount()
    })

    it('multi-server: a service without access sends the section to Summary', async () => {
      const { wrapper, router, push } = await changePlan('/hosting/ftp', false, withoutFtp)

      expect(push).toHaveBeenCalledWith('/hosting/summary')
      expect(router.currentRoute.value.path).toBe('/hosting/summary')
      wrapper.unmount()
    })
  })
})
