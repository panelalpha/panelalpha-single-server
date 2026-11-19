import type { ContainerGroup } from './containers.api'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import LogsTableItemSkeletonMobile from '@/shared/ui/skeletons/LogsTableItemSkeletonMobile.vue'
import LogsTableSkeletonItem from '@/shared/ui/skeletons/LogsTableSkeletonItem.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { openTooltip } from '@/test/tooltip'
import { containerLogs, createProxyRule, deleteProxyRule, listContainerGroups, listDomains, listProxyRules, projectAction, serviceAction } from './containers.api'
import ContainersView from './ContainersView.vue'

vi.mock('./containers.api', () => ({
  listContainerGroups: vi.fn(),
  listProxyRules: vi.fn(),
  projectAction: vi.fn(),
  serviceAction: vi.fn(),
  containerLogs: vi.fn(),
  createProxyRule: vi.fn(),
  deleteProxyRule: vi.fn(),
  listDomains: vi.fn(),
}))

const web = { Service: 'web', Image: 'nginx:1.27', State: 'running', Status: 'Up 2 hours', Ports: '0.0.0.0:8080->80/tcp, :::8080->80/tcp' }
const db = { Service: 'db', Image: 'postgres:16', State: 'exited', Status: 'Exited (0) 5 minutes ago', Ports: '127.0.0.1:5432->5432/tcp' }
const worker = { Service: 'worker', Image: 'worker:latest', State: 'restarting', Status: 'Restarting (1) 3 seconds ago', Ports: '0.0.0.0:3306->3306/tcp, 9000-9002/tcp' }

const exampleGroup: ContainerGroup = { account: { id: 11, username: 'example', domain: 'example.com' }, containers: [web, db, worker] }

/** Text of the tooltip of the port chip `index` (the public URLs and stream addresses of the port, or what the port is). */
async function portTooltipText (wrapper: VueWrapper, index = 0): Promise<string> {
  const chip = wrapper.findAll('[data-testid="containers-port-chip"]')[index]
  if (!chip) {
    throw new Error(`No port chip ${index}`)
  }
  return (await openTooltip(chip)).textContent ?? ''
}

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function service (accounts = [{ id: 11, domain: 'example.com' }], privileges = ['hosting.manage_containers']) {
  return makeService({ privileges, server_accounts: accounts })
}

const proxyService = () => service(undefined, ['hosting.manage_containers', 'hosting.manage_proxy_routing'])

// Every mounted view is unmounted in `afterEach`, so a failed assertion leaves no component, interval or overlay behind.
const mounted: VueWrapper[] = []

async function mountContainers (hostingService = service(), attachTo?: Element) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper: VueWrapper = await mountKit(ContainersView, { props: { service: hostingService }, global: { plugins: [pinia] }, attachTo })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

/** For a test whose subject is the unmount itself (or that mounts twice): unmounts now and takes the wrapper off the `afterEach` list. */
function unmountNow (wrapper: VueWrapper) {
  mounted.splice(mounted.indexOf(wrapper), 1)
  wrapper.unmount()
}

describe('ContainersView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(listContainerGroups).mockResolvedValue([exampleGroup])
    vi.mocked(listProxyRules).mockResolvedValue([])
  })

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount()
    }
    vi.useRealTimers()
  })

  describe('variants', () => {
    async function mountVariant (props: Record<string, unknown>, hostingService = service()) {
      const pinia = createPinia()
      setActivePinia(pinia)
      const wrapper: VueWrapper = await mountKit(ContainersView, { props: { service: hostingService, ...props }, global: { plugins: [pinia] } })
      mounted.push(wrapper)
      await flushPromises()
      return wrapper
    }

    it('renders the Advanced page frame in the project variant', async () => {
      const wrapper = await mountVariant({ variant: 'project' })

      expect(wrapper.classes()).toContain('advanced-hosting-page')
      const header = wrapper.find('.page-title.page-title--advanced')
      expect(header.exists()).toBe(true)
      expect(header.find('.page-title__title-box h4.page-title__title[data-testid="containers-title"]').exists()).toBe(true)
      const controls = header.find('.page-title__filter-controls')
      // No Refresh button: the list polls by itself; Actions is the only control.
      expect(controls.find('[data-testid="containers-refresh"]').exists()).toBe(false)
      expect(controls.find('[data-testid="containers-actions-button"]').exists()).toBe(true)
      expect(controls.classes()).not.toContain('justify-end')
      expect(header.find('.title-row').exists()).toBe(false)
    })

    it('keeps the hosting header without the Advanced classes', async () => {
      const wrapper = await mountVariant({})

      expect(wrapper.classes()).not.toContain('advanced-hosting-page')
      expect(wrapper.find('.title-row').exists()).toBe(true)
      expect(wrapper.find('.page-title--advanced').exists()).toBe(false)
      expect(wrapper.find('.page-title__filter-controls').classes()).toContain('justify-end')
    })

    it('takes the server IP of the project variant from the prop', async () => {
      vi.mocked(listContainerGroups).mockResolvedValue([{ ...exampleGroup, containers: [web] }])
      vi.mocked(listProxyRules).mockResolvedValue([
        { id: 2, transport: 'tcp', upstream_port: 8080, upstream_protocol: 'tcp', listen_port: 9091, server_name: null, username: 'example' },
      ])
      const hostingService = service([{ id: 11, domain: 'example.com', ipv4_addresses: ['192.0.2.10'] }], ['hosting.manage_containers', 'hosting.manage_proxy_routing'])

      const wrapper = await mountVariant({ variant: 'project', serverIp: '203.0.113.7' }, hostingService)
      const tooltip = await portTooltipText(wrapper)

      expect(tooltip).toContain('203.0.113.7:9091')
      expect(tooltip).not.toContain('192.0.2.10')
    })

    it('loads the groups with the service id in the project variant', async () => {
      await mountVariant({ variant: 'project' }, makeService({ id: 5, privileges: ['hosting.manage_containers'], server_accounts: [{ id: 77 }] }))

      expect(listContainerGroups).toHaveBeenCalledWith(5)
    })

    describe('scope to the project', () => {
      const own: ContainerGroup = { account: { id: 77, username: 'mine', domain: 'mine.example.com' }, containers: [web] }
      const other: ContainerGroup = { account: { id: 78, username: 'other', domain: 'other.example.com' }, containers: [web] }
      const proxyPrivileges = ['hosting.manage_containers', 'hosting.manage_proxy_routing']
      const projectService = () => makeService({ id: 5, privileges: proxyPrivileges, server_accounts: [{ id: 77 }] })

      it('renders only the group of the project', async () => {
        vi.mocked(listContainerGroups).mockResolvedValue([other, own])

        const wrapper = await mountVariant({ variant: 'project' }, projectService())

        // `project`: no group header (the lite table has none), one table with the containers of the group of the project.
        expect(wrapper.findAll('[data-testid="containers-group"]')).toHaveLength(0)
        expect(wrapper.findAll('[data-testid="containers-table"]')).toHaveLength(1)
        expect(wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(1)
        expect(wrapper.text()).not.toContain('other.example.com')
      })

      it('drops the rules of another account that share the upstream port', async () => {
        vi.mocked(listContainerGroups).mockResolvedValue([other, own])
        vi.mocked(listProxyRules).mockResolvedValue([
          { id: 1, transport: 'tcp', upstream_port: 8080, upstream_protocol: 'tcp', listen_port: 9091, server_name: null, username: 'other' },
          { id: 2, transport: 'tcp', upstream_port: 8080, upstream_protocol: 'tcp', listen_port: 9092, server_name: null, username: 'mine' },
        ])

        const wrapper = await mountVariant({ variant: 'project', serverIp: '203.0.113.7' }, projectService())
        const tooltip = await portTooltipText(wrapper)

        expect(tooltip).toContain('203.0.113.7:9092')
        expect(tooltip).not.toContain('203.0.113.7:9091')
      })

      it('keeps the rules of another account out of the Manage URLs dialog', async () => {
        vi.mocked(listContainerGroups).mockResolvedValue([other, own])
        vi.mocked(listDomains).mockResolvedValue([{ domain: 'mine.example.com' }])
        vi.mocked(listProxyRules).mockResolvedValue([
          { id: 1, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 9091, server_name: 'other.example.com', username: 'other' },
          { id: 2, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 9092, server_name: 'mine.example.com', username: 'mine' },
        ])
        const wrapper = await mountVariant({ variant: 'project', serverIp: '203.0.113.7' }, projectService())

        await wrapper.find('[data-testid="containers-public-urls"]').trigger('click')
        await flushPromises()

        const dialogText = document.querySelector('.v-dialog')?.textContent ?? ''
        expect(dialogText).toContain('9092')
        expect(dialogText).not.toContain('9091')
        expect(dialogText).not.toContain('other.example.com')
      })

      it('shows the empty table when no group matches', async () => {
        vi.mocked(listContainerGroups).mockResolvedValue([other])

        const wrapper = await mountVariant({ variant: 'project' }, projectService())

        expect(wrapper.find('[data-testid="containers-title"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="containers-group"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="containers-card"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="containers-table"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('No Containers Found')
        expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
      })

      it('shows the table skeleton instead of the spinner on the first load', async () => {
        const innerWidth = window.innerWidth
        try {
          Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 })
          vi.mocked(listContainerGroups).mockReturnValue(new Promise(() => {}))

          const wrapper = await mountVariant({ variant: 'project' }, projectService())

          expect(wrapper.find('[data-testid="containers-card"]').classes()).toContain('data-table--loading')
          expect(wrapper.findComponent(LogsTableSkeletonItem).exists()).toBe(true)
          expect(wrapper.findComponent(LogsTableItemSkeletonMobile).exists()).toBe(false)
          expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
          expect(wrapper.text()).not.toContain('No Containers Found')
        } finally {
          Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: innerWidth })
        }
      })

      it('shows the mobile skeleton rows below the large breakpoint', async () => {
        const innerWidth = window.innerWidth
        try {
          Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
          vi.mocked(listContainerGroups).mockReturnValue(new Promise(() => {}))

          const wrapper = await mountVariant({ variant: 'project' }, projectService())

          expect(wrapper.findAllComponents(LogsTableItemSkeletonMobile)).toHaveLength(5)
          expect(wrapper.findComponent(LogsTableSkeletonItem).exists()).toBe(false)
        } finally {
          Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: innerWidth })
        }
      })

      it('keeps the spinner and no skeleton on the first load of the hosting variant', async () => {
        vi.mocked(listContainerGroups).mockReturnValue(new Promise(() => {}))

        const { wrapper } = await mountContainers()

        expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
        expect(wrapper.findComponent(LogsTableSkeletonItem).exists()).toBe(false)
      })

      it('does not show the skeleton on the reload after an action while the groups are on screen', async () => {
        vi.mocked(listContainerGroups).mockResolvedValue([own])
        const wrapper = await mountVariant({ variant: 'project' }, projectService())
        const pending = deferred<ContainerGroup[]>()
        vi.mocked(listContainerGroups).mockReturnValue(pending.promise)

        // Start All (no confirmation) reloads the groups with a non-silent load.
        await wrapper.get('[data-testid="containers-actions-button"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="containers-actions-item"]')!.click()
        await flushPromises()
        expect(listContainerGroups).toHaveBeenCalledTimes(2)

        expect(wrapper.find('[data-testid="containers-card"]').classes()).not.toContain('data-table--loading')
        expect(wrapper.findComponent(LogsTableSkeletonItem).exists()).toBe(false)
        expect(wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(1)
        pending.resolve([own])
        await flushPromises()
      })

      it('scopes the silent poll as well', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        vi.mocked(listContainerGroups).mockResolvedValue([own])
        const wrapper = await mountVariant({ variant: 'project' }, projectService())
        vi.mocked(listContainerGroups).mockResolvedValue([other, own])

        vi.advanceTimersByTime(15_000)
        await flushPromises()

        expect(listContainerGroups).toHaveBeenCalledTimes(2)
        expect(wrapper.findAll('[data-testid="containers-table"]')).toHaveLength(1)
        expect(wrapper.text()).not.toContain('other.example.com')
      })

      it('keeps every group in the hosting variant', async () => {
        vi.mocked(listContainerGroups).mockResolvedValue([other, own])

        const wrapper = await mountVariant({}, projectService())

        expect(wrapper.findAll('[data-testid="containers-group"]')).toHaveLength(2)
      })
    })
  })

  it('loads the groups once and lists the containers of each account, without the proxy rules', async () => {
    const { wrapper } = await mountContainers()

    expect(listContainerGroups).toHaveBeenCalledTimes(1)
    expect(listContainerGroups).toHaveBeenCalledWith(1)
    expect(listProxyRules).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="containers-group"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('example.com')
    expect(wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('running')
    expect(wrapper.text()).toContain('8080')
    expect(wrapper.text()).toContain('5432')
    expect(wrapper.text()).toContain('9000-9002')
  })

  it('lays the group table out as cards on a narrow screen and as a table on a wide one', async () => {
    const innerWidth = window.innerWidth
    try {
      vi.mocked(listContainerGroups).mockResolvedValue([exampleGroup])
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
      const narrow = await mountContainers()
      expect(narrow.wrapper.findAll('.mobile-table-item').length).toBeGreaterThan(0)
      expect(narrow.wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(3)
      unmountNow(narrow.wrapper)

      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 })
      const wide = await mountContainers()
      expect(wide.wrapper.findAll('.mobile-table-item')).toHaveLength(0)
      expect(wide.wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(3)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: innerWidth })
    }
  })

  it('shows the group under its username when the account has no domain', async () => {
    vi.mocked(listContainerGroups).mockResolvedValue([{ ...exampleGroup, account: { id: 11, username: 'example', domain: null } }])

    const { wrapper } = await mountContainers()

    expect(wrapper.find('[data-testid="containers-group-title"]').text()).toBe('example')
  })

  it('shows only the title when there are no groups', async () => {
    vi.mocked(listContainerGroups).mockResolvedValue([])

    const { wrapper } = await mountContainers()

    expect(wrapper.find('[data-testid="containers-title"]').text()).toBe('heading.hosting.containers.title')
    expect(wrapper.findAll('[data-testid="containers-group"]')).toHaveLength(0)
    expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
  })

  it('shows the empty text in a group without containers', async () => {
    vi.mocked(listContainerGroups).mockResolvedValue([{ ...exampleGroup, containers: [] }])

    const { wrapper } = await mountContainers()

    expect(wrapper.findAll('[data-testid="containers-group"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('No Containers Found')
  })

  it('shows only the spinner while the first load is pending', async () => {
    vi.mocked(listContainerGroups).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountContainers()

    expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="containers-group"]')).toHaveLength(0)
  })

  it('raises an alert on a failed load, resets the spinner and keeps the title', async () => {
    vi.mocked(listContainerGroups).mockRejectedValueOnce({ response: { data: { message: 'Server Error' } } })

    const { wrapper, alerts } = await mountContainers()

    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Server Error'])
    expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
    expect(wrapper.find('[data-testid="containers-title"]').exists()).toBe(true)
  })

  it('keeps a failed poll silent and the list that was shown', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { wrapper, alerts } = await mountContainers()
    vi.mocked(listContainerGroups).mockRejectedValueOnce({ response: { data: { message: 'Server Error' } } })

    vi.advanceTimersByTime(15_000)
    await flushPromises()

    expect(listContainerGroups).toHaveBeenCalledTimes(2)
    expect(alerts.activeAlerts).toEqual([])
    expect(wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(3)
    expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
  })

  it('polls the groups every 15 seconds without the spinner', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { wrapper } = await mountContainers()
    const pending = deferred<ContainerGroup[]>()
    vi.mocked(listContainerGroups).mockReturnValueOnce(pending.promise)

    vi.advanceTimersByTime(14_999)
    expect(listContainerGroups).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(listContainerGroups).toHaveBeenCalledTimes(2)
    await flushPromises()
    expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(3)
    pending.resolve([exampleGroup])
    await flushPromises()
  })

  it('keeps the newer data when a poll finishes before a load that was started earlier, and resets the spinner', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const oldLoad = deferred<ContainerGroup[]>()
    const newPoll = deferred<ContainerGroup[]>()
    vi.mocked(listContainerGroups).mockReturnValueOnce(oldLoad.promise).mockReturnValueOnce(newPoll.promise)

    const { wrapper } = await mountContainers()
    expect(wrapper.find('.v-progress-circular').exists()).toBe(true)

    vi.advanceTimersByTime(15_000)
    newPoll.resolve([{ ...exampleGroup, account: { id: 12, username: 'newer', domain: 'newer.test' } }])
    await flushPromises()
    oldLoad.resolve([exampleGroup])
    await flushPromises()

    expect(wrapper.text()).toContain('newer.test')
    expect(wrapper.text()).not.toContain('example.com')
    expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
  })

  it('asks for the proxy rules only with the proxy routing privilege', async () => {
    await mountContainers(proxyService())

    expect(listProxyRules).toHaveBeenCalledTimes(1)
    expect(listProxyRules).toHaveBeenCalledWith(1)
  })

  it('keeps the list when the proxy rules fail, without an alert', async () => {
    vi.mocked(listProxyRules).mockRejectedValueOnce({ response: { data: { message: 'Server Error' } } })

    const { wrapper, alerts } = await mountContainers(proxyService())

    expect(wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(3)
    expect(alerts.activeAlerts).toEqual([])
  })

  it('lists the URL of an http rule and a stream rule as the server address and the listen port in the tooltips of the ports', async () => {
    const api = { Service: 'api', Image: 'api:1', State: 'running', Status: 'Up 1 hour', Ports: '0.0.0.0:9090->9090/tcp' }
    vi.mocked(listContainerGroups).mockResolvedValue([{ ...exampleGroup, containers: [web, api] }])
    vi.mocked(listProxyRules).mockResolvedValue([
      { id: 1, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 80, server_name: 'example.com' },
      { id: 2, transport: 'tcp', upstream_port: 9090, upstream_protocol: 'tcp', listen_port: 9091, server_name: null },
    ])

    const { wrapper } = await mountContainers(service([{ id: 11, domain: 'example.com', ipv4_addresses: ['192.0.2.10'] }], ['hosting.manage_containers', 'hosting.manage_proxy_routing']))

    // The table shows the ports only; the URLs are in the tooltip of each port.
    expect(wrapper.findAll('[data-testid="containers-port-chip"]').map(chip => chip.text())).toEqual(['8080', '9090'])
    expect(wrapper.find('[data-testid="containers-table"] a').exists()).toBe(false)
    // eslint-disable-next-line unicorn/prefer-https -- plain http: a port 80 rule without an https upstream
    expect(await portTooltipText(wrapper, 0)).toContain('http://example.com/')
    expect(await portTooltipText(wrapper, 1)).toContain('192.0.2.10:9091')
  })

  it('shows the Public URLs row action only with the proxy routing privilege, disabled for a container without a published port', async () => {
    const withoutPrivilege = await mountContainers()
    expect(withoutPrivilege.wrapper.findAll('[data-testid="containers-public-urls"]')).toHaveLength(0)
    unmountNow(withoutPrivilege.wrapper)

    const local = { Service: 'cron', Image: 'cron:1', State: 'running', Status: 'Up 1 hour', Ports: '' }
    vi.mocked(listContainerGroups).mockResolvedValue([{ ...exampleGroup, containers: [web, local] }])
    const withPrivilege = await mountContainers(proxyService())
    const buttons = withPrivilege.wrapper.findAll('[data-testid="containers-public-urls"]')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.attributes('disabled')).toBeUndefined()
    expect(buttons[1]!.attributes('disabled')).toBeDefined()
    unmountNow(withPrivilege.wrapper)
  })

  it('shows the uptime of a running container and the dash for one that does not run, with the Docker status as the title', async () => {
    const { wrapper } = await mountContainers()
    const uptime = wrapper.findAll('.containers-uptime')

    expect(uptime.map(cell => cell.text())).toEqual(['2 hours', '—', '—'])
    expect(uptime[1]!.attributes('title')).toBe('Exited (0) 5 minutes ago')
  })

  // Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
  it('renders the service actions with their tooltips unchanged', async () => {
    const { wrapper } = await mountContainers()

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.service.stop"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.service.stop</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.service.restart"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.service.restart</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.logs.title"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.logs.title</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.service.start"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.service.start</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="heading.hosting.containers.service.restart"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.logs.title"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.logs.title</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.service.stop"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.service.stop</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.service.restart"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.service.restart</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="heading.hosting.containers.logs.title"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>heading.hosting.containers.logs.title</span>",
          },
        },
      ]
    `)
  })

  it('stops polling when it is unmounted', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { wrapper } = await mountContainers()
    unmountNow(wrapper)

    vi.advanceTimersByTime(60_000)

    expect(listContainerGroups).toHaveBeenCalledTimes(1)
  })

  describe('project and service actions', () => {
    const UP = 'heading.hosting.containers.action.up'
    const RESTART = 'heading.hosting.containers.action.restart'
    const STOP = 'heading.hosting.containers.action.stop'
    const PULL = 'heading.hosting.containers.action.pull'
    const SERVICE_STOP = 'heading.hosting.containers.service.stop'
    const SERVICE_RESTART = 'heading.hosting.containers.service.restart'

    function actionButton (wrapper: VueWrapper, key: string) {
      const button = wrapper.findAll('[data-testid="containers-group"] button').find(item => item.text() === key)
      if (!button) {
        throw new Error(`No project action button "${key}"`)
      }
      return button
    }

    // The Confirm button of the confirmation dialog: the label of the action, in the overlay.
    function confirmButton (label: string) {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === label && item.closest('.v-overlay'))
      if (!button) {
        throw new Error(`No confirmation button "${label}"`)
      }
      return button
    }

    function confirmDialogOpen (wrapper: VueWrapper): boolean {
      return wrapper.findComponent({ name: 'VDialog' }).props('modelValue')
    }

    const confirmText = () => document.querySelector('[data-testid="containers-confirm"]')?.textContent ?? ''
    const webRowActions = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="containers-table"] tbody tr')[0]!.findAll('td').at(-1)!.findAll('button')

    let host: HTMLElement

    beforeEach(() => {
      host = document.createElement('div')
      document.body.append(host)
    })

    afterEach(() => {
      host.remove()
    })

    it('runs Start All at once for the account and reloads the groups', async () => {
      const { wrapper } = await mountContainers()

      await actionButton(wrapper, UP).trigger('click')
      await flushPromises()

      expect(projectAction).toHaveBeenCalledWith(1, 11, 'up')
      expect(listContainerGroups).toHaveBeenCalledTimes(2)
      expect(confirmDialogOpen(wrapper)).toBe(false)
    })

    it('disables the group buttons and spins the clicked one while the project action runs', async () => {
      const request = deferred<void>()
      vi.mocked(projectAction).mockReturnValueOnce(request.promise)
      const { wrapper } = await mountContainers()

      await actionButton(wrapper, UP).trigger('click')
      await flushPromises()

      expect(actionButton(wrapper, UP).classes()).toContain('v-btn--loading')
      expect(actionButton(wrapper, RESTART).attributes('disabled')).toBeDefined()

      request.resolve()
      await flushPromises()

      expect(actionButton(wrapper, UP).classes()).not.toContain('v-btn--loading')
      expect(actionButton(wrapper, RESTART).attributes('disabled')).toBeUndefined()
    })

    it('raises an alert and does not reload when a project action fails', async () => {
      vi.mocked(projectAction).mockRejectedValueOnce({ response: { data: { message: 'Engine error' } } })
      const { wrapper, alerts } = await mountContainers()

      await actionButton(wrapper, UP).trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(listContainerGroups).toHaveBeenCalledTimes(1)
      expect(actionButton(wrapper, UP).attributes('disabled')).toBeUndefined()
    })

    it('asks before Restart, Stop All and Pull & Redeploy, and runs the action on confirm (ID-46)', async () => {
      const { wrapper } = await mountContainers(service(), host)

      for (const [label, action] of [[RESTART, 'restart'], [STOP, 'stop'], [PULL, 'pull']] as const) {
        vi.mocked(projectAction).mockClear()
        await actionButton(wrapper, label).trigger('click')
        await flushPromises()

        expect(projectAction).not.toHaveBeenCalled()
        expect(confirmDialogOpen(wrapper)).toBe(true)
        expect(confirmText()).toContain(`heading.hosting.containers.confirm.${action}.title`)
        expect(confirmText()).toContain(`heading.hosting.containers.confirm.${action}.message`)

        confirmButton(label).click()
        await flushPromises()

        expect(confirmDialogOpen(wrapper)).toBe(false)
        expect(projectAction).toHaveBeenCalledWith(1, 11, action)
      }
    })

    it('is a danger dialog without a checkbox: the warning icon and a red button that is enabled at once', async () => {
      const { wrapper } = await mountContainers(service(), host)

      await actionButton(wrapper, RESTART).trigger('click')
      await flushPromises()

      expect(document.querySelector('[data-testid="containers-confirm"] input[type="checkbox"]')).toBeNull()
      expect(confirmText()).not.toContain('message.confirmAction')
      const button = confirmButton(RESTART) as HTMLButtonElement
      expect(button.disabled).toBe(false)
      expect(button.className).toContain('bg-error')
    })

    it('runs nothing when the confirmation is cancelled', async () => {
      const { wrapper } = await mountContainers(service(), host)

      await actionButton(wrapper, STOP).trigger('click')
      await flushPromises()
      confirmButton('button.cancel').click()
      await flushPromises()

      expect(confirmDialogOpen(wrapper)).toBe(false)
      expect(projectAction).not.toHaveBeenCalled()
      expect(listContainerGroups).toHaveBeenCalledTimes(1)
    })

    it('has no Down button (ID-46)', async () => {
      const { wrapper } = await mountContainers()

      // The row actions are icon buttons without text; the labelled ones are the group buttons.
      const labels = wrapper.findAll('[data-testid="containers-group"] button').map(button => button.text()).filter(Boolean)
      expect(labels).toEqual([UP, RESTART, STOP, PULL])
    })

    it('asks before stopping a container, then runs the action with the account and the service and reloads the groups', async () => {
      const { wrapper } = await mountContainers(service(), host)
      // The web row is running: the one Start/Stop button (first) stops it.
      await webRowActions(wrapper)[0]!.trigger('click')
      await flushPromises()

      expect(serviceAction).not.toHaveBeenCalled()
      expect(confirmText()).toContain('heading.hosting.containers.confirm.serviceStop.title')

      confirmButton(SERVICE_STOP).click()
      await flushPromises()

      expect(serviceAction).toHaveBeenCalledWith(1, 11, 'web', 'stop')
      expect(listContainerGroups).toHaveBeenCalledTimes(2)
    })

    it('starts a stopped container at once', async () => {
      const { wrapper } = await mountContainers()
      const dbRowActions = wrapper.findAll('[data-testid="containers-table"] tbody tr')[1]!.findAll('td').at(-1)!.findAll('button')

      await dbRowActions[0]!.trigger('click')
      await flushPromises()

      expect(serviceAction).toHaveBeenCalledWith(1, 11, 'db', 'start')
      expect(confirmDialogOpen(wrapper)).toBe(false)
    })

    it('raises an alert and does not reload when a container action fails', async () => {
      vi.mocked(serviceAction).mockRejectedValueOnce({ response: { data: { message: 'Engine error' } } })
      const { wrapper, alerts } = await mountContainers(service(), host)

      await webRowActions(wrapper)[0]!.trigger('click')
      await flushPromises()
      confirmButton(SERVICE_STOP).click()
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(listContainerGroups).toHaveBeenCalledTimes(1)
      expect(webRowActions(wrapper)[0]!.attributes('disabled')).toBeUndefined()
    })

    it('names the icon buttons for assistive technology, with the text of their tooltips', async () => {
      const { wrapper } = await mountContainers()

      expect(wrapper.find('[data-testid="containers-refresh"]').exists()).toBe(false)
      expect(actionButton(wrapper, UP).attributes('aria-label')).toBe(UP)
      expect(webRowActions(wrapper).map(button => button.attributes('aria-label'))).toEqual([
        SERVICE_STOP,
        SERVICE_RESTART,
        'heading.hosting.containers.logs.title',
      ])
    })

    it('spins the clicked row button and disables the other buttons of the row while the container action runs', async () => {
      const request = deferred<void>()
      vi.mocked(serviceAction).mockReturnValueOnce(request.promise)
      const { wrapper } = await mountContainers(service(), host)

      await webRowActions(wrapper)[1]!.trigger('click')
      await flushPromises()
      expect(confirmText()).toContain('heading.hosting.containers.confirm.serviceRestart.title')
      confirmButton(SERVICE_RESTART).click()
      await flushPromises()

      expect(serviceAction).toHaveBeenCalledWith(1, 11, 'web', 'restart')
      expect(webRowActions(wrapper)[1]!.classes()).toContain('v-btn--loading')
      expect(webRowActions(wrapper)[0]!.attributes('disabled')).toBeDefined()
      expect(webRowActions(wrapper)[2]!.attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid="containers-table"] .v-progress-circular:not(.v-btn .v-progress-circular)').exists()).toBe(false)

      request.resolve()
      await flushPromises()

      expect(webRowActions(wrapper)[1]!.classes()).not.toContain('v-btn--loading')
      expect(webRowActions(wrapper)[0]!.attributes('disabled')).toBeUndefined()
    })

    it('opens the confirmation after the legacy overlay and closes it on an overlay click without running the action (kit-dialog-hosting)', async () => {
      const { wrapper } = await mountContainers(service(), host)
      await actionButton(wrapper, RESTART).trigger('click')
      await flushPromises()

      expectOverlayBeforeCard('.v-overlay__content > .v-card')
      expectLegacyTransition(wrapper)
      await clickOverlay(expectOverlayBeforeCard('.v-overlay__content > .v-card'))

      expect(confirmDialogOpen(wrapper)).toBe(false)
      expect(projectAction).not.toHaveBeenCalled()
    })
  })

  describe('project Actions menu', () => {
    const projectGroup: ContainerGroup = { account: { id: 77, username: 'mine', domain: 'mine.example.com' }, containers: [web] }
    const projectService = () => makeService({ id: 5, privileges: ['hosting.manage_containers'], server_accounts: [{ id: 77 }] })
    const MENU_KEYS = [
      'heading.hosting.containers.action.up',
      'heading.hosting.containers.action.restart',
      'heading.hosting.containers.action.stop',
      'heading.hosting.containers.action.pull',
    ]

    async function mountProject (groups: ContainerGroup[] = [projectGroup]) {
      vi.mocked(listContainerGroups).mockResolvedValue(groups)
      const pinia = createPinia()
      setActivePinia(pinia)
      const wrapper: VueWrapper = await mountKit(ContainersView, { props: { service: projectService(), variant: 'project' }, global: { plugins: [pinia] } })
      mounted.push(wrapper)
      await flushPromises()
      return { wrapper, alerts: useAlertsStore() }
    }

    function actionsButton (wrapper: VueWrapper) {
      return wrapper.get('[data-testid="containers-actions-button"]')
    }

    function confirmDialogOpen (wrapper: VueWrapper): boolean {
      return wrapper.findComponent({ name: 'VDialog' }).props('modelValue')
    }

    async function openMenu (wrapper: VueWrapper) {
      await actionsButton(wrapper).trigger('click')
      await flushPromises()
      return [...document.querySelectorAll<HTMLElement>('[data-testid="containers-actions-item"]')]
    }

    it('shows Actions in the title with the legacy items in order, without Down (ID-46)', async () => {
      const { wrapper } = await mountProject()

      expect(wrapper.get('.page-title__filter-controls').find('[data-testid="containers-actions-button"]').exists()).toBe(true)
      expect(actionsButton(wrapper).attributes('aria-label')).toBe('button.actions')
      const items = await openMenu(wrapper)
      expect(items.map(item => item.textContent?.trim())).toEqual(MENU_KEYS)
    })

    it('keeps the name of Actions below the small breakpoint, where only the icon is shown', async () => {
      const innerWidth = window.innerWidth
      try {
        Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
        const { wrapper } = await mountProject()

        expect(wrapper.find('.quick-actions-label').exists()).toBe(false)
        expect(actionsButton(wrapper).attributes('aria-label')).toBe('button.actions')
      } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: innerWidth })
      }
    })

    it('runs Start All from the menu on the group of the project at once and reloads the groups', async () => {
      const { wrapper } = await mountProject()

      const items = await openMenu(wrapper)
      items[0]!.click()
      await flushPromises()

      expect(projectAction).toHaveBeenCalledWith(5, 77, 'up')
      expect(listContainerGroups).toHaveBeenCalledTimes(2)
    })

    it('asks before Restart from the menu and runs it on the group of the project on confirm (ID-46)', async () => {
      const { wrapper } = await mountProject()

      const items = await openMenu(wrapper)
      items[1]!.click()
      await flushPromises()

      expect(projectAction).not.toHaveBeenCalled()
      expect(confirmDialogOpen(wrapper)).toBe(true)

      const confirm = [...document.querySelectorAll<HTMLElement>('[data-testid="containers-confirm"] .v-card-actions .v-btn')]
        .find(button => button.textContent?.trim() === 'heading.hosting.containers.action.restart')!
      confirm.click()
      await flushPromises()

      expect(projectAction).toHaveBeenCalledWith(5, 77, 'restart')
      expect(listContainerGroups).toHaveBeenCalledTimes(2)
    })

    it('spins Actions and disables it while an action runs', async () => {
      const request = deferred<void>()
      vi.mocked(projectAction).mockReturnValueOnce(request.promise)
      const { wrapper } = await mountProject()
      const items = await openMenu(wrapper)

      items[0]!.click()
      await flushPromises()

      expect(actionsButton(wrapper).classes()).toContain('v-btn--loading')
      expect(actionsButton(wrapper).attributes('disabled')).toBeDefined()

      request.resolve()
      await flushPromises()

      expect(actionsButton(wrapper).classes()).not.toContain('v-btn--loading')
      expect(actionsButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('disables Actions while the project has no group', async () => {
      const { wrapper } = await mountProject([])

      expect(actionsButton(wrapper).attributes('disabled')).toBeDefined()
    })

    it('disables Actions while the group of the project has no container', async () => {
      const { wrapper } = await mountProject([{ ...projectGroup, containers: [] }])

      expect(actionsButton(wrapper).attributes('disabled')).toBeDefined()
    })
  })

  describe('logs dialog', () => {
    const LOGS = 'heading.hosting.containers.logs.title'

    let host: HTMLElement

    beforeEach(() => {
      host = document.createElement('div')
      document.body.append(host)
    })

    afterEach(() => {
      host.remove()
    })

    // Logs is the last button of the row.
    async function openWebLogs (wrapper: VueWrapper) {
      const webRowActions = wrapper.findAll('[data-testid="containers-table"] tbody tr')[0].findAll('td').at(-1)!.findAll('button')
      await webRowActions.at(-1)!.trigger('click')
      await flushPromises()
    }

    function logsDialog (): Element | null {
      return document.querySelector('.logs-pre')
    }

    // Refresh is a footer button next to Close; the title has only the X.
    function logsRefreshButton (): HTMLElement {
      const button = [...document.querySelectorAll('.v-dialog button')].find(item => item.textContent?.trim() === 'button.refresh')
      if (!button) {
        throw new Error('No refresh button in the Logs dialog')
      }
      return button as HTMLElement
    }

    function logsSkeleton (): Element | null {
      return document.querySelector('[data-testid="containers-logs-skeleton"]')
    }

    it('asks for the log of the container and shows it in the dialog', async () => {
      vi.mocked(containerLogs).mockResolvedValueOnce('nginx started\nlistening on 80')
      const { wrapper } = await mountContainers(service(), host)

      await openWebLogs(wrapper)

      expect(containerLogs).toHaveBeenCalledWith(1, 11, 'web')
      expect(document.querySelector('.v-dialog')?.textContent).toContain(`${LOGS}: web`)
      expect(logsDialog()?.textContent).toBe('nginx started\nlistening on 80')
    })

    it('shows the skeleton instead of the log while the request is pending, with the loader in Refresh', async () => {
      const request = deferred<string>()
      vi.mocked(containerLogs).mockReturnValueOnce(request.promise)
      const { wrapper } = await mountContainers(service(), host)

      await openWebLogs(wrapper)

      expect(logsDialog()).toBeNull()
      expect(logsSkeleton()).not.toBeNull()
      expect(logsRefreshButton().classList).toContain('v-btn--loading')

      request.resolve('done')
      await flushPromises()

      expect(logsSkeleton()).toBeNull()
      expect(logsDialog()?.textContent).toBe('done')
    })

    it('shows the empty text for an empty log', async () => {
      vi.mocked(containerLogs).mockResolvedValueOnce('')
      const { wrapper } = await mountContainers(service(), host)

      await openWebLogs(wrapper)

      expect(logsDialog()?.textContent).toBe('heading.hosting.containers.logs.empty')
    })

    it('writes the error text into the log without an alert', async () => {
      vi.mocked(containerLogs).mockRejectedValueOnce({ response: { data: { message: 'Engine error' } } })
      const { wrapper, alerts } = await mountContainers(service(), host)

      await openWebLogs(wrapper)

      expect(logsDialog()?.textContent).toBe('heading.hosting.containers.logs.error')
      expect(alerts.activeAlerts).toEqual([])
    })

    it('keeps the skeleton of the newer request when an earlier one is answered first', async () => {
      const first = deferred<string>()
      const second = deferred<string>()
      vi.mocked(containerLogs).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const { wrapper } = await mountContainers(service(), host)
      await openWebLogs(wrapper)
      await openWebLogs(wrapper)

      first.resolve('old log')
      await flushPromises()

      expect(logsDialog()).toBeNull()
      expect(logsSkeleton()).not.toBeNull()

      second.resolve('new log')
      await flushPromises()

      expect(logsDialog()?.textContent).toBe('new log')
    })

    it('drops the late log of an earlier refresh when a newer one has been answered', async () => {
      const first = deferred<string>()
      vi.mocked(containerLogs).mockReturnValueOnce(first.promise).mockResolvedValueOnce('new log')
      const { wrapper } = await mountContainers(service(), host)
      await openWebLogs(wrapper)
      logsRefreshButton().click()
      await flushPromises()
      expect(logsDialog()?.textContent).toBe('new log')

      first.resolve('old log')
      await flushPromises()

      expect(logsDialog()?.textContent).toBe('new log')
    })

    it('asks again for the same container when the refresh button is clicked', async () => {
      vi.mocked(containerLogs).mockResolvedValueOnce('first').mockResolvedValueOnce('second')
      const { wrapper } = await mountContainers(service(), host)
      await openWebLogs(wrapper)

      logsRefreshButton().click()
      await flushPromises()

      expect(containerLogs).toHaveBeenCalledTimes(2)
      expect(containerLogs).toHaveBeenLastCalledWith(1, 11, 'web')
      expect(logsDialog()?.textContent).toBe('second')
    })

    it('has only the X in the title and Refresh with Close in the footer', async () => {
      vi.mocked(containerLogs).mockResolvedValueOnce('log')
      const { wrapper } = await mountContainers(service(), host)
      await openWebLogs(wrapper)

      expect(document.querySelectorAll('.v-dialog .v-card-title button')).toHaveLength(1)
      expect(document.querySelector('.v-dialog .v-card-title button')?.getAttribute('aria-label')).toBe('button.close')
      expect(logsRefreshButton()).toBeDefined()
      expect([...document.querySelectorAll('.v-dialog button')].some(item => item.textContent?.trim() === 'button.close')).toBe(true)
    })
    it('opens after the legacy overlay and closes it on an overlay click (kit-dialog-hosting)', async () => {
      vi.mocked(containerLogs).mockResolvedValueOnce('log')
      const { wrapper } = await mountContainers(service(), host)
      await openWebLogs(wrapper)

      expectLegacyTransition(wrapper)
      await clickOverlay(expectOverlayBeforeCard('.v-overlay__content > .v-card'))

      expect(openDialogs(wrapper)).toBe(0)
    })
  })

  describe('Manage Public URLs dialog', () => {
    const ADD_URL = 'Add URL'

    let host: HTMLElement

    beforeEach(() => {
      host = document.createElement('div')
      document.body.append(host)
      vi.mocked(listDomains).mockResolvedValue([{ domain: 'example.com' }, { domain: null }, { domain: 'shop.example.com' }])
    })

    afterEach(() => {
      host.remove()
    })

    // The web row publishes 8080 to the container port 80, with no rule yet; its Public URLs row action opens the dialog on that port.
    async function openFromRow (wrapper: VueWrapper) {
      await wrapper.find('[data-testid="containers-public-urls"]').trigger('click')
      await flushPromises()
    }

    function dialogText (): string {
      return document.querySelector('.v-dialog')?.textContent ?? ''
    }

    function dialogButton (label: string): HTMLElement {
      const button = [...document.querySelectorAll('.v-dialog button')].find(item => item.textContent?.trim() === label)
      if (!button) {
        throw new Error(`No "${label}" button in the dialog`)
      }
      return button as HTMLElement
    }

    function urlsDialogOpen (wrapper: VueWrapper): boolean {
      // The dialogs are declared as the danger dialog, Logs, then Manage Public URLs.
      return wrapper.findAllComponents({ name: 'VDialog' })[2].props('modelValue')
    }

    function confirmOpen (wrapper: VueWrapper): boolean {
      return wrapper.findAllComponents({ name: 'VDialog' })[0].props('modelValue')
    }

    // The Remove button of the danger dialog over the URLs dialog.
    function confirmRemove (): HTMLElement {
      const button = [...document.querySelectorAll('[data-testid="containers-confirm"] .v-card-actions button')]
        .find(item => item.textContent?.trim() === 'button.remove')
      if (!button) {
        throw new Error('No Remove button in the danger dialog')
      }
      return button as HTMLElement
    }

    function setListenPort (value: string) {
      const input = document.querySelector('.v-dialog input[type="number"]') as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input'))
    }

    it('opens on the first published port of the row with the account domains, the primary domain selected and its preview', async () => {
      const { wrapper } = await mountContainers(proxyService(), host)

      await openFromRow(wrapper)

      expect(listDomains).toHaveBeenCalledWith(11)
      expect(dialogText()).toContain('Port 8080 (web)')
      expect(dialogText()).toMatch(/→ http:\/\/example\.com:8080\//)
    })

    it('names the listen port field for assistive technology', async () => {
      const { wrapper } = await mountContainers(proxyService(), host)

      await openFromRow(wrapper)

      expect((document.querySelector('.v-dialog input[type="number"]') as HTMLInputElement).getAttribute('aria-label')).toBe('Port')
    })

    it('shows the dash and no Add button while the domains are loading, then the primary domain', async () => {
      const request = deferred<{ domain: string | null }[]>()
      vi.mocked(listDomains).mockReturnValueOnce(request.promise)
      const { wrapper } = await mountContainers(proxyService(), host)

      await openFromRow(wrapper)

      expect(dialogText()).toContain('→ —')
      expect(dialogText()).not.toContain('Add a domain to this project')
      expect(dialogButton(ADD_URL).hasAttribute('disabled')).toBe(true)

      request.resolve([{ domain: 'shop.example.com' }, { domain: 'example.com' }])
      await flushPromises()

      expect(dialogText()).toMatch(/→ http:\/\/example\.com:8080\//)
      expect(dialogButton(ADD_URL).hasAttribute('disabled')).toBe(false)
    })

    it('keeps the answer of an earlier open out of the dialog that replaced it', async () => {
      const slow = deferred<{ domain: string | null }[]>()
      vi.mocked(listDomains).mockReturnValueOnce(slow.promise).mockResolvedValueOnce([{ domain: 'other.test' }])
      vi.mocked(listContainerGroups).mockResolvedValue([
        { ...exampleGroup, containers: [web] },
        { account: { id: 12, username: 'other', domain: 'other.test' }, containers: [web] },
      ])
      const { wrapper } = await mountContainers(proxyService(), host)
      const actions = wrapper.findAll('[data-testid="containers-public-urls"]')

      await actions[0].trigger('click')
      await actions[1].trigger('click')
      await flushPromises()
      slow.resolve([{ domain: 'example.com' }])
      await flushPromises()

      expect(listDomains).toHaveBeenNthCalledWith(1, 11)
      expect(listDomains).toHaveBeenNthCalledWith(2, 12)
      expect(dialogText()).toMatch(/→ http:\/\/other\.test:8080\//)
      expect(dialogText()).not.toContain('example.com')
    })

    it('shows no Public URLs action and asks no domains without the proxy routing privilege', async () => {
      const { wrapper } = await mountContainers(service(), host)

      expect(wrapper.find('[data-testid="containers-public-urls"]').exists()).toBe(false)
      expect(listDomains).not.toHaveBeenCalled()
    })

    it('posts the new rule with the account username, the chosen domain and the port typed in the form', async () => {
      const { wrapper, alerts } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)
      // What the reload sees: the alert is raised first and the dialog is still open.
      const atReload: { alerts: number, open: boolean }[] = []
      vi.mocked(listContainerGroups).mockImplementationOnce(async () => {
        atReload.push({ alerts: alerts.activeAlerts.length, open: urlsDialogOpen(wrapper) })
        return [exampleGroup]
      })

      dialogButton(ADD_URL).click()
      await flushPromises()

      expect(createProxyRule).toHaveBeenCalledWith(1, {
        transport: 'http',
        listen_ip: null,
        listen_port: 8080,
        server_name: 'example.com',
        upstream_host: 'example',
        upstream_port: 8080,
        upstream_protocol: 'http',
        enabled: true,
      })
      expect(alerts.activeAlerts).toHaveLength(1)
      expect(listContainerGroups).toHaveBeenCalledTimes(2)
      expect(atReload).toEqual([{ alerts: 1, open: true }])
      expect(urlsDialogOpen(wrapper)).toBe(false)
    })

    it('posts the rule once when the Add button is activated again while the request runs', async () => {
      const request = deferred<void>()
      vi.mocked(createProxyRule).mockReturnValueOnce(request.promise)
      const { wrapper } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)

      dialogButton(ADD_URL).click()
      await flushPromises()
      dialogButton(ADD_URL).click()
      await flushPromises()

      expect(createProxyRule).toHaveBeenCalledTimes(1)
      expect(wrapper.findAllComponents({ name: 'VDialog' })[2].props('persistent')).toBe(true)

      request.resolve()
      await flushPromises()

      expect(urlsDialogOpen(wrapper)).toBe(false)
    })

    it.each(['0', '-1', '70000'])('sends nothing for the listen port %s, outside 1 to 65535', async port => {
      const { wrapper } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)

      setListenPort(port)
      await flushPromises()
      dialogButton(ADD_URL).click()
      await flushPromises()

      expect(createProxyRule).not.toHaveBeenCalled()
    })

    it('keeps the dialog open with an alert when the rule cannot be saved', async () => {
      vi.mocked(createProxyRule).mockRejectedValueOnce({ response: { data: { message: 'Engine error' } } })
      const { wrapper, alerts } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)

      dialogButton(ADD_URL).click()
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(dialogText()).toContain('Port 8080 (web)')
      expect(listContainerGroups).toHaveBeenCalledTimes(1)
    })

    it('asks for a domain and keeps the alert off when the domains cannot be loaded', async () => {
      vi.mocked(listDomains).mockRejectedValueOnce({ response: { data: { message: 'Server Error' } } })
      const { wrapper, alerts } = await mountContainers(proxyService(), host)

      await openFromRow(wrapper)

      expect(dialogText()).toContain('Add a domain to this project before creating a public URL.')
      expect(dialogButton(ADD_URL).hasAttribute('disabled')).toBe(true)
      expect(alerts.activeAlerts).toEqual([])
    })

    it('lists the existing HTTP rules of the port and deletes one', async () => {
      vi.mocked(listProxyRules).mockResolvedValue([
        { id: 5, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 8080, server_name: 'example.com' },
      ])
      const { wrapper, alerts } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)

      expect(dialogText()).toContain('Listen port 8080')
      expect(dialogText()).toContain('· example.com')

      const atReload: { alerts: number, open: boolean }[] = []
      vi.mocked(listContainerGroups).mockImplementationOnce(async () => {
        atReload.push({ alerts: alerts.activeAlerts.length, open: urlsDialogOpen(wrapper) })
        return [exampleGroup]
      })
      const deleteButton = document.querySelector('.v-dialog .v-list button') as HTMLElement
      deleteButton.click()
      await flushPromises()
      expect(deleteProxyRule).not.toHaveBeenCalled()
      confirmRemove().click()
      await flushPromises()

      expect(deleteProxyRule).toHaveBeenCalledWith(1, 5)
      expect(listContainerGroups).toHaveBeenCalledTimes(2)
      expect(atReload).toEqual([{ alerts: 1, open: true }])
      // Only the confirmation closes: the URLs dialog stays open, without the removed URL.
      expect(confirmOpen(wrapper)).toBe(false)
      expect(urlsDialogOpen(wrapper)).toBe(true)
      expect(dialogText()).not.toContain('· example.com')
      expect(dialogText()).toContain('No public URLs configured for this port')
    })

    it('keeps the other URLs of the port listed after a removal', async () => {
      const rules = [
        { id: 5, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 8080, server_name: 'example.com' },
        { id: 6, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 8081, server_name: 'shop.example.com' },
      ]
      vi.mocked(listProxyRules).mockResolvedValue(rules)
      const { wrapper } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)
      vi.mocked(listProxyRules).mockResolvedValue([rules[1]!])

      ;(document.querySelector('.v-dialog .v-list button') as HTMLElement).click()
      await flushPromises()
      confirmRemove().click()
      await flushPromises()

      expect(urlsDialogOpen(wrapper)).toBe(true)
      expect(dialogText()).not.toContain('Listen port 8080')
      expect(dialogText()).toContain('Listen port 8081')
      expect(document.querySelectorAll('.v-dialog .v-list .urls-rule')).toHaveLength(1)
    })

    it('asks before removing a public URL, naming the URL, the port and the container; Cancel keeps the rule (ID-46)', async () => {
      vi.mocked(listProxyRules).mockResolvedValue([
        { id: 5, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 8080, server_name: 'example.com' },
      ])
      const { wrapper } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)

      ;(document.querySelector('.v-dialog .v-list button') as HTMLElement).click()
      await flushPromises()

      expect(confirmOpen(wrapper)).toBe(true)
      expect(urlsDialogOpen(wrapper)).toBe(true)
      const text = document.querySelector('[data-testid="containers-confirm"]')?.textContent ?? ''
      expect(text).toContain('heading.hosting.containers.confirm.removeUrl.title')
      expect(text).toContain('heading.hosting.containers.confirm.removeUrl.message')

      const cancel = [...document.querySelectorAll('[data-testid="containers-confirm"] .v-card-actions button')]
        .find(item => item.textContent?.trim() === 'button.cancel') as HTMLElement
      cancel.click()
      await flushPromises()

      expect(confirmOpen(wrapper)).toBe(false)
      expect(urlsDialogOpen(wrapper)).toBe(true)
      expect(deleteProxyRule).not.toHaveBeenCalled()
    })

    it('deletes one rule at a time, whichever delete button is activated while a request runs', async () => {
      const request = deferred<void>()
      vi.mocked(deleteProxyRule).mockReturnValueOnce(request.promise)
      vi.mocked(listProxyRules).mockResolvedValue([
        { id: 5, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 8080, server_name: 'example.com' },
        { id: 6, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 8081, server_name: 'shop.example.com' },
      ])
      const { wrapper } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)
      const [first, second] = document.querySelectorAll<HTMLElement>('.v-dialog .v-list button')

      first.click()
      await flushPromises()
      confirmRemove().click()
      await flushPromises()
      // While the delete runs, a trash icon opens no second confirmation.
      first.click()
      second.click()
      await flushPromises()

      expect(confirmOpen(wrapper)).toBe(false)
      expect(deleteProxyRule).toHaveBeenCalledTimes(1)
      expect(deleteProxyRule).toHaveBeenCalledWith(1, 5)

      request.resolve()
      await flushPromises()
    })
    it('opens after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
      const { wrapper } = await mountContainers(proxyService(), host)
      await openFromRow(wrapper)

      const overlay = expectOverlayBeforeCard('.v-overlay__content > .v-card')
      expectLegacyTransition(wrapper)
      await clickOverlay(overlay)

      expect(urlsDialogOpen(wrapper)).toBe(false)
    })
  })
})

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  const originalWidth = window.innerWidth

  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listContainerGroups).mockResolvedValue([exampleGroup])
    vi.mocked(listProxyRules).mockResolvedValue([])
  })

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount()
    }
    window.innerWidth = originalWidth
  })

  const projectService = () => makeService({ id: 5, privileges: ['hosting.manage_containers', 'hosting.manage_proxy_routing'], server_accounts: [{ id: 11 }] })

  async function mountProject () {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper: VueWrapper = await mountKit(ContainersView, { props: { service: projectService(), variant: 'project' }, global: { plugins: [pinia] } })
    mounted.push(wrapper)
    await flushPromises()
    return wrapper
  }

  const services = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="containers-table"] tbody tr').map(row => row.findAll('td')[0]!.text())
  const header = (wrapper: VueWrapper, title: string) => wrapper.findAll('[data-testid="containers-table"] tr.custom-sort .custom-sort__item').find(cell => cell.text().includes(title))!

  it('lists a row per container with the state chip, the status and the ports', async () => {
    const { wrapper } = await mountContainers()

    expect(services(wrapper)).toEqual(['web', 'db', 'worker'])
    const first = wrapper.findAll('[data-testid="containers-table"] tbody tr')[0]!
    expect(first.find('.v-chip').text()).toBe('running')
    expect(first.text()).toContain('2 hours')
    expect(first.text()).not.toContain('Up 2 hours')
    expect(first.text()).toContain('8080')
  })

  it('sorts by the clicked Service header and flips the direction on the second click, and does not sort by State', async () => {
    const { wrapper } = await mountContainers()

    await header(wrapper, 'heading.hosting.containers.col.service').trigger('click')
    await flushPromises()
    expect(services(wrapper)).toEqual(['db', 'web', 'worker'])

    await header(wrapper, 'heading.hosting.containers.col.service').trigger('click')
    await flushPromises()
    expect(services(wrapper)).toEqual(['worker', 'web', 'db'])

    await header(wrapper, 'heading.hosting.containers.col.state').trigger('click')
    await flushPromises()
    expect(services(wrapper)).toEqual(['worker', 'web', 'db'])
  })

  it('sorts the table of one group without touching the table of another group, and keeps the sort through a header keypress', async () => {
    // The sort is view state per group (`sorts` by account id).
    const other: ContainerGroup = { account: { id: 12, username: 'other', domain: 'other.test' }, containers: [web, db, worker] }
    vi.mocked(listContainerGroups).mockResolvedValue([exampleGroup, other])
    const { wrapper } = await mountContainers()
    const tables = () => wrapper.findAll('[data-testid="containers-table"]')
    const servicesOf = (index: number) => tables()[index]!.findAll('tbody tr').map(row => row.findAll('td')[0]!.text())
    const serviceHeader = (index: number) => tables()[index]!.findAll('tr.custom-sort .custom-sort__item').find(cell => cell.text().includes('heading.hosting.containers.col.service'))!

    expect(tables()).toHaveLength(2)
    await serviceHeader(0).trigger('click')
    await flushPromises()
    expect(servicesOf(0)).toEqual(['db', 'web', 'worker'])
    expect(servicesOf(1)).toEqual(['web', 'db', 'worker'])

    await serviceHeader(1).trigger('keydown', { key: 'Enter' })
    await serviceHeader(1).trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(servicesOf(1)).toEqual(['worker', 'web', 'db'])
    expect(servicesOf(0)).toEqual(['db', 'web', 'worker'])
  })

  it('lists every container with no footer and no pagination', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...web, Service: `svc${index + 1}` }))
    vi.mocked(listContainerGroups).mockResolvedValue([{ ...exampleGroup, containers: many }])

    const { wrapper } = await mountContainers()

    expect(wrapper.findAll('[data-testid="containers-table"] tbody tr')).toHaveLength(12)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    expect(wrapper.find('.v-pagination').exists()).toBe(false)
  })

  it('enables the actions by the container state and runs the chosen one for its row', async () => {
    const { wrapper } = await mountContainers()

    const rows = wrapper.findAll('[data-testid="containers-table"] tbody tr')
    const exited = rows[1]!.findAll('td').at(-1)!.findAll('button')
    expect(exited[0]!.attributes('disabled')).toBeUndefined()
    expect(exited[1]!.attributes('disabled')).toBeDefined()
    await exited[0]!.trigger('click')
    await flushPromises()

    expect(serviceAction).toHaveBeenCalledWith(1, 11, 'db', 'start')
  })

  it('shows the empty text in the table of a group without containers, with no header', async () => {
    vi.mocked(listContainerGroups).mockResolvedValue([{ ...exampleGroup, containers: [] }])

    const { wrapper } = await mountContainers()

    expect(wrapper.get('[data-testid="containers-table"]').text()).toContain('No Containers Found')
    expect(wrapper.findAll('[data-testid="containers-table"] tbody tr .v-chip')).toHaveLength(0)
  })

  it('shows the project table with the rows of its group and the same sort', async () => {
    vi.mocked(listContainerGroups).mockResolvedValue([{ account: { id: 11, username: 'example', domain: 'example.com' }, containers: [web, db] }])

    const wrapper = await mountProject()

    expect(services(wrapper)).toEqual(['web', 'db'])
    await header(wrapper, 'heading.hosting.containers.col.service').trigger('click')
    await flushPromises()
    expect(services(wrapper)).toEqual(['db', 'web'])
  })

  it('shows the skeleton instead of the rows in the project table on the first load, and the empty text without a group', async () => {
    vi.mocked(listContainerGroups).mockReturnValue(new Promise(() => {}))
    const loading = await mountProject()
    expect(loading.findComponent(LogsTableSkeletonItem).exists()).toBe(true)
    expect(loading.findAll('[data-testid="containers-table"] tbody .v-chip')).toHaveLength(0)
    loading.unmount()
    mounted.splice(mounted.indexOf(loading), 1)

    vi.mocked(listContainerGroups).mockResolvedValue([])
    const empty = await mountProject()
    expect(empty.get('[data-testid="containers-table"]').text()).toContain('No Containers Found')
  })

  it('lays each container out as a card of labelled fields on a narrow screen, with the actions in the card', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountContainers()

    const rows = wrapper.findAll('[data-testid="containers-table"] tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.findAll('.mobile-table-item__header').length).toBeGreaterThan(0)
    expect(rows[0]!.text()).toContain('web')
    // Start/Stop, Restart and Logs (Public URLs needs the proxy routing privilege).
    expect(rows[0]!.findAll('button')).toHaveLength(3)
  })

  it('sorts by the Service label of a card on a narrow screen and flips the direction on the second click', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountContainers()
    const label = () => wrapper.findAll('[data-testid="containers-table"] tbody tr')[0]!.findAll('.mobile-table-item__header')[0]!
    const cardServices = () => wrapper.findAll('[data-testid="containers-table"] tbody tr').map(row => row.findAll('.mobile-table-item__value')[0]!.text())

    await label().trigger('click')
    await flushPromises()
    expect(cardServices()).toEqual(['db', 'web', 'worker'])

    await label().trigger('click')
    await flushPromises()
    expect(cardServices()).toEqual(['worker', 'web', 'db'])
  })
})
