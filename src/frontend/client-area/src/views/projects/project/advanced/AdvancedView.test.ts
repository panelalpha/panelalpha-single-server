import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { PRIVILEGES as P } from '@/entities/privileges/privileges'
import { type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import AdvancedView from './AdvancedView.vue'

// The redirect of a hidden hosting section.

function rawInstance (privileges: string[], overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'custom',
    name: 'Project 7',
    url: 'https://203.0.113.20',
    domain: 'project.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    service_created_at: '2026-01-01T00:00:00.000Z',
    async_status: { installation: 'finished' },
    labels: [],
    privileges,
    plan_settings: {},
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

const Page = { template: '<div />' }

async function mountAt (path: string, options: { singleServer: boolean, privileges: string[], instance?: Partial<RawInstance> }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.hydrateHome({
    app: { integrations: {}, single_server: { active: options.singleServer } },
    user: { name: 'Jane', services: [] },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects/:id/advanced/details', component: Page },
      { path: '/projects/:id/advanced/domains', component: Page, meta: { advancedHostingSection: 'domains' } },
      { path: '/projects/:id/advanced/ftp', component: Page, meta: { advancedHostingSection: 'ftp' } },
      { path: '/projects/:id/advanced/file-manager', component: Page, meta: { advancedHostingSection: 'file-manager' } },
      { path: '/projects/:id/advanced/cron', component: Page, meta: { advancedHostingSection: 'cron' } },
      { path: '/projects/:id/advanced/sftp', component: Page, meta: { advancedHostingSection: 'sftp' } },
      { path: '/projects/:id/advanced/databases', component: Page, meta: { advancedHostingSection: 'databases' } },
      { path: '/projects/:id/advanced/security', component: Page },
      { path: '/projects/:id/advanced/cloudflare', component: Page },
      { path: '/projects/:id/advanced/edge-cache', component: Page },
      { path: '/projects/:id/advanced/cdn', component: Page },
      { path: '/projects/:id/advanced/users', component: Page },
      { path: '/projects/:id/advanced/copy-instance', component: Page },
      { path: '/instances/:id/advanced/users', component: Page },
      { path: '/instances/:id/advanced/details', component: Page },
    ],
  })
  await router.push(path)
  const replace = vi.spyOn(router, 'replace')
  await mountKit(AdvancedView, {
    props: { instance: toInstanceResource(rawInstance(options.privileges, options.instance)) },
    global: { plugins: [pinia, router], stubs: { AdvancedPagesSidebar: true } },
  })
  await flushPromises()
  return { router, replace }
}

describe('AdvancedView hidden hosting section', () => {
  it('replaces a hosting section on multi-server with Details', async () => {
    const { router, replace } = await mountAt('/projects/7/advanced/ftp', { singleServer: false, privileges: [P.MANAGE_FTP] })
    expect(replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
  })

  it('stays on the section on single-server with the privilege', async () => {
    const { router, replace } = await mountAt('/projects/7/advanced/ftp', { singleServer: true, privileges: [P.MANAGE_FTP] })
    expect(replace).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/ftp')
  })

  it('replaces the section on single-server without the privilege', async () => {
    const { replace } = await mountAt('/projects/7/advanced/ftp', { singleServer: true, privileges: [] })
    expect(replace).toHaveBeenCalledWith('/projects/7/advanced/details')
  })

  it('replaces file-manager on single-server without the privilege and keeps it with the privilege', async () => {
    const hidden = await mountAt('/projects/7/advanced/file-manager', { singleServer: true, privileges: [] })
    expect(hidden.replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    const shown = await mountAt('/projects/7/advanced/file-manager', { singleServer: true, privileges: [P.MANAGE_FILE_MANAGER] })
    expect(shown.replace).not.toHaveBeenCalled()
  })

  it('replaces the domains section without the privilege or on multi-server and keeps it on single-server with the privilege', async () => {
    const hidden = await mountAt('/projects/7/advanced/domains', { singleServer: true, privileges: [] })
    expect(hidden.replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    const multi = await mountAt('/projects/7/advanced/domains', { singleServer: false, privileges: [P.MANAGE_DOMAINS] })
    expect(multi.replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    const shown = await mountAt('/projects/7/advanced/domains', { singleServer: true, privileges: [P.MANAGE_DOMAINS] })
    expect(shown.replace).not.toHaveBeenCalled()
  })

  it('replaces the cron section on single-server without the privilege', async () => {
    const { replace } = await mountAt('/projects/7/advanced/cron', { singleServer: true, privileges: [] })
    expect(replace).toHaveBeenCalledWith('/projects/7/advanced/details')
  })

  it('stays on the cron section on single-server with the privilege', async () => {
    const { router, replace } = await mountAt('/projects/7/advanced/cron', { singleServer: true, privileges: [P.MANAGE_CRON] })
    expect(replace).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/cron')
  })

  it('replaces the cron section on multi-server even with the privilege (ui-cron entry from a link)', async () => {
    const { router, replace } = await mountAt('/projects/7/advanced/cron', { singleServer: false, privileges: [P.MANAGE_CRON] })
    expect(replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
  })

  it('replaces sftp on single-server without the privilege and stays with it', async () => {
    const without = await mountAt('/projects/7/advanced/sftp', { singleServer: true, privileges: [] })
    expect(without.replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    const withPriv = await mountAt('/projects/7/advanced/sftp', { singleServer: true, privileges: [P.MANAGE_SFTP] })
    expect(withPriv.replace).not.toHaveBeenCalled()
    expect(withPriv.router.currentRoute.value.path).toBe('/projects/7/advanced/sftp')
  })

  it('replaces databases on single-server without MySQL and phpMyAdmin SSO privileges and stays with either one', async () => {
    const without = await mountAt('/projects/7/advanced/databases', { singleServer: true, privileges: [] })
    expect(without.replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    for (const privilege of [P.MANAGE_MYSQL, P.PHPMYADMIN_SSO]) {
      const shown = await mountAt('/projects/7/advanced/databases', { singleServer: true, privileges: [privilege] })
      expect(shown.replace).not.toHaveBeenCalled()
      expect(shown.router.currentRoute.value.path).toBe('/projects/7/advanced/databases')
    }
  })

  it('replaces databases on multi-server even with the MySQL privilege', async () => {
    const { replace } = await mountAt('/projects/7/advanced/databases', { singleServer: false, privileges: [P.MANAGE_MYSQL] })
    expect(replace).toHaveBeenCalledWith('/projects/7/advanced/details')
  })

  it.each([
    ['/projects/7/advanced/users', '/projects/7/advanced/details'],
    ['/projects/7/advanced/copy-instance', '/projects/7/advanced/details'],
    ['/instances/7/advanced/users', '/instances/7/advanced/details'],
  ])('replaces the hidden page %s with Details', async (path, target) => {
    const { router } = await mountAt(path, { singleServer: true, privileges: [P.MANAGE_GENERAL_USERS, P.COPY_INSTANCE] })
    expect(router.currentRoute.value.fullPath).toBe(target)
  })

  it('does not redirect a route without the section meta', async () => {
    const { replace } = await mountAt('/projects/7/advanced/security', { singleServer: false, privileges: [] })
    expect(replace).not.toHaveBeenCalled()
  })
})

// Cloudflare and CDN follow the instance's privileges and flags, Edge Cache needs a WP Cloud server. In Free none of
// them is offered, so a direct URL used to mount the page and its GET answered 404 with an error toast.
describe('AdvancedView instance-gated pages', () => {
  it('replaces Cloudflare with Details when the sidebar does not offer it', async () => {
    const { router, replace } = await mountAt('/projects/7/advanced/cloudflare', { singleServer: true, privileges: [] })
    expect(replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
  })

  it('keeps Cloudflare when the privilege, the Cloudflare DNS service and a zone offer it', async () => {
    const { router, replace } = await mountAt('/projects/7/advanced/cloudflare', {
      singleServer: true,
      privileges: [P.MANAGE_CLOUDFLARE],
      instance: { service_has_dns_cloudflare: true, domain_has_dns_zone: true },
    })
    expect(replace).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/cloudflare')
  })

  it('replaces Edge Cache without a WP Cloud server and keeps it with the privilege on one', async () => {
    const hidden = await mountAt('/projects/7/advanced/edge-cache', { singleServer: true, privileges: [P.MANAGE_EDGE_CACHE] })
    expect(hidden.replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    const shown = await mountAt('/projects/7/advanced/edge-cache', {
      singleServer: true,
      privileges: [P.MANAGE_EDGE_CACHE],
      instance: { hosting_server_type: 'wp-cloud' },
    })
    expect(shown.replace).not.toHaveBeenCalled()
    expect(shown.router.currentRoute.value.path).toBe('/projects/7/advanced/edge-cache')
  })

  it('replaces CDN without the privilege and keeps it with the privilege and cdn_enabled', async () => {
    const hidden = await mountAt('/projects/7/advanced/cdn', { singleServer: true, privileges: [], instance: { cdn_enabled: true } })
    expect(hidden.replace).toHaveBeenCalledWith('/projects/7/advanced/details')
    const shown = await mountAt('/projects/7/advanced/cdn', {
      singleServer: true,
      privileges: [P.MANAGE_CDN],
      instance: { cdn_enabled: true },
    })
    expect(shown.replace).not.toHaveBeenCalled()
    expect(shown.router.currentRoute.value.path).toBe('/projects/7/advanced/cdn')
  })
})

// The hidden page's child is not mounted while the redirect to Details is pending, so it calls no API (the GET of `users` on a
// WordPress project answered 422 and showed an error toast). Legacy mounts it for a moment and ignores the error.
describe('AdvancedView entry from a link to a hidden section', () => {
  function probe (name: string) {
    return defineComponent({
      name: `${name}Probe`,
      mounted () {
        events.push(`mount:${name}Probe`)
      },
      render: () => h('div'),
    })
  }

  let events: string[] = []

  async function mountProbed (path: string, options: { singleServer: boolean, privileges: string[], instance?: Partial<RawInstance>, attrs?: Record<string, unknown> }) {
    events = []
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.hydrateHome({
      app: { integrations: {}, single_server: { active: options.singleServer } },
      user: { name: 'Jane', services: [] },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/projects/:id/advanced/details', component: probe('Details') },
        { path: '/projects/:id/advanced/ftp', component: probe('Ftp'), meta: { advancedHostingSection: 'ftp' } },
        { path: '/projects/:id/advanced/users', component: probe('Users') },
        { path: '/projects/:id/advanced/cloudflare', component: probe('Cloudflare') },
        { path: '/projects/:id/advanced/security', component: probe('Security') },
        { path: '/projects/:id/advanced/wordpress-config', component: probe('WordpressConfig') },
        { path: '/projects/:id/advanced/themes', component: probe('Themes') },
        { path: '/projects/:id/advanced/env-file', component: probe('EnvFile') },
      ],
    })
    await router.push(path)
    const originalReplace = router.replace.bind(router)
    vi.spyOn(router, 'replace').mockImplementation(async to => {
      events.push('replace')
      return originalReplace(to)
    })
    const wrapper = await mountKit(AdvancedView, {
      props: { instance: toInstanceResource(rawInstance(options.privileges, options.instance)) },
      attrs: options.attrs,
      global: { plugins: [pinia, router], stubs: { AdvancedPagesSidebar: true } },
    })
    await flushPromises()
    return { router, wrapper }
  }

  it('does not mount the hidden section child, only Details after the redirect', async () => {
    const { router } = await mountProbed('/projects/7/advanced/ftp', { singleServer: false, privileges: [P.MANAGE_FTP] })
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
    expect(events).toContain('replace')
    expect(events).not.toContain('mount:FtpProbe')
    expect(events).toContain('mount:DetailsProbe')
  })

  it('does not mount the hidden Users page (no GET, no error toast)', async () => {
    const { router } = await mountProbed('/projects/7/advanced/users', { singleServer: true, privileges: [P.MANAGE_GENERAL_USERS] })
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
    expect(events).not.toContain('mount:UsersProbe')
    expect(events).toContain('mount:DetailsProbe')
  })

  it('does not mount the Cloudflare page the sidebar does not offer (no GET, no error toast)', async () => {
    const { router } = await mountProbed('/projects/7/advanced/cloudflare', { singleServer: true, privileges: [] })
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
    expect(events).not.toContain('mount:CloudflareProbe')
    expect(events).toContain('mount:DetailsProbe')
  })

  it('does not mount a WordPress-only page on a project that is not WordPress (a container project)', async () => {
    for (const [path, page] of [['/projects/7/advanced/wordpress-config', 'WordpressConfig'], ['/projects/7/advanced/themes', 'Themes']] as const) {
      const { router } = await mountProbed(path, { singleServer: true, privileges: [P.MANAGE_GIT, P.VIEW_LOGS] })
      expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
      expect(events).not.toContain(`mount:${page}Probe`)
      expect(events).toContain('mount:DetailsProbe')
    }
  })

  it('does not mount env-file on a WordPress project even with the privilege', async () => {
    const { router } = await mountProbed('/projects/7/advanced/env-file', {
      singleServer: true,
      privileges: [P.MANAGE_ENV_FILE],
      instance: { type: 'wordpress' },
    })
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/details')
    expect(events).not.toContain('mount:EnvFileProbe')
    expect(events).toContain('mount:DetailsProbe')
  })

  it('mounts the WordPress pages a WordPress project offers', async () => {
    const { router } = await mountProbed('/projects/7/advanced/wordpress-config', {
      singleServer: true,
      privileges: [P.MANAGE_CONFIG],
      instance: { type: 'wordpress' },
    })
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/wordpress-config')
    expect(events).toContain('mount:WordpressConfigProbe')
    expect(events).not.toContain('replace')
  })

  it('mounts a visible page at once, without a redirect', async () => {
    const { router } = await mountProbed('/projects/7/advanced/security', { singleServer: false, privileges: [] })
    expect(router.currentRoute.value.path).toBe('/projects/7/advanced/security')
    expect(events).not.toContain('replace')
    expect(events).toContain('mount:SecurityProbe')
  })

  it('keeps fallthrough attributes such as fetching off the root element', async () => {
    const { wrapper } = await mountProbed('/projects/7/advanced/details', { singleServer: false, privileges: [], attrs: { 'fetching': true, 'data-probe': 'x' } })
    const root = wrapper.element as HTMLElement
    expect(wrapper.vm.$attrs.fetching).toBe(true)
    expect(root.hasAttribute('fetching')).toBe(false)
    expect(Object.hasOwn(root.dataset, 'probe')).toBe(false)
  })
})
