import type { DnsRecordsResponse } from './dns.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import DataTable from '@/shared/ui/data-table/DataTable.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import { CANNOT_MANAGE_VIA_API } from './dns'
import { createRecord, deleteRecord, listRecords, listRecordTypes, listZones, toggleProxy, updateRecord } from './dns.api'
import DnsView from './DnsView.vue'

vi.mock('./dns.api', () => ({
  listZones: vi.fn(),
  listRecords: vi.fn(),
  listRecordTypes: vi.fn(),
  toggleProxy: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
}))

// Rows of the proxy column: a proxiable record that is off, a record that cannot be proxied, and a proxiable record that is on.
const proxyRecords = [
  { name: 'a.example.com', ttl: 1, type: 'A', content: '1.2.3.4', line: 1, proxiable: true, proxied: false },
  { name: 'b.example.com', ttl: 3600, type: 'TXT', content: 'v=spf1', line: 2, proxiable: false, proxied: false },
  { name: 'c.example.com', ttl: 3600, type: 'A', content: '5.6.7.8', line: 3, proxiable: true, proxied: true },
]

const zone = { id: 5, name: 'example.com' }

const records = [
  { name: 'a.example.com', ttl: 1, type: 'A', content: '1.2.3.4', line: 1 },
  { name: 'b.example.com', ttl: 3600, type: 'TXT', content: 'v=spf1', line: 2 },
]

function service (accounts = [{ id: 11, domain: 'example.com', diagnostic_mode: false }]) {
  return makeService({
    privileges: ['hosting.manage_dns'],
    dns_server_enabled: true,
    plan_settings: { dns_management_enabled: true },
    server_accounts: accounts,
  })
}

async function mountDns (hostingService = service()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(DnsView, { props: { service: hostingService }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

/** Waits for the dialog to mount its BasicModal: under a loaded full run it can land later than one `flushPromises`. */
async function modalShown (wrapper: Awaited<ReturnType<typeof mountDns>>['wrapper']) {
  await vi.waitFor(() => {
    expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
  })
}

describe('DnsView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listZones).mockResolvedValue([zone])
    vi.mocked(listRecords).mockResolvedValue({ data: records, meta: { allow_proxy: false } })
    vi.mocked(listRecordTypes).mockResolvedValue(['A', 'TXT'])
  })

  afterAll(() => {
    window.innerWidth = width
  })

  it('loads the zones, the records of the first zone and the record types, and lists the records with TTL 1 as Auto', async () => {
    const { wrapper } = await mountDns()

    expect(listZones).toHaveBeenCalledWith(1)
    expect(listRecords).toHaveBeenCalledWith(1, 5)
    expect(listRecordTypes).toHaveBeenCalledWith(1)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('a.example.com')
    expect(rows[0]!.text()).toContain('Auto')
    expect(rows[1]!.text()).toContain('3600')
    expect(wrapper.find('[data-testid="dns-add"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a record with the legacy markup', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountDns()

    expect(normalizeHtml(wrapper.findAll('tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.name</div><div class="mobile-table-item__value"><span class="bold p-3">a.example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.ttl</div><div class="mobile-table-item__value"><span class="bold p-3">Auto</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.type</div><div class="mobile-table-item__value"><span class="bold p-3">A</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.record</div><div class="mobile-table-item__value"><span class="bold p-3">1.2.3.4</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.dns.edit" data-testid="dns-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.dns.delete" data-testid="dns-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  // Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
  it('renders the Edit and Delete icons of a record row with their tooltips unchanged', async () => {
    const { wrapper } = await mountDns()

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.dns.edit" data-testid="dns-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.dns.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.dns.delete" data-testid="dns-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.dns.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.dns.edit" data-testid="dns-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.dns.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.dns.delete" data-testid="dns-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.dns.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('shows the empty state and asks for no records and no types when the service has no zones', async () => {
    vi.mocked(listZones).mockResolvedValue([])

    const { wrapper } = await mountDns()

    expect(listRecords).not.toHaveBeenCalled()
    expect(listRecordTypes).not.toHaveBeenCalled()
    expect(wrapper.find('.no-data').text()).toContain('message.emptyTable.dns.title')
    wrapper.unmount()
  })

  it('shows the cannot-be-managed alert and hides Add when the provider has no record types', async () => {
    vi.mocked(listRecordTypes).mockResolvedValue([])

    const { wrapper } = await mountDns()

    expect(wrapper.find('.app-message').text()).toContain(CANNOT_MANAGE_VIA_API)
    expect(wrapper.find('[data-testid="dns-add"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the skeleton and raises an alert when the zones cannot be loaded', async () => {
    vi.mocked(listZones).mockRejectedValue(new Error('Server Error'))

    const pinia = createPinia()
    setActivePinia(pinia)
    const alerts = useAlertsStore()
    const addAlert = vi.spyOn(alerts, 'addAlert')
    const wrapper = await mountKit(DnsView, { props: { service: service() }, global: { plugins: [pinia] } })
    await flushPromises()

    expect(wrapper.find('.data-table--loading').exists()).toBe(true)
    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    wrapper.unmount()
  })

  it('filters the rows by the search term and clears the search term with clear-filters', async () => {
    const { wrapper } = await mountDns()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'a.example')
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)

    wrapper.findComponent(DataTable).vm.$emit('clear-filters')
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  it('reloads only the records of the chosen zone on a zone change, without the record types (legacy reloadZoneRecords)', async () => {
    const other = { id: 6, name: 'other.example.com' }
    vi.mocked(listZones).mockResolvedValue([zone, other])

    const { wrapper } = await mountDns()
    expect(wrapper.find('[data-testid="dns-zone-select"]').exists()).toBe(true)

    wrapper.findComponent('[data-testid="dns-zone-select"]').vm.$emit('update:modelValue', other)
    await flushPromises()

    expect(listRecords).toHaveBeenCalledTimes(2)
    expect(listRecords).toHaveBeenLastCalledWith(1, 6)
    expect(listRecordTypes).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps the record types of the account when the zone changes before they arrive (D3: only the records ticket moves)', async () => {
    const other = { id: 6, name: 'other.example.com' }
    vi.mocked(listZones).mockResolvedValue([zone, other])
    let resolveTypes!: (value: string[]) => void
    vi.mocked(listRecordTypes).mockReturnValueOnce(new Promise(resolve => {
      resolveTypes = resolve
    }))

    const { wrapper } = await mountDns()
    wrapper.findComponent('[data-testid="dns-zone-select"]').vm.$emit('update:modelValue', other)
    await flushPromises()
    resolveTypes(['A', 'TXT'])
    await flushPromises()

    expect(listRecords).toHaveBeenLastCalledWith(1, 6)
    expect(wrapper.find('[data-testid="dns-add"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain(CANNOT_MANAGE_VIA_API)
    wrapper.unmount()
  })

  it('shows the account selector only for an internal DNS server with two or more accounts', async () => {
    const accounts = [
      { id: 11, domain: 'example.com', diagnostic_mode: false },
      { id: 12, domain: 'second.example.com', diagnostic_mode: false },
    ]

    const { wrapper: internal } = await mountDns({ ...service(accounts), dns_server_internal: true })
    expect(internal.findComponent(ActiveServerAccountSelector).exists()).toBe(true)
    internal.unmount()

    const { wrapper: external } = await mountDns({ ...service(accounts), dns_server_internal: false })
    expect(external.findComponent(ActiveServerAccountSelector).exists()).toBe(false)
    external.unmount()

    const { wrapper: single } = await mountDns({ ...service(accounts.slice(0, 1)), dns_server_internal: true })
    expect(single.findComponent(ActiveServerAccountSelector).exists()).toBe(false)
    single.unmount()
  })

  it('hides the zone select and the record table in diagnostic mode but keeps the filters', async () => {
    const { wrapper } = await mountDns(service([{ id: 11, domain: 'example.com', diagnostic_mode: true }]))

    expect(wrapper.find('[data-testid="dns-zone-select"]').exists()).toBe(false)
    expect(wrapper.findComponent(DataTable).exists()).toBe(false)
    expect(wrapper.findComponent(DataIteratorFilterControls).exists()).toBe(true)
    wrapper.unmount()
  })

  it('drops a late zones answer of the previous account instead of overwriting the zones of the new one', async () => {
    const accounts = [
      { id: 11, domain: 'example.com', diagnostic_mode: false },
      { id: 12, domain: 'second.example.com', diagnostic_mode: false },
    ]
    const secondZone = { id: 9, name: 'second.example.com' }
    const secondRecord = { name: 'c.second.example.com', ttl: 1, type: 'A', content: '5.6.7.8', line: 3 }
    let resolveFirst!: (value: Array<{ id: number, name: string }>) => void
    vi.mocked(listZones)
      .mockReturnValueOnce(new Promise(resolve => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce([secondZone])
    vi.mocked(listRecords).mockImplementation((_serviceId, zoneId) => Promise.resolve({
      data: zoneId === 9 ? [secondRecord] : records,
      meta: { allow_proxy: false },
    }))

    const { wrapper } = await mountDns({ ...service(accounts), dns_server_internal: true })
    wrapper.getComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', accounts[1])
    await flushPromises()
    resolveFirst([zone])
    await flushPromises()

    expect(listRecords).not.toHaveBeenCalledWith(1, 5)
    expect(listRecords).toHaveBeenLastCalledWith(1, 9)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('c.second.example.com')
    wrapper.unmount()
  })

  it('drops a late records answer of the previous account instead of overwriting the rows of the new one', async () => {
    const accounts = [
      { id: 11, domain: 'example.com', diagnostic_mode: false },
      { id: 12, domain: 'second.example.com', diagnostic_mode: false },
    ]
    const secondRecord = { name: 'c.second.example.com', ttl: 1, type: 'A', content: '5.6.7.8', line: 3 }
    let resolveFirst!: (value: DnsRecordsResponse) => void
    vi.mocked(listRecords)
      .mockReturnValueOnce(new Promise(resolve => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce({ data: [secondRecord], meta: { allow_proxy: false } })

    const { wrapper } = await mountDns({ ...service(accounts), dns_server_internal: true })
    wrapper.getComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', accounts[1])
    await flushPromises()
    resolveFirst({ data: records, meta: { allow_proxy: false } })
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('c.second.example.com')
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the proxy column only when the provider allows the proxy (legacy changeHeaders)', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })

    const { wrapper } = await mountDns()
    expect(wrapper.findComponent(DataTable).props('headers').map((header: { value: string }) => header.value)).toContain('proxied')
    expect(wrapper.find('[data-testid="dns-proxy-off"]').exists()).toBe(true)
    wrapper.unmount()

    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: false } })

    const { wrapper: without } = await mountDns()
    expect(without.findComponent(DataTable).props('headers').map((header: { value: string }) => header.value)).not.toContain('proxied')
    expect(without.find('[data-testid="dns-proxy-off"]').exists()).toBe(false)
    expect(without.find('[data-testid="dns-proxy-on"]').exists()).toBe(false)
    without.unmount()
  })

  it('shows the on state for a proxied record, the off state for a proxiable one and an empty cell for a record that cannot be proxied', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })

    const { wrapper } = await mountDns()
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.find('[data-testid="dns-proxy-off"]').exists()).toBe(true)
    expect(rows[0]!.find('[data-testid="dns-proxy-on"]').exists()).toBe(false)
    expect(rows[1]!.find('[data-testid="dns-proxy-off"]').exists()).toBe(false)
    expect(rows[1]!.find('[data-testid="dns-proxy-on"]').exists()).toBe(false)
    expect(rows[2]!.find('[data-testid="dns-proxy-on"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('names the icon buttons from their tooltip keys and keeps the text of Add on mobile (issue #23)', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })

    const { wrapper } = await mountDns()
    const rows = wrapper.findAll('tbody tr')
    expect(wrapper.get('[data-testid="dns-add"]').attributes('aria-label')).toBeUndefined()
    expect(rows[0]!.get('[data-testid="dns-proxy-off"]').attributes('aria-label')).toBe('button.click.enable')
    expect(rows[2]!.get('[data-testid="dns-proxy-on"]').attributes('aria-label')).toBe('button.click.disable')
    expect(rows[0]!.get('[data-testid="dns-row-edit"]').attributes('aria-label')).toBe('button.dns.edit')
    expect(rows[0]!.get('[data-testid="dns-row-delete"]').attributes('aria-label')).toBe('button.dns.delete')
    wrapper.unmount()

    const desktopWidth = window.innerWidth
    window.innerWidth = 500
    const mobile = await mountDns()
    expect(mobile.wrapper.get('[data-testid="dns-add"]').text()).toBe('button.dns.add')
    expect(mobile.wrapper.get('[data-testid="dns-add"]').attributes('aria-label')).toBeUndefined()
    mobile.wrapper.unmount()
    window.innerWidth = desktopWidth
  })

  it('opens the warning when the proxy is turned on and sends the PATCH on confirm, then shows the new state', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })
    vi.mocked(toggleProxy).mockResolvedValue(true)

    const { wrapper } = await mountDns()
    wrapper.find('[data-testid="dns-proxy-off"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    expect(toggleProxy).not.toHaveBeenCalled()
    const modal = wrapper.findComponent(BasicModal)
    expect(modal.exists()).toBe(true)
    expect(modal.props('title')).toBe('heading.hosting.dns.modal.proxy-warning.title')
    expect(modal.props('icon')).toBe('$alertwarning')
    expect(modal.props('color')).toBe('warning')

    modal.vm.$emit('button-click', 'proxy-enable')
    await flushPromises()

    expect(toggleProxy).toHaveBeenCalledWith(1, 5, 1)
    expect(wrapper.findAll('tbody tr')[0]!.find('[data-testid="dns-proxy-on"]').exists()).toBe(true)
    expect(wrapper.findAll('tbody tr')[0]!.find('[data-testid="dns-proxy-off"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes the warning on cancel without sending the PATCH', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })

    const { wrapper } = await mountDns()
    wrapper.find('[data-testid="dns-proxy-off"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'cancel')
    await flushPromises()

    expect(toggleProxy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('sends the PATCH at once when the proxy is turned off, with a spinner while it runs', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })
    let resolve!: (value: boolean) => void
    vi.mocked(toggleProxy).mockReturnValueOnce(new Promise(done => {
      resolve = done
    }))

    const { wrapper } = await mountDns()
    wrapper.findAll('tbody tr')[2]!.find('[data-testid="dns-proxy-on"]').trigger('click')
    await flushPromises()

    expect(toggleProxy).toHaveBeenCalledWith(1, 5, 3)
    expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')[2]!.find('.v-progress-circular').exists()).toBe(true)

    resolve(false)
    await flushPromises()

    expect(wrapper.findAll('tbody tr')[2]!.find('.v-progress-circular').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')[2]!.find('[data-testid="dns-proxy-off"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows an alert, keeps the proxy state and drops the spinner when the PATCH fails', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })
    vi.mocked(toggleProxy).mockRejectedValue(new Error('Server Error'))

    const { wrapper, alerts } = await mountDns()
    const addAlert = vi.spyOn(alerts, 'addAlert')
    wrapper.findAll('tbody tr')[2]!.find('[data-testid="dns-proxy-on"]').trigger('click')
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(wrapper.findAll('tbody tr')[2]!.find('.v-progress-circular').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')[2]!.find('[data-testid="dns-proxy-on"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

const addedRecord = { name: 'www.example.com', ttl: 14_400, type: 'A', content: '9.9.9.9', line: 3 }
const txtRecord = { name: 'txt.example.com', ttl: 3600, type: 'TXT', content: '"v=spf1"', line: 2, txtdata: '"v=spf1"' }
const editableRecords = [
  { name: 'a.example.com', ttl: 3600, type: 'A', content: '1.2.3.4', line: 1 },
  txtRecord,
]

/** The field component of the modal with the given legacy field name. */
function fieldOf (wrapper: Awaited<ReturnType<typeof mountDns>>['wrapper'], name: string) {
  const field = wrapper.findAllComponents(BasicModalField).find(component => component.props('field').name === name)
  expect(field, `field ${name}`).toBeDefined()
  return field!
}

function setField (wrapper: Awaited<ReturnType<typeof mountDns>>['wrapper'], name: string, value: unknown) {
  fieldOf(wrapper, name).vm.$emit('update:modelValue', value)
}

describe('DnsView record modals', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(listZones).mockResolvedValue([zone])
    vi.mocked(listRecords).mockResolvedValue({ data: editableRecords, meta: { allow_proxy: false } })
    vi.mocked(listRecordTypes).mockResolvedValue(['A', 'TXT', 'MX'])
  })

  // A failed assertion in a fake-timer test must not leave the fake timers to the next tests.
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens Add with the A start values and the address field shown', async () => {
    const { wrapper } = await mountDns()
    wrapper.get('[data-testid="dns-add"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    const modal = wrapper.findComponent(BasicModal)
    expect(modal.props('title')).toBe('heading.hosting.dns.modal.add.title')
    expect(modal.props('icon')).toBe('$plus')
    expect(fieldOf(wrapper, 'type').props('modelValue')).toBe('A')
    expect(fieldOf(wrapper, 'ttl').props('modelValue')).toBe('14400')
    expect(fieldOf(wrapper, 'address').props('field')).toMatchObject({ hidden: false })
    expect(fieldOf(wrapper, 'preference').props('field')).toMatchObject({ hidden: true })
    wrapper.unmount()
  })

  it('shows the preference and exchange fields when the type changes to MX in Add', async () => {
    const { wrapper } = await mountDns()
    wrapper.get('[data-testid="dns-add"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    setField(wrapper, 'type', 'MX')
    fieldOf(wrapper, 'type').vm.$emit('change', 'MX')
    await flushPromises()

    expect(fieldOf(wrapper, 'preference').props('field')).toMatchObject({ hidden: false })
    expect(fieldOf(wrapper, 'exchange').props('field')).toMatchObject({ hidden: false })
    expect(fieldOf(wrapper, 'address').props('field')).toMatchObject({ hidden: true })
    wrapper.unmount()
  })

  it('posts the whole form to the zone on Add, with null for the hidden fields', async () => {
    vi.mocked(createRecord).mockResolvedValue(undefined)
    const { wrapper } = await mountDns()
    wrapper.get('[data-testid="dns-add"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    setField(wrapper, 'name', 'www')
    setField(wrapper, 'address', '9.9.9.9')
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
    await flushPromises()

    expect(createRecord).toHaveBeenCalledWith(1, 5, expect.objectContaining({
      type: 'A',
      name: 'www',
      address: '9.9.9.9',
      ttl: '14400',
      txtdata: null,
      preference: null,
    }))
    wrapper.unmount()
  })

  it('does not submit Add with an empty name: the form rules stop it and the modal stays open', async () => {
    const { wrapper } = await mountDns()
    wrapper.get('[data-testid="dns-add"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    setField(wrapper, 'address', '9.9.9.9')
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
    await flushPromises()

    expect(createRecord).not.toHaveBeenCalled()
    expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
    wrapper.unmount()
  })

  it('on Add success shows the alert, reloads the records, highlights the new row for 1 s and closes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.mocked(createRecord).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDns()
    const addAlert = vi.spyOn(alerts, 'addAlert')
    vi.mocked(listRecords).mockResolvedValue({ data: [...editableRecords, addedRecord], meta: { allow_proxy: false } })

    wrapper.get('[data-testid="dns-add"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)
    setField(wrapper, 'name', ' www.example.com ')
    setField(wrapper, 'address', '9.9.9.9')
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith({ success: true, successMessage: 'notification.hosting.dns.add.success' })
    expect(listRecords).toHaveBeenCalledTimes(2)
    expect(wrapper.find('tbody tr.highlight').text()).toContain('www.example.com')

    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(wrapper.find('tbody tr.highlight').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sends one POST for a double click on Add while the form is validated and saved', async () => {
    vi.mocked(createRecord).mockResolvedValue(undefined)
    const { wrapper } = await mountDns()
    wrapper.get('[data-testid="dns-add"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    setField(wrapper, 'name', 'www')
    setField(wrapper, 'address', '9.9.9.9')
    const modal = wrapper.findComponent(BasicModal)
    modal.vm.$emit('button-click', 'add')
    modal.vm.$emit('button-click', 'add')
    await flushPromises()

    expect(createRecord).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('on Add failure shows the error alert and keeps the modal open', async () => {
    vi.mocked(createRecord).mockRejectedValue(new Error('Server Error'))
    const { wrapper, alerts } = await mountDns()
    const addAlert = vi.spyOn(alerts, 'addAlert')

    wrapper.get('[data-testid="dns-add"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)
    setField(wrapper, 'name', 'www')
    setField(wrapper, 'address', '9.9.9.9')
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'add')
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens Edit with the readonly type and PUTs the whole row to its line', async () => {
    vi.mocked(updateRecord).mockResolvedValue(undefined)
    const { wrapper } = await mountDns()
    wrapper.findAll('[data-testid="dns-row-edit"]')[0]!.trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    const modal = wrapper.findComponent(BasicModal)
    expect(modal.props('title')).toBe('heading.hosting.dns.modal.update.title')
    expect(modal.props('icon')).toBe('$edit')
    expect(fieldOf(wrapper, 'type').props('field')).toMatchObject({ readonly: true })

    setField(wrapper, 'address', '7.7.7.7')
    modal.vm.$emit('button-click', 'update')
    await flushPromises()

    expect(updateRecord).toHaveBeenCalledWith(1, 5, 1, expect.objectContaining({
      name: 'a.example.com',
      type: 'A',
      line: 1,
      address: '7.7.7.7',
    }))
    wrapper.unmount()
  })

  it('shows a TXT value without its quotes in Edit and keeps the table row as it was', async () => {
    vi.mocked(updateRecord).mockResolvedValue(undefined)
    const { wrapper } = await mountDns()
    wrapper.findAll('[data-testid="dns-row-edit"]')[1]!.trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    expect(fieldOf(wrapper, 'txtdata').props('modelValue')).toBe('v=spf1')
    expect(wrapper.findAll('tbody tr')[1]!.text()).toContain('"v=spf1"')

    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'update')
    await flushPromises()

    expect(updateRecord).toHaveBeenCalledWith(1, 5, 2, expect.objectContaining({ txtdata: 'v=spf1', line: 2 }))
    wrapper.unmount()
  })

  it('does not submit Edit of a record with the Auto TTL: the TTL rule fails (legacy quirk)', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: [{ name: 'auto.example.com', ttl: 1, type: 'A', content: '1.2.3.4', line: 4 }], meta: { allow_proxy: false } })
    const { wrapper } = await mountDns()
    wrapper.get('[data-testid="dns-row-edit"]').trigger('click')
    await flushPromises()
    await modalShown(wrapper)

    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'update')
    await flushPromises()

    expect(fieldOf(wrapper, 'ttl').props('modelValue')).toBe('Auto')
    expect(updateRecord).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('DnsView delete modal', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listZones).mockResolvedValue([zone])
    vi.mocked(listRecords).mockResolvedValue({ data: editableRecords, meta: { allow_proxy: false } })
    vi.mocked(listRecordTypes).mockResolvedValue(['A', 'TXT', 'MX'])
  })

  afterAll(() => {
    window.innerWidth = width
  })

  async function openDelete (wrapper: Awaited<ReturnType<typeof mountDns>>['wrapper'], index: number) {
    wrapper.findAll('[data-testid="dns-row-delete"]')[index]!.trigger('click')
    await flushPromises()
    await modalShown(wrapper)
  }

  it('opens the warning with the confirm checkbox, and its Delete button waits for the checkbox', async () => {
    const { wrapper } = await mountDns()
    await openDelete(wrapper, 0)

    const modal = wrapper.findComponent(BasicModal)
    expect(modal.props('title')).toBe('heading.hosting.dns.modal.delete.title')
    expect(modal.props('color')).toBe('error')
    expect(modal.props('confirmRequired')).toBe(true)
    expect(modal.props('confirmed')).toBe(false)

    setField(wrapper, 'confirm', true)
    await flushPromises()

    expect(wrapper.findComponent(BasicModal).props('confirmed')).toBe(true)
    wrapper.unmount()
  })

  it('sends nothing when Delete is clicked without the checkbox', async () => {
    const { wrapper } = await mountDns()
    await openDelete(wrapper, 0)

    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
    await flushPromises()

    expect(deleteRecord).not.toHaveBeenCalled()
    expect(wrapper.findComponent(BasicModal).exists()).toBe(true)
    wrapper.unmount()
  })

  it('deletes the record by its line, reloads the records, alerts and closes', async () => {
    vi.mocked(deleteRecord).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDns()
    const addAlert = vi.spyOn(alerts, 'addAlert')
    await openDelete(wrapper, 0)

    setField(wrapper, 'confirm', true)
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
    await flushPromises()

    expect(deleteRecord).toHaveBeenCalledWith(1, 5, '1')
    expect(listRecords).toHaveBeenCalledTimes(2)
    expect(addAlert).toHaveBeenCalledWith({ success: true, successMessage: 'notification.hosting.dns.delete.success' })
    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('deletes a record without a line by name and type, as legacy does', async () => {
    vi.mocked(deleteRecord).mockResolvedValue(undefined)
    vi.mocked(listRecords).mockResolvedValue({
      data: [{ name: 'nol.example.com', ttl: 3600, type: 'TXT', content: 'x' }],
      meta: { allow_proxy: false },
    })
    const { wrapper } = await mountDns()
    await openDelete(wrapper, 0)

    setField(wrapper, 'confirm', true)
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
    await flushPromises()

    expect(deleteRecord).toHaveBeenCalledWith(1, 5, 'nol.example.com?type=TXT')
    wrapper.unmount()
  })

  it('on failure shows the error alert and keeps the modal open', async () => {
    vi.mocked(deleteRecord).mockRejectedValue(new Error('Server Error'))
    const { wrapper, alerts } = await mountDns()
    const addAlert = vi.spyOn(alerts, 'addAlert')
    await openDelete(wrapper, 0)

    setField(wrapper, 'confirm', true)
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(listRecords).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('deletes the record of the row from the mobile Delete action, through the shared actions slot', async () => {
    window.innerWidth = 500
    vi.mocked(deleteRecord).mockResolvedValue(undefined)
    const { wrapper } = await mountDns()
    await openDelete(wrapper, 1)

    setField(wrapper, 'confirm', true)
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
    await flushPromises()

    expect(deleteRecord).toHaveBeenCalledWith(1, 5, '2')
    wrapper.unmount()
    window.innerWidth = 1600
  })

  it('opens Delete after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
    const { wrapper } = await mountDns()
    await openDelete(wrapper, 0)

    const overlay = expectOverlayBeforeCard('[data-testid="dns-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
    wrapper.unmount()
  })

  it('ignores an overlay click while the delete request runs (kit-dialog-hosting)', async () => {
    vi.mocked(deleteRecord).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountDns()
    await openDelete(wrapper, 0)
    setField(wrapper, 'confirm', true)
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'delete')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('persistent')).toBe(true)
    await clickOverlay(expectOverlayBeforeCard('[data-testid="dns-modal"]'))

    expect(openDialogs(wrapper)).toBe(1)
    wrapper.unmount()
  })
})

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listZones).mockResolvedValue([zone])
    vi.mocked(listRecords).mockResolvedValue({ data: records, meta: { allow_proxy: false } })
    vi.mocked(listRecordTypes).mockResolvedValue(['A', 'TXT'])
  })

  afterAll(() => {
    window.innerWidth = width
  })

  function names (wrapper: Awaited<ReturnType<typeof mountDns>>['wrapper']): string[] {
    return wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text())
  }

  it('sorts by the clicked header and flips the direction on the second click', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: records.toReversed(), meta: { allow_proxy: false } })
    const { wrapper } = await mountDns()

    await wrapper.get('tr.custom-sort .item--name .custom-sort__item').trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['a.example.com', 'b.example.com'])

    await wrapper.get('tr.custom-sort .item--name .custom-sort__item').trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['b.example.com', 'a.example.com'])
    wrapper.unmount()
  })

  it('pages the records by 8 and moves to the second page from the footer', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ name: `r${index + 1}.example.com`, ttl: 3600, type: 'A', content: '1.2.3.4', line: index + 1 }))
    vi.mocked(listRecords).mockResolvedValue({ data: many, meta: { allow_proxy: false } })
    const { wrapper } = await mountDns()

    expect(wrapper.findAll('tbody tr')).toHaveLength(8)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows no-results for a search without a match and brings the list back with Clear filters', async () => {
    const { wrapper } = await mountDns()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'zzz')
    await flushPromises()
    expect(wrapper.find('.no-results-container').exists()).toBe(true)
    expect(wrapper.find('.no-data').exists()).toBe(false)

    await wrapper.get('.no-results-container button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  it('renders the proxy cell through the item slot, and the name as a link', async () => {
    vi.mocked(listRecords).mockResolvedValue({ data: proxyRecords, meta: { allow_proxy: true } })
    const { wrapper } = await mountDns()

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.get('a').text()).toBe('a.example.com')
    expect(rows[0]!.find('[data-testid="dns-proxy-on"]').exists()).toBe(false)
    expect(rows[2]!.find('[data-testid="dns-proxy-on"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the skeleton while the records load and no rows', async () => {
    vi.mocked(listRecords).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountDns()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dns-row-edit"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows four labelled fields and the actions of each record in a card below 976 px', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountDns()

    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const cards = wrapper.findAll('tbody tr .mobile-table-item')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.findAll('.mobile-table-item__header').map(label => label.text())).toEqual([
      'table.header.name',
      'table.header.ttl',
      'table.header.type',
      'table.header.record',
      'table.header.actions',
    ])
    expect(cards[0]!.find('[data-testid="dns-row-edit"]').exists()).toBe(true)
    expect(cards[0]!.find('[data-testid="dns-row-delete"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
