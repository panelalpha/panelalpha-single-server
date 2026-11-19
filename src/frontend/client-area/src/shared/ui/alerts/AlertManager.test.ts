import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import AlertManager from './AlertManager.vue'

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
})

async function mountManager () {
  return mountKit(AlertManager, {
    global: { stubs: { 'transition': false, 'transition-group': false } },
  })
}

describe('AlertManager', () => {
  it('renders success and error alerts with the legacy copy keys', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ success: true, successMessage: 'Saved' })
    store.addAlert({ success: false, errorMessage: 'Broken' })
    await nextTick()

    expect(wrapper.find('.alert--success').text()).toContain('message.alertManager.success')
    expect(wrapper.find('.alert--success').text()).toContain('Saved')
    expect(wrapper.find('.alert--error').text()).toContain('message.alertManager.error')
    expect(wrapper.find('.alert--error').text()).toContain('Broken')
  })

  it('falls back to html_text and then to the error key', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ success: true, html_text: '<b>bold</b>' })
    await nextTick()
    expect(wrapper.find('.alert--success b').text()).toBe('bold')

    store.addAlert({ success: false })
    await nextTick()
    expect(wrapper.find('.alert--error .alert__text-box').text()).toBe('message.alertManager.errormessage.alertManager.error')
  })

  it('renders the markup of html_text but not script, handlers or javascript links (sec-html-sanitize)', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    const hostile = '<b>bold</b> <a href="javascript:alert(1)" onclick="alert(1)">link</a><img src=x onerror=alert(1)><script>alert(1)</script>'
    store.addAlert({ success: true, html_text: hostile })
    store.addAlert({ success: false, html_text: hostile })
    await nextTick()

    for (const kind of ['success', 'error']) {
      const alert = wrapper.find(`.alert--${kind}`)
      expect(alert.find('b').text()).toBe('bold')
      expect(alert.find('a').exists()).toBe(true)
      expect(alert.find('img').exists()).toBe(false)
      expect(alert.find('script').exists()).toBe(false)
      expect(alert.html()).not.toMatch(/javascript:|onclick|onerror/)
    }
  })

  it('closes an alert after 5000 ms', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ success: true, successMessage: 'Saved' })
    await nextTick()

    await vi.advanceTimersByTimeAsync(4999)
    expect(store.activeAlerts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(store.activeAlerts).toHaveLength(0)
    expect(wrapper.exists()).toBe(true)
  })

  it('pauses on hover and restarts the full 5000 ms on leave', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ success: false, errorMessage: 'Broken' })
    await nextTick()

    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.find('.alert').trigger('mouseover')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(store.activeAlerts).toHaveLength(1)

    await wrapper.find('.alert').trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(4999)
    expect(store.activeAlerts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(store.activeAlerts).toHaveLength(0)
  })

  it.each([
    ['error', { success: false, errorMessage: 'Broken' }],
    ['success', { success: true, successMessage: 'Saved' }],
  ] as const)('keeps a sticky %s alert: no auto close, also after hover and leave', async (kind, payload) => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ ...payload, sticky: true })
    await nextTick()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(store.activeAlerts).toHaveLength(1)

    await wrapper.find('.alert').trigger('mouseover')
    await wrapper.find('.alert').trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(store.activeAlerts).toHaveLength(1)

    // A click on the icon bubbles to the button, which is the only listener of both alerts.
    await wrapper.find(`.alert--${kind} .alert__close-box .v-icon`).trigger('click')
    expect(store.activeAlerts).toHaveLength(0)
  })

  it('removes an alert from its close button', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ success: true, successMessage: 'Saved' })
    await nextTick()
    await wrapper.find('.alert--success .alert__close-box button').trigger('click')
    expect(store.activeAlerts).toHaveLength(0)
  })

  // The close X is icon-only: without `aria-label` a screen reader reads "button" (a11y).
  it('names the close button of both alerts and closes them from the button itself', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ success: true, successMessage: 'Saved' })
    store.addAlert({ success: false, errorMessage: 'Broken' })
    await nextTick()

    const success = wrapper.get('.alert--success .alert__close-box button')
    const error = wrapper.get('.alert--error .alert__close-box button')
    expect(success.attributes('aria-label')).toBe('button.dismiss')
    expect(error.attributes('aria-label')).toBe('button.dismiss')

    await error.trigger('click')
    expect(store.activeAlerts.map(alert => alert.errorMessage)).toEqual([undefined])
    await success.trigger('click')
    expect(store.activeAlerts).toHaveLength(0)
  })

  // An alert appears without a click on it, so it has to be a live region; otherwise a screen reader announces
  // neither an error nor a success (a11y).
  it('announces an error alert at once and a success alert when it can', async () => {
    const wrapper = await mountManager()
    const store = useAlertsStore()
    store.addAlert({ success: false, errorMessage: 'Broken' })
    store.addAlert({ success: true, successMessage: 'Saved' })
    await nextTick()

    const error = wrapper.find('.alert--error')
    expect(error.attributes('role')).toBe('alert')
    expect(error.attributes('aria-live')).toBe('assertive')
    expect(error.attributes('aria-atomic')).toBe('true')

    const success = wrapper.find('.alert--success')
    expect(success.attributes('role')).toBe('status')
    expect(success.attributes('aria-live')).toBe('polite')
    expect(success.attributes('aria-atomic')).toBe('true')
  })
})
