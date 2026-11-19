import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { COPY_RESET_DELAY } from '@/shared/ui/buttons/use-copy-text'
import { mountKit } from '@/test/mount-kit'
import ApiTokenCreateModal from './ApiTokenCreateModal.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  createResellerApiToken: vi.fn(),
}))

const CREATED = {
  id: 9,
  name: ' CI ',
  last_used_at: null,
  created_at: '2026-10-01T10:00:00.000000Z',
  plain_text_token: '9|secret',
}

type Exposed = { open: () => void }

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
  const wrapper = await mountKit(ApiTokenCreateModal, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
  ;(wrapper.vm as unknown as Exposed).open()
  await flushPromises()
}

function nameInput (): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('[data-testid="reseller-api-token-name-input"] input')
}

async function typeName (value: string) {
  const input = nameInput()!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function pressEnter () {
  nameInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await flushPromises()
}

function submitButton (): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-create-submit"]')!
}

describe('ApiTokenCreateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sends the name as typed (no trim, not disabled when empty) and emits the created token', async () => {
    vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    expect(submitButton().disabled).toBe(false)
    await typeName(' CI ')
    submitButton().click()
    await flushPromises()

    expect(resellerApi.createResellerApiToken).toHaveBeenCalledWith(' CI ')
    // The emitted list row carries no one-time secret.
    const { plain_text_token: _secret, ...row } = CREATED
    expect(wrapper.emitted('api-token-created')).toEqual([[row]])
    expect(wrapper.emitted('api-token-created')![0]![0]).not.toHaveProperty('plain_text_token')
    wrapper.unmount()
  })

  it('creates the token on Enter in the name field (D2)', async () => {
    vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    await typeName('CI')
    await pressEnter()

    expect(resellerApi.createResellerApiToken).toHaveBeenCalledTimes(1)
    expect(resellerApi.createResellerApiToken).toHaveBeenCalledWith('CI')
    wrapper.unmount()
  })

  it('sends one POST for a second Enter while the first request runs', async () => {
    const pending = deferred<typeof CREATED>()
    vi.mocked(resellerApi.createResellerApiToken).mockReturnValue(pending.promise)
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    await typeName('CI')
    await pressEnter()
    await pressEnter()
    submitButton().click()
    await flushPromises()

    expect(resellerApi.createResellerApiToken).toHaveBeenCalledTimes(1)

    pending.resolve(CREATED)
    await flushPromises()
    wrapper.unmount()
  })

  it('alerts and keeps step 1 with the name field when the POST fails', async () => {
    vi.mocked(resellerApi.createResellerApiToken).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)

    await typeName('CI')
    submitButton().click()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.emitted('api-token-created')).toBeUndefined()
    expect(nameInput()).not.toBeNull()
    expect(nameInput()!.value).toBe('CI')
    wrapper.unmount()
  })

  it('clears the name and shows step 1 again on every open()', async () => {
    vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    submitButton().click()
    await flushPromises()
    expect(nameInput()).toBeNull()

    await openModal(wrapper)

    expect(nameInput()).not.toBeNull()
    expect(nameInput()!.value).toBe('')
    wrapper.unmount()
  })

  it('gives the close button an accessible name from button.close', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    const close = document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-create-close"]')!
    expect(close.getAttribute('aria-label')).toBe('button.close')
    wrapper.unmount()
  })

  describe('step 2', () => {
    async function createToken (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
      await openModal(wrapper)
      await typeName('CI')
      submitButton().click()
      await flushPromises()
    }

    function continueButton (): HTMLButtonElement {
      return document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-create-continue"]')!
    }

    // jsdom never finishes the leave transition, so the DOM stays; the dialog's `v-model` is what closes.
    function dialogOpen (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']): boolean {
      return wrapper.getComponent({ name: 'VDialog' }).props('modelValue') as boolean
    }

    it('shows the readonly name, the token and the warning alert after the POST', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const { wrapper } = await mountModal()
      await createToken(wrapper)

      expect(nameInput()).toBeNull()
      const readonlyName = document.querySelector<HTMLElement>('[data-testid="reseller-api-token-name-readonly"]')!
      expect(readonlyName.classList.contains('reseller-api-token-name--disabled')).toBe(true)
      expect(readonlyName.getAttribute('style') ?? '').not.toContain('opacity')
      expect(document.querySelector('[data-testid="reseller-api-token-copy"] .record-box-copy-element > span')!.textContent).toBe('9|secret')
      expect(document.querySelector('.app-message--error')).not.toBeNull()
      wrapper.unmount()
    })

    it('keeps Continue greyed and inert until the confirmation is checked (D5)', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const { wrapper } = await mountModal()
      await createToken(wrapper)

      expect(continueButton().classList.contains('disabled-gray')).toBe(true)
      continueButton().click()
      await flushPromises()
      expect(dialogOpen(wrapper)).toBe(true)

      document.querySelector<HTMLInputElement>('[data-testid="reseller-api-create-confirm"] input')!.click()
      await flushPromises()
      expect(continueButton().classList.contains('disabled-gray')).toBe(false)

      continueButton().click()
      await flushPromises()
      expect(dialogOpen(wrapper)).toBe(false)
      wrapper.unmount()
    })

    it('hides the X until the confirmation is checked, but keeps it clickable (legacy :9)', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const { wrapper } = await mountModal()
      await createToken(wrapper)

      const close = (): HTMLElement => document.querySelector<HTMLElement>('[data-testid="reseller-api-create-close"]')!
      expect(close().classList.contains('reseller-api-close--hidden')).toBe(true)
      expect(close().getAttribute('style') ?? '').not.toContain('opacity')

      document.querySelector<HTMLInputElement>('[data-testid="reseller-api-create-confirm"] input')!.click()
      await flushPromises()
      expect(close().classList.contains('reseller-api-close--hidden')).toBe(false)
      wrapper.unmount()
    })

    it('copies the token on click', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      const { wrapper } = await mountModal()
      await createToken(wrapper)

      document.querySelector<HTMLElement>('[data-testid="reseller-api-token-copy"]')!.click()
      await flushPromises()

      expect(writeText).toHaveBeenCalledWith('9|secret')
      wrapper.unmount()
    })

    it('drops the token and returns to step 1 on the dialog after-leave (impl-review F1)', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const { wrapper } = await mountModal()
      await createToken(wrapper)
      expect(document.querySelector('[data-testid="reseller-api-token-copy"] .record-box-copy-element > span')).not.toBeNull()

      wrapper.getComponent({ name: 'VDialog' }).vm.$emit('after-leave')
      await flushPromises()

      expect(document.querySelector('[data-testid="reseller-api-token-copy"] .record-box-copy-element > span')).toBeNull()
      expect(nameInput()).not.toBeNull()
      expect(nameInput()!.value).toBe('')
      wrapper.unmount()
    })

    // `open()` schedules the delayed "Copied" reset (`resetCopy()`, 150 ms). On real timers that reset raced the copy click: under a loaded
    // full run, creating the token took longer than 150 ms and the reset landed after the click. Only `setTimeout`/`clearTimeout` are faked,
    // so the test moves the clock itself; `flushPromises()` runs on `setImmediate` and keeps working.
    it('resets the Copied state on the next open() (impl-review F2)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
        const { wrapper } = await mountModal()
        await createToken(wrapper)
        document.querySelector<HTMLElement>('[data-testid="reseller-api-token-copy"]')!.click()
        await flushPromises()
        expect(document.querySelector('.copied')).not.toBeNull()

        await openModal(wrapper)
        vi.advanceTimersByTime(COPY_RESET_DELAY)
        await flushPromises()
        await createToken(wrapper)

        expect(document.querySelector('.copied')).toBeNull()
        expect(document.querySelector('.copy')).not.toBeNull()
        wrapper.unmount()
      } finally {
        vi.useRealTimers()
      }
    })

    it('returns to step 1 on the next open()', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const { wrapper } = await mountModal()
      await createToken(wrapper)

      await openModal(wrapper)

      expect(nameInput()).not.toBeNull()
      expect(document.querySelector('[data-testid="reseller-api-token-copy"] .record-box-copy-element > span')).toBeNull()
      wrapper.unmount()
    })

    it('copies the token with Enter and with Space on the named value (kit row)', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      const { wrapper } = await mountModal()
      await createToken(wrapper)

      const value = document.querySelector<HTMLElement>('[data-testid="reseller-api-token-copy"] .record-box-copy-element')!
      expect(value.getAttribute('role')).toBe('button')
      expect(value.getAttribute('tabindex')).toBe('0')
      expect(value.getAttribute('aria-label')).toBe('tooltip.copy: 9|secret')

      value.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flushPromises()
      expect(writeText).toHaveBeenCalledWith('9|secret')

      writeText.mockClear()
      value.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      await flushPromises()
      expect(writeText).toHaveBeenCalledWith('9|secret')
      wrapper.unmount()
    })

    it('shows the labels, the disabled name, the warning, the question and the divider', async () => {
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue(CREATED)
      const { wrapper } = await mountModal()
      await createToken(wrapper)

      const text = document.body.textContent ?? ''
      expect(text).toContain('reseller.apiTokens.name')
      expect(text).toContain('reseller.apiTokens.content')
      expect(text).toContain('reseller.apiTokens.modal.created')
      expect(text).toContain('message.confirmBeforeProceedingAction')
      expect(text).toContain('reseller.apiTokens.savedToken')
      const input = document.querySelector<HTMLInputElement>('[data-testid="reseller-api-token-name-readonly"] input')!
      expect(input.disabled).toBe(true)
      expect(input.value).toBe('CI')
      expect(document.querySelector('.modal-divider')).not.toBeNull()
      wrapper.unmount()
    })
  })
})
