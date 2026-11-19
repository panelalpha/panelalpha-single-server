import type { Device } from './account.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { fetchDevices } from './account.api'
import DevicesTable from './DevicesTable.vue'

vi.mock('./account.api', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetchDevices: vi.fn(),
}))

// One row with a device id and a session, so the row has the Forget button.
const devices: Device[] = [
  { ip_address: '10.0.0.1', browser: 'Chrome', device: 'Linux', last_login: '2026-10-20 10:00', current_device: false, session_id: 'session-1', device_id: 'device-1' },
]

async function mountTable () {
  window.innerWidth = 1600
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(DevicesTable, { global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

async function openForget (wrapper: Awaited<ReturnType<typeof mountTable>>): Promise<void> {
  await wrapper.get('[data-testid="account-device-forget"]').trigger('click')
  await flushPromises()
}

function card (): HTMLElement {
  return document.body.querySelector<HTMLElement>('.v-overlay--active [data-testid="account-device-modal"]')!
}

function isOpen (wrapper: Awaited<ReturnType<typeof mountTable>>): boolean {
  return wrapper.getComponent({ name: 'VDialog' }).props('modelValue') as boolean
}

// The dialog shell of the device actions (the legacy `div.card-overlay` before the card, the legacy transition).
describe('DevicesTable dialog', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.mocked(fetchDevices).mockResolvedValue(devices)
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('opens Forget after the legacy overlay, with the legacy transition, and closes it with the X', async () => {
    const wrapper = await mountTable()
    await openForget(wrapper)

    expect(isOpen(wrapper)).toBe(true)
    expect(card().previousElementSibling!.classList.contains('card-overlay')).toBe(true)
    expect(wrapper.getComponent({ name: 'VDialog' }).props('transition')).toBe('custom-dialog-transition')
    card().querySelector<HTMLElement>('.v-card-title button')!.click()
    await flushPromises()

    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('closes Forget on a click on the overlay', async () => {
    const wrapper = await mountTable()
    await openForget(wrapper)

    ;(card().previousElementSibling as HTMLElement).click()
    await flushPromises()

    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })
})
