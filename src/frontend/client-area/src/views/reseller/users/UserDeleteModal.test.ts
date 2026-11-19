import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import UserDeleteModal from './UserDeleteModal.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  deleteResellerUser: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const USER = { id: 4, name: 'Bob', email: 'bob@example.com', instances_count: 2 }

type Exposed = { open: (user: typeof USER) => void }

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(UserDeleteModal, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
  ;(wrapper.vm as unknown as Exposed).open(USER)
  await flushPromises()
}

function submitButton (): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-testid="reseller-user-delete-submit"]')!
}

function confirmInput (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="reseller-user-delete-confirm"] input')!
}

async function tick (): Promise<void> {
  await flushPromises()
}

describe('UserDeleteModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the email and keeps Delete disabled until the checkbox is ticked', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(document.body.textContent).toContain('heading.instance.advanced.users.modal.delete.message')
    expect(submitButton().disabled).toBe(true)

    confirmInput().click()
    await tick()
    expect(submitButton().disabled).toBe(false)
    wrapper.unmount()
  })

  it('deletes, emits the response and closes on success', async () => {
    vi.mocked(resellerApi.deleteResellerUser).mockResolvedValue({ id: 4 })
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await tick()
    submitButton().click()
    await tick()

    expect(resellerApi.deleteResellerUser).toHaveBeenCalledWith(4)
    expect(wrapper.emitted('user-deleted')).toEqual([[{ id: 4 }]])
    // jsdom never finishes the leave transition, so the DOM stays; the dialog's `v-model` is what closes.
    expect(wrapper.getComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('alerts and stays open when the DELETE fails', async () => {
    vi.mocked(resellerApi.deleteResellerUser).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)

    confirmInput().click()
    await tick()
    submitButton().click()
    await tick()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.emitted('user-deleted')).toBeUndefined()
    expect(document.querySelector('[data-testid="reseller-user-delete-modal"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('gives the close button an accessible name from button.close', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    const close = document.querySelector<HTMLButtonElement>('[data-testid="reseller-user-delete-close"]')!
    expect(close.getAttribute('aria-label')).toBe('button.close')
    wrapper.unmount()
  })

  it('hides the close button while saving', async () => {
    const pending = deferred<{ id: number }>()
    vi.mocked(resellerApi.deleteResellerUser).mockReturnValue(pending.promise)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    expect(document.querySelector('[data-testid="reseller-user-delete-close"]')).not.toBeNull()

    confirmInput().click()
    await tick()
    submitButton().click()
    await tick()
    expect(document.querySelector('[data-testid="reseller-user-delete-close"]')).toBeNull()

    pending.resolve({ id: 4 })
    await tick()
    wrapper.unmount()
  })

  it('starts every opening with the checkbox cleared (D2)', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    confirmInput().click()
    await tick()
    expect(confirmInput().checked).toBe(true)

    document.querySelector<HTMLButtonElement>('[data-testid="reseller-user-delete-close"]')!.click()
    await tick()
    await openModal(wrapper)

    expect(confirmInput().checked).toBe(false)
    expect(submitButton().disabled).toBe(true)
    wrapper.unmount()
  })
})
