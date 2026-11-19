import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { i18next } from '@/app/i18n'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { type ErrorReport, reportError, resetErrorReporting, setErrorReporter } from '@/shared/errors/report-error'
import AlertManager from '@/shared/ui/alerts/AlertManager.vue'
import { mountKit } from '@/test/mount-kit'
import { CHUNK_ERROR_ALERT_DEFAULT, CHUNK_ERROR_ALERT_KEY, clearChunkErrorAlert, showChunkErrorAlert } from './chunk-error-alert'
import { browserChunkReloadDeps } from './chunk-reload'

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: https://panel.test/assets/BillingView-abc123.js')

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetErrorReporting()
})

describe('showChunkErrorAlert', () => {
  it('adds one sticky error alert with the default text while the key has no translation', () => {
    const store = useAlertsStore()

    showChunkErrorAlert()

    expect(store.activeAlerts).toHaveLength(1)
    const [alert] = store.activeAlerts
    expect(alert).toMatchObject({ success: false, sticky: true })
    expect(alert.errorMessage).toContain('refresh the page')
    expect(alert.errorMessage).not.toBe(CHUNK_ERROR_ALERT_KEY)
  })

  it('does not add a second one while the first is on screen', () => {
    const store = useAlertsStore()

    showChunkErrorAlert()
    showChunkErrorAlert()

    expect(store.activeAlerts).toHaveLength(1)
  })

  it('adds it again after the user closed it', () => {
    const store = useAlertsStore()
    showChunkErrorAlert()
    store.removeAlert(store.activeAlerts[0].id)

    showChunkErrorAlert()

    expect(store.activeAlerts).toHaveLength(1)
  })

  it('does not hide the error from the reporter: a chunk that still fails after a reload is a broken deploy', () => {
    const reports: ErrorReport[] = []
    setErrorReporter(report => reports.push(report))
    const error = chunkError()
    showChunkErrorAlert()

    reportError(error)

    expect(reports).toHaveLength(1)
    expect(reports[0].message).toContain('dynamically imported module')
  })

  it('still shows the notice when the translation lookup throws (blocked storage in the missing-key handler)', () => {
    localStorage.removeItem('missingLang')
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    try {
      const store = useAlertsStore()

      showChunkErrorAlert()

      expect(store.activeAlerts).toHaveLength(1)
      expect(store.activeAlerts[0].errorMessage).toBe(CHUNK_ERROR_ALERT_DEFAULT)
    } finally {
      blocked.mockRestore()
    }
  })

  it('uses the translation when the backend has the key', () => {
    const translate = vi.spyOn(i18next, 't').mockReturnValue('Nie udało się wczytać strony. Odśwież stronę.' as never)
    try {
      const store = useAlertsStore()

      showChunkErrorAlert()

      expect(translate).toHaveBeenCalledWith(CHUNK_ERROR_ALERT_KEY, { defaultValue: CHUNK_ERROR_ALERT_DEFAULT })
      expect(store.activeAlerts[0].errorMessage).toBe('Nie udało się wczytać strony. Odśwież stronę.')
    } finally {
      translate.mockRestore()
    }
  })
})

describe('clearChunkErrorAlert', () => {
  it('removes the notice and leaves the other alerts', () => {
    const store = useAlertsStore()
    store.addAlert({ success: true, successMessage: 'Saved' })
    showChunkErrorAlert()

    clearChunkErrorAlert()

    expect(store.activeAlerts).toHaveLength(1)
    expect(store.activeAlerts[0].successMessage).toBe('Saved')
  })

  it('still removes the notice after the language changed while it was on screen', () => {
    const store = useAlertsStore()
    const translate = vi.spyOn(i18next, 't').mockReturnValue('Texto en otro idioma' as never)
    try {
      showChunkErrorAlert()
      translate.mockReturnValue('Texte dans une autre langue' as never)

      clearChunkErrorAlert()

      expect(store.activeAlerts).toHaveLength(0)
    } finally {
      translate.mockRestore()
    }
  })

  it('does nothing when no notice was shown', () => {
    const store = useAlertsStore()
    clearChunkErrorAlert()
    store.addAlert({ success: false, errorMessage: 'Broken', sticky: true })

    clearChunkErrorAlert()

    expect(store.activeAlerts).toHaveLength(1)
  })

  it('leaves a sticky alert with another text', () => {
    const store = useAlertsStore()
    store.addAlert({ success: false, errorMessage: 'Broken', sticky: true })

    clearChunkErrorAlert()

    expect(store.activeAlerts).toHaveLength(1)
  })
})

describe('the notice in the AlertManager', () => {
  it('is visible, stays after 5 s and goes when the user closes it', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await mountKit(AlertManager, { global: { stubs: { 'transition': false, 'transition-group': false } } })
      showChunkErrorAlert()
      await nextTick()

      expect(wrapper.find('.alert--error').text()).toContain('refresh the page')

      await vi.advanceTimersByTimeAsync(60_000)
      expect(wrapper.find('.alert--error').exists()).toBe(true)

      await wrapper.find('.alert--error .alert__close-box .v-icon').trigger('click')
      // The element stays while its leave transition runs (jsdom has none to finish), so the store is the check.
      expect(useAlertsStore().activeAlerts).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('browserChunkReloadDeps notice hooks', () => {
  it('show and clear the alert through the store', () => {
    const store = useAlertsStore()
    const deps = browserChunkReloadDeps()

    deps.notifyBlocked(chunkError())
    expect(store.activeAlerts).toHaveLength(1)

    deps.clearNotice()
    expect(store.activeAlerts).toHaveLength(0)
  })

  it('never throw into the router when Pinia is not active', () => {
    setActivePinia(undefined)
    const deps = browserChunkReloadDeps()

    expect(() => deps.notifyBlocked(chunkError())).not.toThrow()
    expect(() => deps.clearNotice()).not.toThrow()
  })
})
