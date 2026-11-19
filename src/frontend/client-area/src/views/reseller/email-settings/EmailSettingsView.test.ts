import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { controlAfterLabel, formLabels } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import { EMPTY_EMAIL_SETTINGS } from './email-settings'
import * as emailSettingsApi from './email-settings.api'
import EmailSettingsView from './EmailSettingsView.vue'

vi.mock('./email-settings.api', () => ({
  getEmailSettings: vi.fn(),
  updateEmailSettings: vi.fn(),
  testEmailConnection: vi.fn(),
  sendTestEmail: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const SETTINGS = {
  from_name: 'Acme',
  from_email: 'noreply@acme.test',
  copy_to: 'copy@acme.test',
  blind_copy_to: 'bcc@acme.test',
  smtp_host: 'smtp.acme.test',
  smtp_port: 587,
  smtp_username: 'mailer',
  smtp_password: 'secret',
  smtp_ssl_type: 'tls',
}

async function mountView () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(EmailSettingsView, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

describe('EmailSettingsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the title and one skeleton per field while the settings load', async () => {
    const pending = deferred<typeof SETTINGS>()
    vi.mocked(emailSettingsApi.getEmailSettings).mockReturnValue(pending.promise)
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="reseller-email-settings-title"]').text()).toBe('heading.reseller.page.emailSettings')
    expect(wrapper.findAll('.v-skeleton-loader')).toHaveLength(9)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.findAll('label')).toHaveLength(9)
  })

  it('shows the nine fields with the values from the response, the password masked', async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    // Eight text inputs plus the select's own input.
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(9 + 1)

    const values = inputs.slice(0, 8).map(input => (input.element as HTMLInputElement).value)
    expect(values).toEqual(['Acme', 'noreply@acme.test', 'copy@acme.test', 'bcc@acme.test', 'smtp.acme.test', '587', 'mailer', 'secret'])
    expect(inputs[7]!.attributes('type')).toBe('password')
    expect(inputs.filter(input => input.attributes('type') === 'password')).toHaveLength(1)
    expect(wrapper.find('.v-select .v-select__selection').text()).toBe('TLS')
  })

  it('names every field with its label key', async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
    const { wrapper } = await mountView()
    await flushPromises()

    // The select renders a hidden input without a name, so only named inputs count.
    const names = wrapper.findAll('input').map(input => input.attributes('aria-label')).filter(name => name !== undefined)
    expect(names).toEqual([
      'reseller.emailSettings.fromName',
      'reseller.emailSettings.fromEmail',
      'reseller.emailSettings.copyTo',
      'reseller.emailSettings.blindCopyTo',
      'reseller.emailSettings.smtpHost',
      'reseller.emailSettings.smtpPort',
      'reseller.emailSettings.smtpUsername',
      'reseller.emailSettings.smtpPassword',
      'reseller.emailSettings.smtpSslType',
    ])
  })

  it('titles the server section with the fallback while the key is missing', async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('.email-settings__configuration-container h6').text()).toBe('Mail Server Configuration')
  })

  it('renders the three buttons', async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.findAll('.email-settings__configuration-action .v-btn').map(button => button.text())).toEqual([
      'button.testConnection',
      'button.sendTestEmail',
    ])
    expect(wrapper.findAll('.v-btn').map(button => button.text())).toContain('button.saveChanges')
  })

  it('keeps the select empty for an empty smtp_ssl_type', async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue({ ...SETTINGS, smtp_ssl_type: '' })
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('.v-select .v-select__selection').exists()).toBe(false)
  })

  it('alerts with the error and leaves the fields empty when the GET fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(emailSettingsApi.getEmailSettings).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountView()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(9)
    expect(inputs.every(input => (input.element as HTMLInputElement).value === '')).toBe(true)
  })

  function findButton (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], text: string) {
    return wrapper.findAll('.v-btn').find(button => button.text() === text)!
  }

  describe('Save changes', () => {
    it('sends the current state after a field edit, shows loading and then the success alert', async () => {
      vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
      const pending = deferred<void>()
      vi.mocked(emailSettingsApi.updateEmailSettings).mockReturnValue(pending.promise)
      const { wrapper, alerts } = await mountView()
      await flushPromises()

      await wrapper.findAll('input')[0]!.setValue('Edited')
      await findButton(wrapper, 'button.saveChanges').trigger('click')

      expect(emailSettingsApi.updateEmailSettings).toHaveBeenCalledTimes(1)
      expect(vi.mocked(emailSettingsApi.updateEmailSettings).mock.calls[0]![0]).toMatchObject({ ...SETTINGS, from_name: 'Edited' })
      expect(findButton(wrapper, 'button.saveChanges').classes()).toContain('v-btn--loading')

      pending.resolve()
      await flushPromises()

      expect(findButton(wrapper, 'button.saveChanges').classes()).not.toContain('v-btn--loading')
      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'message.alertManager.success' })
      expect(emailSettingsApi.getEmailSettings).toHaveBeenCalledTimes(1)
    })

    it('shows an error alert when the PUT fails', async () => {
      vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
      vi.mocked(emailSettingsApi.updateEmailSettings).mockRejectedValue(new Error('nope'))
      const { wrapper, alerts } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
      expect(alerts.activeAlerts[0]!.errorMessage).toBeTruthy()
      expect(findButton(wrapper, 'button.saveChanges').classes()).not.toContain('v-btn--loading')
    })

    it('sends an untouched empty smtp_ssl_type as is and a picked option as its value', async () => {
      vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue({ ...SETTINGS, smtp_ssl_type: '' })
      vi.mocked(emailSettingsApi.updateEmailSettings).mockResolvedValue()
      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()
      expect(vi.mocked(emailSettingsApi.updateEmailSettings).mock.calls[0]![0]).toMatchObject({ smtp_ssl_type: '' })

      wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'ssl')
      await flushPromises()
      await findButton(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()
      expect(vi.mocked(emailSettingsApi.updateEmailSettings).mock.calls[1]![0]).toMatchObject({ smtp_ssl_type: 'ssl' })
    })

    // Deferred: legacy keeps the form editable after a failed GET,
    // so Save sends nine empty fields. Pin it here; a future guard is a deliberate change.
    it('saves the empty form after a failed GET, as legacy (Charge 4, deferred)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(emailSettingsApi.getEmailSettings).mockRejectedValue(new Error('boom'))
      vi.mocked(emailSettingsApi.updateEmailSettings).mockResolvedValue()
      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(emailSettingsApi.updateEmailSettings).toHaveBeenCalledTimes(1)
      expect(vi.mocked(emailSettingsApi.updateEmailSettings).mock.calls[0]![0]).toEqual(EMPTY_EMAIL_SETTINGS)
    })
  })

  describe('Send test email', () => {
    it('opens the modal and sends the current form state', async () => {
      vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
      vi.mocked(emailSettingsApi.sendTestEmail).mockResolvedValue()
      const { wrapper } = await mountView()
      await flushPromises()
      const dialog = wrapper.getComponent({ name: 'VDialog' })
      expect(dialog.props('modelValue')).toBe(false)

      await wrapper.findAll('input')[0]!.setValue('Edited')
      await findButton(wrapper, 'button.sendTestEmail').trigger('click')
      await flushPromises()
      expect(dialog.props('modelValue')).toBe(true)

      document.querySelector<HTMLButtonElement>('[data-testid="send-test-email-submit"]')!.click()
      await flushPromises()

      expect(vi.mocked(emailSettingsApi.sendTestEmail).mock.calls[0]![0]).toMatchObject({ ...SETTINGS, from_name: 'Edited' })
    })
  })

  describe('Test connection', () => {
    it('sends the current state, shows loading and a success alert', async () => {
      vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
      const pending = deferred<{ success: boolean }>()
      vi.mocked(emailSettingsApi.testEmailConnection).mockReturnValue(pending.promise)
      const { wrapper, alerts } = await mountView()
      await flushPromises()

      await wrapper.findAll('input')[4]!.setValue('smtp.other.test')
      await findButton(wrapper, 'button.testConnection').trigger('click')

      expect(vi.mocked(emailSettingsApi.testEmailConnection).mock.calls[0]![0]).toMatchObject({ ...SETTINGS, smtp_host: 'smtp.other.test' })
      expect(findButton(wrapper, 'button.testConnection').classes()).toContain('v-btn--loading')
      // The actions do not block each other.
      expect(findButton(wrapper, 'button.saveChanges').classes()).not.toContain('v-btn--loading')

      pending.resolve({ success: true })
      await flushPromises()

      expect(findButton(wrapper, 'button.testConnection').classes()).not.toContain('v-btn--loading')
      expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'message.alertManager.success' })
    })

    it('shows an error alert with the server message for HTTP 200 with success false', async () => {
      vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
      vi.mocked(emailSettingsApi.testEmailConnection).mockResolvedValue({ success: false, message: 'Auth failed' })
      const { wrapper, alerts } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'button.testConnection').trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Auth failed' })
    })

    it('shows an error alert when the request throws', async () => {
      vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
      vi.mocked(emailSettingsApi.testEmailConnection).mockRejectedValue(new Error('down'))
      const { wrapper, alerts } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'button.testConnection').trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
      expect(findButton(wrapper, 'button.testConnection').classes()).not.toContain('v-btn--loading')
    })
  })
})

describe('EmailSettingsView labels (kit-form-fields)', () => {
  it('puts each label right above the field it names (kit-form-fields)', async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(SETTINGS)
    const { wrapper } = await mountView()
    await flushPromises()
    const root = wrapper.element.parentElement ?? wrapper.element

    const labels = formLabels(root)
    expect(labels).toHaveLength(9)
    for (const label of labels) {
      const text = (label.textContent ?? '').trim()
      const control = controlAfterLabel(root, label, '.v-input')
      expect(control).not.toBeNull()
      expect(control!.querySelector('input[aria-label]')?.getAttribute('aria-label')).toBe(text)
    }
  })
})
