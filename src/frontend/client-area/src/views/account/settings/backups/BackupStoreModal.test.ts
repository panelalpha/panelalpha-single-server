import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { controlAfterLabel, formLabels, labelByText } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import BackupStoreModal from './BackupStoreModal.vue'
import * as api from './free-backups.api'

vi.mock('./free-backups.api', () => ({
  getFreeBackups: vi.fn(),
  updateFreeBackups: vi.fn(),
  updateFreeBackupStore: vi.fn(),
}))

const STORE = { id: 1, name: 'S', driver: 's3', location: 'bucket' }

async function mountModal (props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(BackupStoreModal, {
    global: { plugins: [pinia] },
    props: { modelValue: true, drivers: ['local', 's3', 'sftp'], defaultLocalLocation: '/opt/b', ...props },
  })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

function q<T extends HTMLElement = HTMLElement> (selector: string): T | null {
  return document.querySelector<T>(selector)
}

async function type (selector: string, value: string) {
  const field = q<HTMLInputElement>(selector)!
  field.value = value
  field.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function submit () {
  q('.store-modal-submit')!.click()
  await flushPromises()
}

describe('BackupStoreModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('opens on local with the default location and the Configure title', async () => {
    const { wrapper } = await mountModal()

    expect(q('.backup-store-modal.basic-modal')).not.toBeNull()
    expect(q('.store-modal-submit')!.textContent).toContain('settings.backups.configureStore')
    expect(q<HTMLInputElement>('.store-field-location input')!.value).toBe('/opt/b')
    expect(q('.store-modal-close')).not.toBeNull()
    wrapper.unmount()
  })

  it('opens on the current store with the Change title and its location, secrets empty', async () => {
    const { wrapper } = await mountModal({ currentStore: STORE })

    expect(q('.store-modal-submit')!.textContent).toContain('settings.backups.changeStore')
    expect(q<HTMLInputElement>('.store-field-location input')!.value).toBe('bucket')
    expect(q<HTMLInputElement>('.store-field-secret_access_key input')!.value).toBe('')
    wrapper.unmount()
  })

  it('changing the driver resets the fields', async () => {
    const { wrapper } = await mountModal({ currentStore: STORE })
    await type('.store-field-region input', 'eu-west-1')
    expect(q<HTMLInputElement>('.store-field-region input')!.value).toBe('eu-west-1')

    const select = wrapper.findComponent({ name: 'VSelect' })
    select.vm.$emit('update:modelValue', 'sftp')
    await flushPromises()

    expect(q('.store-field-region')).toBeNull()
    expect(q<HTMLInputElement>('.store-field-port input')!.value).toBe('22')
    expect(q<HTMLInputElement>('.store-field-location input')!.value).toBe('')
    expect(q('.store-field-private_key textarea')).not.toBeNull()
    wrapper.unmount()
  })

  it('does not send while a required field is empty', async () => {
    const { wrapper } = await mountModal()
    await type('.store-field-location input', '')
    await submit()

    expect(api.updateFreeBackupStore).not.toHaveBeenCalled()
    expect(q('.backup-store-modal')!.textContent).toContain('settings.backups.required')
    wrapper.unmount()
  })

  it('shows a 422 in the modal without the field-name prefix (ID-48) and keeps it open', async () => {
    vi.mocked(api.updateFreeBackupStore).mockRejectedValue({
      response: { status: 422, data: { errors: { location: ['Bad path.'], driver: ['Nope.'] } } },
    })
    const { wrapper, alerts } = await mountModal()
    await submit()

    expect(q('.store-modal-error')!.textContent).toContain('Bad path. Nope.')
    expect(alerts.activeAlerts).toHaveLength(0)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('saved')).toBeUndefined()
    wrapper.unmount()
  })

  it('toasts any other failure', async () => {
    vi.mocked(api.updateFreeBackupStore).mockRejectedValue({ response: { status: 500, data: { message: 'Engine down.' } } })
    const { wrapper, alerts } = await mountModal()
    await submit()

    expect(q('.store-modal-error')).toBeNull()
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Engine down.' })
    wrapper.unmount()
  })

  it('sends the payload, emits saved, toasts and closes on success', async () => {
    const saved = { store: { id: 2, name: 'L', driver: 'local', location: '/opt/b' } }
    vi.mocked(api.updateFreeBackupStore).mockResolvedValue(saved)
    const { wrapper, alerts } = await mountModal()
    await submit()

    expect(api.updateFreeBackupStore).toHaveBeenCalledWith({ driver: 'local', location: '/opt/b' })
    expect(wrapper.emitted('saved')![0]).toEqual([saved])
    expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'settings.backups.storeSaved' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    wrapper.unmount()
  })

  it('says a previous store the Engine would not delete stays on the server', async () => {
    const response = {
      store: { id: 2, name: 'L', driver: 'local', location: '/opt/b' },
      store_selected: true,
      store_created: true,
      defaults: { auto_enable: true, frequency: 'daily', hour: 3, day_of_week: null, day_of_month: null, keep_last: 7 },
      cleanup: { id: 1, container: 'kept', reason: 'error' },
    }
    vi.mocked(api.updateFreeBackupStore).mockResolvedValue(response)
    const { wrapper, alerts } = await mountModal()
    await submit()

    expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'settings.backups.storeSavedKept' })
    wrapper.unmount()
  })

  it('says a previous store a schedule still uses stays on the server', async () => {
    vi.mocked(api.updateFreeBackupStore).mockResolvedValue({
      store: { id: 2, name: 'L', driver: 'local', location: '/opt/b' },
      store_selected: true,
      store_created: true,
      defaults: { auto_enable: true, frequency: 'daily', hour: 3, day_of_week: null, day_of_month: null, keep_last: 7 },
      cleanup: { id: 1, container: 'kept', reason: 'in_use' },
    })
    const { wrapper, alerts } = await mountModal()
    await submit()

    expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'settings.backups.storeSavedKeptInUse' })
    wrapper.unmount()
  })

  it('clears the values when closed and starts fresh on reopening', async () => {
    const { wrapper } = await mountModal({ currentStore: STORE })
    await type('.store-field-secret_access_key input', 'secret')

    q('.store-modal-cancel')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(q<HTMLInputElement>('.store-field-secret_access_key input')!.value).toBe('')
    wrapper.unmount()
  })

  it('clears the values when the dialog itself closes (Esc, scrim)', async () => {
    const { wrapper } = await mountModal({ currentStore: STORE })
    await type('.store-field-secret_access_key input', 'secret')
    const vm = wrapper.vm as unknown as { values: Record<string, unknown> }
    expect(vm.values.secret_access_key).toBe('secret')

    wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    expect(vm.values).toEqual({})
    wrapper.unmount()
  })
})

// Characterization of the DOM: written on the code with a raw `v-switch`, kept unchanged after it moved to `AppSwitch`.
describe('BackupStoreModal switch DOM', () => {
  const dom = () => {
    const root = q('.store-field-use_path_style_endpoint')!
    return {
      html: normalizeHtml(root.outerHTML).replace(/ id="switch-v-\d+"/g, ''),
      scoped: root.getAttributeNames().some(name => name.startsWith('data-v-')),
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('keeps the DOM of the path-style switch in the S3 form', async () => {
    const { wrapper } = await mountModal({ currentStore: STORE })
    const { html, scoped } = dom()
    expect(html).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--inset v-switch--size-default mt-4 store-field store-field-use_path_style_endpoint"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" aria-label="settings.backups.fields.pathStyle" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div><label class="v-label v-label--clickable" for="switch-v-19">settings.backups.fields.pathStyle</label></div></div></div>"`)
    expect(scoped).toBe(true)
    wrapper.unmount()
  })

  it('keeps the DOM of the path-style switch while saving', async () => {
    vi.mocked(api.updateFreeBackupStore).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountModal({ currentStore: STORE })
    await type('.store-field-secret_access_key input', 'secret')
    await submit()
    expect(dom().html).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--inset v-switch--size-default mt-4 store-field store-field-use_path_style_endpoint"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" aria-label="settings.backups.fields.pathStyle" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div><label class="v-label v-label--clickable" for="switch-v-19">settings.backups.fields.pathStyle</label></div></div></div>"`)
    wrapper.unmount()
  })
})

describe('BackupStoreModal labels (kit-form-fields)', () => {
  it('puts the driver label and each field label right above its control (kit-form-fields)', async () => {
    const { wrapper } = await mountModal()
    const root = document.body
    const driver = labelByText(root, 'settings.backups.driver')
    expect(driver).not.toBeNull()
    expect(controlAfterLabel(root, driver!, '.store-driver')).not.toBeNull()

    const others = formLabels(root).filter(label => label !== driver)
    expect(others.length).toBeGreaterThan(0)
    for (const label of others) {
      expect(controlAfterLabel(root, label, '.store-field')).not.toBeNull()
    }
    wrapper.unmount()
  })
})
