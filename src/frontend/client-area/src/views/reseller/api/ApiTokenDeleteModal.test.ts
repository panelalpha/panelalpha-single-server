import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import ApiTokenDeleteModal from './ApiTokenDeleteModal.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  deleteResellerApiToken: vi.fn(),
}))

const TOKEN = { id: 7, name: 'CI', last_used_at: null, created_at: '2026-10-01T10:00:00.000000Z' }

type Exposed = { open: (token: typeof TOKEN) => void }

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(ApiTokenDeleteModal, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
  ;(wrapper.vm as unknown as Exposed).open(TOKEN)
  await flushPromises()
}

function submitButton (): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-delete-submit"]')!
}

function confirmInput (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="reseller-api-delete-confirm"] input')!
}

describe('ApiTokenDeleteModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('greys Delete out until the checkbox is ticked, without disabling it', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(submitButton().classList.contains('disabled-gray')).toBe(true)
    expect(submitButton().disabled).toBe(false)

    confirmInput().click()
    await flushPromises()
    expect(submitButton().classList.contains('disabled-gray')).toBe(false)
    wrapper.unmount()
  })

  it('starts every opening with the checkbox cleared', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    confirmInput().click()
    await flushPromises()
    expect(confirmInput().checked).toBe(true)

    document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-delete-close"]')!.click()
    await flushPromises()
    await openModal(wrapper)

    expect(confirmInput().checked).toBe(false)
    expect(submitButton().classList.contains('disabled-gray')).toBe(true)
    wrapper.unmount()
  })

  it('deletes by id, emits the response and closes on success', async () => {
    vi.mocked(resellerApi.deleteResellerApiToken).mockResolvedValue({ id: 7 })
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()

    expect(resellerApi.deleteResellerApiToken).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('api-token-deleted')).toEqual([[{ id: 7 }]])
    // jsdom never finishes the leave transition, so the DOM stays; the dialog's `v-model` is what closes.
    expect(wrapper.getComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('alerts and stays open when the DELETE fails', async () => {
    vi.mocked(resellerApi.deleteResellerApiToken).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.emitted('api-token-deleted')).toBeUndefined()
    expect(wrapper.getComponent({ name: 'VDialog' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('gives the close button an accessible name from button.close', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    const close = document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-delete-close"]')!
    expect(close.getAttribute('aria-label')).toBe('button.close')
    wrapper.unmount()
  })

  it('locks the close button with a class while the DELETE runs (legacy :9)', async () => {
    const pending = deferred<{ id: number }>()
    vi.mocked(resellerApi.deleteResellerApiToken).mockReturnValue(pending.promise)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    const close = (): HTMLElement => document.querySelector<HTMLElement>('[data-testid="reseller-api-delete-close"]')!
    expect(close().classList.contains('reseller-api-close--locked')).toBe(false)

    confirmInput().click()
    await flushPromises()
    submitButton().click()
    await flushPromises()
    expect(close().classList.contains('reseller-api-close--locked')).toBe(true)

    pending.resolve({ id: TOKEN.id })
    await flushPromises()
    wrapper.unmount()
  })

  it('does not send the DELETE when the handler runs without the confirmation (D5)', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    // jsdom has no `pointer-events` hit testing, so this is the keyboard path (Tab + Enter/Space) the class cannot stop.
    submitButton().click()
    await flushPromises()

    expect(resellerApi.deleteResellerApiToken).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
