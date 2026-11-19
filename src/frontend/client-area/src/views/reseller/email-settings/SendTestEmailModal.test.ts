import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as emailSettingsApi from './email-settings.api'
import SendTestEmailModal from './SendTestEmailModal.vue'

vi.mock('./email-settings.api', () => ({
  sendTestEmail: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const SETTINGS = {
  from_name: 'Acme',
  from_email: 'noreply@acme.test',
  copy_to: null,
  blind_copy_to: null,
  smtp_host: 'smtp.acme.test',
  smtp_port: 587,
  smtp_username: 'mailer',
  smtp_password: 'secret',
  smtp_ssl_type: 'tls',
}

type Exposed = { open: () => void }

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ user: { email: 'me@example.com' } } as never)
  const wrapper = await mountKit(SendTestEmailModal, { global: { plugins: [pinia] }, props: { settings: SETTINGS } })
  return { wrapper, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
  ;(wrapper.vm as unknown as Exposed).open()
  await flushPromises()
}

function byId (id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(id)}"]`)
}

function input (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="send-test-email-input"] input')!
}

function isOpen (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']): boolean {
  return wrapper.getComponent({ name: 'VDialog' }).props('modelValue') as boolean
}

describe('SendTestEmailModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('prefills the empty field with the session email', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(input().value).toBe('me@example.com')
    wrapper.unmount()
  })

  it('names the address field with its label key', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(input().getAttribute('aria-label')).toBe('reseller.emailSettings.sendTestEmailToAddress')
  })

  it('puts the label above the field in the kit LabeledField (GitLab #18)', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    const label = document.querySelector<HTMLElement>('[data-testid="send-test-email-modal"] .labeled-field__label')
    expect(label?.textContent).toBe('reseller.emailSettings.sendTestEmailToAddress')
    expect(label?.closest('.labeled-field')?.contains(input())).toBe(true)
    expect(document.querySelector('[data-testid="send-test-email-modal"] .v-row')).toBeNull()
    wrapper.unmount()
  })

  it('names the close button (button.close)', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(byId('send-test-email-close')!.getAttribute('aria-label')).toBe('button.close')
    wrapper.unmount()
  })

  it('posts the current settings with to_email and closes on success (M1)', async () => {
    vi.mocked(emailSettingsApi.sendTestEmail).mockResolvedValue()
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)

    byId('send-test-email-submit')!.click()
    await flushPromises()

    expect(emailSettingsApi.sendTestEmail).toHaveBeenCalledWith(SETTINGS, 'me@example.com')
    expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'message.alertManager.success' })
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('sends an edited address and keeps it on reopening instead of prefilling again', async () => {
    vi.mocked(emailSettingsApi.sendTestEmail).mockResolvedValue()
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    input().value = 'other@example.com'
    input().dispatchEvent(new Event('input'))
    await flushPromises()
    byId('send-test-email-submit')!.click()
    await flushPromises()
    expect(vi.mocked(emailSettingsApi.sendTestEmail).mock.calls[0]![1]).toBe('other@example.com')

    await openModal(wrapper)
    expect(isOpen(wrapper)).toBe(true)
    expect(input().value).toBe('other@example.com')
    wrapper.unmount()
  })

  it('alerts and stays open when the POST fails', async () => {
    vi.mocked(emailSettingsApi.sendTestEmail).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)

    byId('send-test-email-submit')!.click()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
    expect(isOpen(wrapper)).toBe(true)
    expect(byId('send-test-email-close')).not.toBeNull()
    wrapper.unmount()
  })

  it('is persistent, hides the X and ignores Cancel while sending (M2)', async () => {
    const pending = deferred<void>()
    vi.mocked(emailSettingsApi.sendTestEmail).mockReturnValue(pending.promise)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    expect(wrapper.getComponent({ name: 'VDialog' }).props('persistent')).toBe(false)
    expect(byId('send-test-email-close')).not.toBeNull()

    byId('send-test-email-submit')!.click()
    await flushPromises()

    expect(wrapper.getComponent({ name: 'VDialog' }).props('persistent')).toBe(true)
    expect(byId('send-test-email-close')).toBeNull()
    byId('send-test-email-cancel')!.click()
    await flushPromises()
    expect(isOpen(wrapper)).toBe(true)

    pending.resolve()
    await flushPromises()
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('closes with Cancel when idle', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    byId('send-test-email-cancel')!.click()
    await flushPromises()

    expect(isOpen(wrapper)).toBe(false)
    expect(emailSettingsApi.sendTestEmail).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
