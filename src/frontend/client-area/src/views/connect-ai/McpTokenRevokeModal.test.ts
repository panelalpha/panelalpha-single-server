import type * as Vuetify from 'vuetify'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as connectAiApi from '@/entities/mcp/mcp.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import McpTokenRevokeModal from './McpTokenRevokeModal.vue'

const smAndDown = ref(true)
vi.mock('vuetify', async importOriginal => ({ ...(await importOriginal<typeof Vuetify>()), useDisplay: () => ({ smAndDown }) }))

vi.mock('@/entities/mcp/mcp.api', () => ({
  revokeToken: vi.fn(),
}))

const TOKEN = { id: 7, name: 'CI', last_used_at: null, revoked_at: null, created_at: '2026-10-01T10:00:00.000000Z' }

type Exposed = { open: (token: typeof TOKEN) => void }

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(McpTokenRevokeModal, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
  ;(wrapper.vm as unknown as Exposed).open(TOKEN)
  await flushPromises()
}

function submitButton (): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-testid="connect-ai-revoke-submit"]')!
}

function confirmInput (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="connect-ai-confirm"] input')!
}

describe('McpTokenRevokeModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('disables Revoke until the checkbox is ticked, without the grey class', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(submitButton().disabled).toBe(true)
    expect(submitButton().classList.contains('disabled-gray')).toBe(false)
    expect(submitButton().classList.contains('revoke-btn')).toBe(true)

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

  it('revokes by id, emits the token and closes on success', async () => {
    vi.mocked(connectAiApi.revokeToken).mockResolvedValue(undefined)
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()

    expect(connectAiApi.revokeToken).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('token-revoked')).toEqual([[TOKEN]])
    expect(wrapper.getComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('disables Revoke while the request runs', async () => {
    let finish: () => void = () => {}
    vi.mocked(connectAiApi.revokeToken).mockImplementation(() => new Promise<void>(resolve => {
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

  it('alerts and stays open when the revoke fails', async () => {
    vi.mocked(connectAiApi.revokeToken).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.emitted('token-revoked')).toBeUndefined()
    expect(wrapper.getComponent({ name: 'VDialog' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('does not send the revoke when the handler runs without the confirmation', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    submitButton().click()
    await flushPromises()

    expect(connectAiApi.revokeToken).not.toHaveBeenCalled()
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
