import type { Device } from './account.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { fetchDevices } from './account.api'
import DevicesTable from './DevicesTable.vue'

vi.mock('./account.api', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetchDevices: vi.fn(),
}))

const devices: Device[] = [
  { ip_address: '10.0.0.1', browser: 'Chrome', device: 'Linux', last_login: '2026-10-20 10:00', current_device: false, session_id: 'session-1', device_id: 'device-1' },
  { ip_address: '10.0.0.2', browser: 'Firefox', device: 'Mac', last_login: '2026-10-19 10:00', current_device: true, session_id: null, device_id: 'device-2' },
  { ip_address: '10.0.0.3', browser: 'Safari', device: 'iPhone', last_login: '2026-10-18 10:00', current_device: false, session_id: 'session-3', device_id: null },
]

async function mountTable (width: number) {
  window.innerWidth = width
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(DevicesTable, { global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('DevicesTable row actions', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.mocked(fetchDevices).mockResolvedValue(devices)
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('renders Forget and Log out (aria-label and tooltip) of the desktop rows with their tooltips unchanged', async () => {
    const wrapper = await mountTable(1600)

    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.forget" data-testid="account-device-forget"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.device.forget</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.logout" data-testid="account-device-logout"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.device.logout</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.logout" data-testid="account-device-logout"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.device.logout</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('has no Forget on the current device row', async () => {
    const wrapper = await mountTable(1600)

    const currentRow = wrapper.findAll('tbody tr')[1]!
    expect(currentRow.text()).toContain('message.status.device.current')
    expect(currentRow.find('[data-testid="account-device-forget"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="account-device-forget"]')).toHaveLength(1)
    wrapper.unmount()
  })
})

// Characterization before the data table move: behavior only, no DOM or style asserts.
describe('DevicesTable behavior (kit-data-table-account-reseller)', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.mocked(fetchDevices).mockResolvedValue(devices)
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('sorts through the header and refetches', async () => {
    const wrapper = await mountTable(1600)
    expect(fetchDevices).toHaveBeenCalledTimes(1)

    await wrapper.get('tr.custom-sort .item--ip .custom-sort__item').trigger('click')
    await flushPromises()

    expect(fetchDevices).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('checks one row and all rows', async () => {
    const wrapper = await mountTable(1600)

    await wrapper.get('tbody tr').get('input[type=checkbox]').setValue(true)
    await flushPromises()
    expect((wrapper.vm as unknown as { checkedItems: unknown[] }).checkedItems).toHaveLength(1)

    // Select-all takes every row but the current device; the one without a device_id is taken (by name).
    await wrapper.get('tr.custom-sort input[type=checkbox]').setValue(true)
    await flushPromises()
    const checked = (wrapper.vm as unknown as { checkedItems: unknown[] }).checkedItems
    expect(checked).toHaveLength(2)
    expect(checked).not.toContain('device-2')
    wrapper.unmount()
  })

  it('keeps the checkbox of the current device row disabled and unselectable', async () => {
    const wrapper = await mountTable(1600)

    const rows = wrapper.findAll('tbody tr')
    expect(rows[1]!.get('input[type=checkbox]').attributes('disabled')).toBeDefined()
    expect(rows[0]!.get('input[type=checkbox]').attributes('disabled')).toBeUndefined()

    await rows[1]!.get('input[type=checkbox]').setValue(true)
    await flushPromises()
    expect((wrapper.vm as unknown as { checkedItems: unknown[] }).checkedItems).toEqual([])
    wrapper.unmount()
  })

  it('shows no-results for a search and emits clear-filters', async () => {
    const wrapper = await mountKit(DevicesTable, { props: { search: 'zzz' }, global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="account-devices-no-results"]').exists()).toBe(true)
    await wrapper.get('[data-testid="account-devices-no-results"] button').trigger('click')
    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the empty state for no devices', async () => {
    vi.mocked(fetchDevices).mockResolvedValue([])
    const wrapper = await mountTable(1600)

    expect(wrapper.find('[data-testid="account-devices-empty"]').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    wrapper.unmount()
  })

  it('pages through the footer and refetches', async () => {
    const many: Device[] = Array.from({ length: 12 }, (_, i) => ({ ...devices[0]!, ip_address: `10.0.0.${i}`, device_id: `d${i}` }))
    vi.mocked(fetchDevices).mockResolvedValue(many)
    const wrapper = await mountTable(1600)

    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
    wrapper.findComponent({ name: 'DataIteratorFooter' }).vm.$emit('update:page', 2)
    await flushPromises()

    expect(fetchDevices).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('names a row whose User-Agent the panel could not parse instead of printing nothing', async () => {
    vi.mocked(fetchDevices).mockResolvedValue([
      { ip_address: '10.0.0.4', browser: null, device: null, last_login: '2026-10-20 10:00', current_device: true, session_id: 'session-4', device_id: 'device-4' },
    ])
    const wrapper = await mountTable(1600)

    const row = wrapper.findAll('tbody tr')[0]!
    expect(row.text()).toContain('message.account.device.unknownBrowser')
    expect(row.text()).toContain('message.account.device.unknownDevice')
    wrapper.unmount()
  })

  it('names the unparsed device on the mobile card too', async () => {
    vi.mocked(fetchDevices).mockResolvedValue([
      { ip_address: '10.0.0.4', browser: null, device: null, last_login: '2026-10-20 10:00', current_device: true, session_id: 'session-4', device_id: 'device-4' },
    ])
    const wrapper = await mountTable(900)

    const card = wrapper.findAll('tbody tr')[0]!
    expect(card.text()).toContain('message.account.device.unknownBrowser')
    expect(card.text()).toContain('message.account.device.unknownDevice')
    wrapper.unmount()
  })

  it('renders the mobile card with the checkbox, the fields and a label that sorts', async () => {
    const wrapper = await mountTable(900)

    const card = wrapper.findAll('tbody tr')[0]!
    expect(card.find('.mobile-table-item').exists()).toBe(true)
    expect(card.find('input[type=checkbox]').exists()).toBe(true)
    expect(card.text()).toContain('table.header.ip')
    expect(card.text()).toContain('10.0.0.1')

    const label = wrapper.findAll('.mobile-table-item__header').find(item => item.text() === 'table.header.ip')!
    await label.trigger('click')
    await flushPromises()

    expect(fetchDevices).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
