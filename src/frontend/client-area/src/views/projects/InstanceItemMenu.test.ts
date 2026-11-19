import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import InstanceItemMenu from './InstanceItemMenu.vue'

const ALL = [
  'general.create_staging',
  'general.push_to_live',
  'general.copy_instance',
  'general.delete_instance',
  'general.manage_users',
  'general.manage_shared_access',
  'general.view_logs',
  'wordpress.create_sso_link',
  'wordpress.update',
  'wordpress.clear_cache',
]

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
    async_status: { installation: 'finished' },
    labels: [],
    privileges: ALL,
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    plan_settings: { copy_instance_allowed: true },
    ...overrides,
  }
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const bodyQueryAll = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)]
const itemIds = () => bodyQueryAll('[data-testid^="instance-menu-"]').map(node => node.dataset.testid)

interface MountOptions {
  overrides?: Partial<RawInstance>
  sub?: boolean
  props?: Record<string, unknown>
  singleServer?: boolean
}

async function mountMenu ({ overrides = {}, sub = false, props = {}, singleServer = false }: MountOptions = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { integrations: {}, single_server: { active: singleServer } }, user: {} })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })

  const item = toInstanceResource(raw(overrides))
  const staging = toInstanceResource(raw({ id: 8, name: 'Staging', staging: true, ...overrides }))
  const instance = sub ? { ...item, subinstance: staging } as typeof item : item
  const subinstance = sub ? staging : item

  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(InstanceItemMenu, {
    props: { instance, subinstance, main: !sub, ...props },
    global: { plugins: [pinia, router] },
    attachTo: host,
  })
  return { wrapper, item, staging }
}

async function openMenu (wrapper: Awaited<ReturnType<typeof mountMenu>>['wrapper']) {
  await wrapper.get('button').trigger('click')
  await flushPromises()
}

describe('InstanceItemMenu', () => {
  beforeEach(() => {
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('renders the kebab activator with the legacy id and opens the menu', async () => {
    const { wrapper } = await mountMenu()
    expect(wrapper.get('button').attributes('id')).toBe('instance-item-7')
    expect(wrapper.get('button').attributes('aria-label')).toBe('button.actions')
    expect(bodyQuery('[data-testid="instance-item-menu"]')).toBeNull()

    await openMenu(wrapper)

    expect(bodyQuery('[data-testid="instance-item-menu"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('lists every item of a live instance for a full owner, in legacy order', async () => {
    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(itemIds()).toEqual([
      'instance-menu-manage',
      'instance-menu-wp-admin',
      'instance-menu-staging',
      'instance-menu-copy',
      'instance-menu-update',
      'instance-menu-clear-cache',
      'instance-menu-share',
      'instance-menu-delete',
    ])
    expect(bodyQueryAll('.v-divider')).toHaveLength(2)
    wrapper.unmount()
  })

  it('gates the items by privilege: a limited instance keeps Manage only', async () => {
    const { wrapper } = await mountMenu({ overrides: { privileges: [] } })
    await openMenu(wrapper)

    expect(itemIds()).toEqual(['instance-menu-manage'])
    wrapper.unmount()
  })

  it('hides Copy when the plan does not allow it, whatever the privilege', async () => {
    const { wrapper } = await mountMenu({ overrides: { plan_settings: { copy_instance_allowed: false } } })
    await openMenu(wrapper)

    expect(itemIds()).not.toContain('instance-menu-copy')
    expect(itemIds()).toContain('instance-menu-staging')
    wrapper.unmount()
  })

  it('hides Copy on single server even when the plan allows it and the privilege is there', async () => {
    const { wrapper } = await mountMenu({ singleServer: true })
    await openMenu(wrapper)

    expect(itemIds()).not.toContain('instance-menu-copy')
    expect(itemIds()).toContain('instance-menu-staging')
    expect(itemIds()).toContain('instance-menu-share')
    wrapper.unmount()
  })

  it.each([
    ['general.create_staging', 'instance-menu-staging'],
    ['general.copy_instance', 'instance-menu-copy'],
    ['wordpress.create_sso_link', 'instance-menu-wp-admin'],
    ['wordpress.update', 'instance-menu-update'],
    ['wordpress.clear_cache', 'instance-menu-clear-cache'],
    ['general.delete_instance', 'instance-menu-delete'],
    ['general.manage_shared_access', 'instance-menu-share'],
  ])('shows %s -> %s only with its privilege', async (privilege, testId) => {
    const { wrapper } = await mountMenu({ overrides: { privileges: [privilege] } })
    await openMenu(wrapper)

    expect(itemIds()).toEqual(['instance-menu-manage', testId])
    wrapper.unmount()
  })

  it('shows Push to live instead of Staging on a staging sub-row and acts on the staging id', async () => {
    const { wrapper, staging } = await mountMenu({ sub: true })
    await openMenu(wrapper)

    expect(wrapper.get('button').attributes('id')).toBe('instance-item-8')
    expect(itemIds()).toContain('instance-menu-push-to-live')
    expect(itemIds()).not.toContain('instance-menu-staging')

    bodyQuery('[data-testid="instance-menu-push-to-live"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('push-to-live')![0]![0]).toMatchObject({ id: staging.id })
    wrapper.unmount()
  })

  it('emits the action instance of the row: the sub-row instance for clear cache, copy, staging, share and delete', async () => {
    const { wrapper } = await mountMenu({ sub: true })
    await openMenu(wrapper)

    for (const [testId, event] of [
      ['instance-menu-copy', 'copy'],
      ['instance-menu-clear-cache', 'clear-cache'],
      ['instance-menu-share', 'share'],
      ['instance-menu-delete', 'delete'],
    ] as const) {
      await wrapper.setProps({})
      if (!bodyQuery('[data-testid="instance-item-menu"]')) {
        await openMenu(wrapper)
      }
      bodyQuery(`[data-testid="${testId}"]`)!.click()
      await flushPromises()
      expect(wrapper.emitted(event)![0]![0]).toMatchObject({ id: 8 })
    }
    wrapper.unmount()
  })

  it('shows Try again and Cancel installation only on a failed install', async () => {
    const { wrapper, item } = await mountMenu({ overrides: { async_status: { installation: 'failed' } } })
    await openMenu(wrapper)

    expect(itemIds()).toEqual(['instance-menu-retry', 'instance-menu-cancel-install'])

    bodyQuery('[data-testid="instance-menu-retry"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('retry-install')![0]![0]).toMatchObject({ id: item.id })

    await openMenu(wrapper)
    bodyQuery('[data-testid="instance-menu-cancel-install"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('cancel-install')![0]![0]).toMatchObject({ id: item.id })
    wrapper.unmount()
  })

  it('has no Log In and no Show Logs outside app-lite', async () => {
    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(itemIds()).not.toContain('instance-menu-log-in')
    expect(itemIds()).not.toContain('instance-menu-show-logs')
    wrapper.unmount()
  })

  it('app-lite: Admin Area (general.manage_users, supports_admin_sso) and Show Logs for a custom project', async () => {
    const { wrapper } = await mountMenu({ overrides: { type: 'custom', is_container: true, supports_admin_sso: true }, singleServer: true })
    await openMenu(wrapper)

    expect(itemIds().slice(0, 3)).toEqual([
      'instance-menu-manage',
      'instance-menu-admin-area',
      'instance-menu-show-logs',
    ])
    expect(bodyQuery('[data-testid="instance-menu-admin-area"]')!.textContent).toContain('button.adminArea')
    bodyQuery('[data-testid="instance-menu-admin-area"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('log-in')).toHaveLength(1)
    expect(wrapper.emitted('wp-admin')).toBeUndefined()
    wrapper.unmount()
  })

  it('app-lite: the SSO item of a WordPress site says WP Admin and opens the WP login (wordpress.create_sso_link)', async () => {
    const { wrapper } = await mountMenu({ overrides: { supports_admin_sso: true }, singleServer: true })
    await openMenu(wrapper)

    expect(itemIds()[1]).toBe('instance-menu-admin-area')
    // "WP Admin" for WordPress, app-lite says "Admin Area".
    expect(bodyQuery('[data-testid="instance-menu-admin-area"]')!.textContent).toContain('button.wpAdmin')
    expect(bodyQuery('[data-testid="instance-menu-admin-area"]')!.textContent).not.toContain('button.adminArea')
    bodyQuery('[data-testid="instance-menu-admin-area"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('wp-admin')).toHaveLength(1)
    expect(wrapper.emitted('log-in')).toBeUndefined()
    wrapper.unmount()
  })

  it('app-lite: no Admin Area without supports_admin_sso or without the privilege', async () => {
    const withoutFlag = await mountMenu({ overrides: { type: 'custom' }, singleServer: true })
    await openMenu(withoutFlag.wrapper)
    expect(itemIds()).not.toContain('instance-menu-admin-area')
    expect(itemIds()).not.toContain('instance-menu-wp-admin')
    expect(itemIds()).not.toContain('instance-menu-log-in')
    withoutFlag.wrapper.unmount()

    const withoutPrivilege = await mountMenu({ overrides: { supports_admin_sso: true, privileges: ALL.filter(name => name !== 'wordpress.create_sso_link') }, singleServer: true })
    await openMenu(withoutPrivilege.wrapper)
    expect(itemIds()).not.toContain('instance-menu-admin-area')
    withoutPrivilege.wrapper.unmount()
  })

  it('app-lite: Show Logs leads the failed menu of a custom project', async () => {
    const { wrapper } = await mountMenu({ overrides: { type: 'custom', is_container: true, async_status: { installation: 'failed' } }, singleServer: true })
    await openMenu(wrapper)

    expect(itemIds()).toEqual(['instance-menu-show-logs', 'instance-menu-retry', 'instance-menu-cancel-install'])
    wrapper.unmount()
  })

  // The API serves deploy logs only for a container project with `general.view_logs` (422 / 403 otherwise).
  it.each([
    ['a classic custom project (no container)', { type: 'custom', is_container: false }],
    ['a custom project in install before the WordPress probe', { type: 'custom', is_container: false, async_status: { installation: 'in_progress' } }],
    ['a custom project with an install that failed before the container', { type: 'custom', is_container: false, async_status: { installation: 'failed' } }],
    ['a container project without general.view_logs', { type: 'custom', is_container: true, privileges: ALL.filter(name => name !== 'general.view_logs') }],
    ['a WordPress site', { type: 'wordpress', is_container: false }],
  ] as const)('app-lite: no Show Logs for %s', async (_label, overrides) => {
    const { wrapper } = await mountMenu({ overrides: overrides as Partial<RawInstance>, singleServer: true })
    await openMenu(wrapper)

    expect(itemIds()).not.toContain('instance-menu-show-logs')
    wrapper.unmount()
  })

  it('app-lite: Show Logs of a container project emits the instance, also while it deploys', async () => {
    const { wrapper } = await mountMenu({ overrides: { type: 'custom', is_container: true, async_status: { installation: 'in_progress' } }, singleServer: true })
    await openMenu(wrapper)

    bodyQuery('[data-testid="instance-menu-show-logs"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('show-deploy-logs')![0]![0]).toMatchObject({ id: 7 })
    wrapper.unmount()
  })

  it('links Manage to the instance page', async () => {
    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(bodyQuery('[data-testid="instance-menu-manage"]')!.getAttribute('href')).toBe('/instances/7/general')
    wrapper.unmount()
  })

  describe('closing (E1)', () => {
    it('closes at once after an action that opens a dialog', async () => {
      const { wrapper } = await mountMenu()
      await openMenu(wrapper)

      bodyQuery('[data-testid="instance-menu-clear-cache"]')!.click()
      await flushPromises()

      expect(wrapper.emitted('clear-cache')).toHaveLength(1)
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    it('stays open while the Update loader shows and closes when it stops', async () => {
      // The host raises the loader in its handler, in the same tick as the emit (the view does `checkingUpdates = id`).
      const { wrapper } = await mountMenu({ props: { onUpdate: () => {
        void wrapper.setProps({ checkingUpdates: true })
      } } })
      await openMenu(wrapper)

      bodyQuery('[data-testid="instance-menu-update"]')!.click()
      await flushPromises()

      expect(wrapper.emitted('update')).toHaveLength(1)
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
      expect(bodyQuery('[data-testid="instance-menu-update"] .loader')).not.toBeNull()

      await wrapper.setProps({ checkingUpdates: false })
      await flushPromises()
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    it('stays open while the WP Admin loader shows and closes when it stops', async () => {
      const { wrapper } = await mountMenu({ props: { onWpAdmin: () => {
        void wrapper.setProps({ checkingWpLogin: true })
      } } })
      await openMenu(wrapper)

      bodyQuery('[data-testid="instance-menu-wp-admin"]')!.click()
      await flushPromises()

      expect(wrapper.emitted('wp-admin')).toHaveLength(1)
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
      expect(bodyQuery('[data-testid="instance-menu-wp-admin"] .loader')).not.toBeNull()

      await wrapper.setProps({ checkingWpLogin: false })
      await flushPromises()
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    it('closes at once when the host raises no loader', async () => {
      const { wrapper } = await mountMenu()
      await openMenu(wrapper)

      bodyQuery('[data-testid="instance-menu-update"]')!.click()
      await flushPromises()

      expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    it('close() is exposed', async () => {
      const { wrapper } = await mountMenu()
      await openMenu(wrapper)
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')

      ;(wrapper.vm as unknown as { close: () => void }).close()
      await flushPromises()

      expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })
  })

  it('E2: Delete keeps its icon while the updates load', async () => {
    const { wrapper } = await mountMenu({ props: { checkingUpdates: true } })
    await openMenu(wrapper)

    expect(bodyQuery('[data-testid="instance-menu-delete"] .loader')).toBeNull()
    expect(bodyQuery('[data-testid="instance-menu-delete"] .v-icon')).not.toBeNull()
    expect(bodyQuery('[data-testid="instance-menu-update"] .loader')).not.toBeNull()
    wrapper.unmount()
  })
})
