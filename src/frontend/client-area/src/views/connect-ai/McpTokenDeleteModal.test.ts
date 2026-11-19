import type * as Vuetify from 'vuetify'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as connectAiApi from '@/entities/mcp/mcp.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import McpTokenDeleteModal from './McpTokenDeleteModal.vue'

const smAndDown = ref(true)
vi.mock('vuetify', async importOriginal => ({ ...(await importOriginal<typeof Vuetify>()), useDisplay: () => ({ smAndDown }) }))

vi.mock('@/entities/mcp/mcp.api', () => ({
  deleteToken: vi.fn(),
}))

const TOKEN = { id: 7, name: 'CI', last_used_at: null, revoked_at: null, created_at: '2026-10-01T10:00:00.000000Z' }

type Exposed = { open: (token: typeof TOKEN) => void }

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(McpTokenDeleteModal, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
  ;(wrapper.vm as unknown as Exposed).open(TOKEN)
  await flushPromises()
}

function submitButton (): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-testid="connect-ai-delete-submit"]')!
}

function confirmInput (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="connect-ai-confirm"] input')!
}

describe('McpTokenDeleteModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('disables Delete until the checkbox is ticked, without the grey class', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(submitButton().disabled).toBe(true)
    expect(submitButton().classList.contains('disabled-gray')).toBe(false)

    confirmInput().click()
    await flushPromises()
    expect(submitButton().disabled).toBe(false)
    wrapper.unmount()
  })

  it('starts every opening with the checkbox cleared', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    confirmInput().click()
    await flushPromises()
    expect(confirmInput().checked).toBe(true)

    document.querySelector<HTMLButtonElement>('.modal-close-button')!.click()
    await flushPromises()
    await openModal(wrapper)

    expect(confirmInput().checked).toBe(false)
    expect(submitButton().disabled).toBe(true)
    wrapper.unmount()
  })

  it('deletes by id, emits the token and closes on success', async () => {
    vi.mocked(connectAiApi.deleteToken).mockResolvedValue(undefined)
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()

    expect(connectAiApi.deleteToken).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('token-deleted')).toEqual([[TOKEN]])
    expect(wrapper.getComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('disables Delete while the request runs', async () => {
    let finish: () => void = () => {}
    vi.mocked(connectAiApi.deleteToken).mockImplementation(() => new Promise<void>(resolve => {
      finish = resolve
    }))
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()

    expect(submitButton().disabled).toBe(true)
    finish()
    await flushPromises()
    wrapper.unmount()
  })

  it('alerts and stays open when the DELETE fails', async () => {
    vi.mocked(connectAiApi.deleteToken).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.emitted('token-deleted')).toBeUndefined()
    expect(wrapper.getComponent({ name: 'VDialog' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('does not send the DELETE when the handler runs without the confirmation', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    submitButton().click()
    await flushPromises()

    expect(connectAiApi.deleteToken).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('holds overflow-y-hidden on <html> while open on a small screen and releases it on close', async () => {
    smAndDown.value = true
    const { wrapper } = await mountModal()
    expect(document.documentElement.classList.contains('overflow-y-hidden')).toBe(false)

    await openModal(wrapper)
    expect(document.documentElement.classList.contains('overflow-y-hidden')).toBe(true)

    document.querySelector<HTMLButtonElement>('.modal-close-button')!.click()
    await flushPromises()
    expect(document.documentElement.classList.contains('overflow-y-hidden')).toBe(false)
    wrapper.unmount()
  })
})
