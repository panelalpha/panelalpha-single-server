import type * as Vuetify from 'vuetify'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as connectAiApi from '@/entities/mcp/mcp.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import McpTokenCreateModal from './McpTokenCreateModal.vue'

const smAndDown = ref(true)
vi.mock('vuetify', async importOriginal => ({ ...(await importOriginal<typeof Vuetify>()), useDisplay: () => ({ smAndDown }) }))

vi.mock('@/entities/mcp/mcp.api', () => ({
  createToken: vi.fn(),
}))

const CREATED = {
  id: 9,
  name: 'CI',
  last_used_at: null,
  revoked_at: null,
  created_at: '2026-10-01T10:00:00.000000Z',
  plain_text_token: 'plain-secret',
}

type Exposed = { open: () => void }

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(McpTokenCreateModal, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>['wrapper']) {
  ;(wrapper.vm as unknown as Exposed).open()
  await flushPromises()
}

function nameInput (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="connect-ai-token-name-input"] input')!
}

function createButton (): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-testid="connect-ai-create-submit"]')!
}

function continueButton (): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-testid="connect-ai-continue"]')!
}

function confirmInput (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="connect-ai-confirm"] input')!
}

async function typeName (value: string) {
  nameInput().value = value
  nameInput().dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('McpTokenCreateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('creates the token by name and shows it once', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    await typeName('CI')
    createButton().click()
    await flushPromises()

    expect(connectAiApi.createToken).toHaveBeenCalledWith('CI')
    expect(wrapper.emitted('token-created')).toEqual([[]])
    expect(document.querySelector('[data-testid="connect-ai-created-token"]')?.textContent).toContain('plain-secret')
    wrapper.unmount()
  })

  it('disables Continue until the saved-token checkbox is ticked, without the grey class', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    createButton().click()
    await flushPromises()

    expect(continueButton().disabled).toBe(true)
    expect(continueButton().classList.contains('disabled-gray')).toBe(false)

    confirmInput().click()
    await flushPromises()
    expect(continueButton().disabled).toBe(false)
    wrapper.unmount()
  })

  it('keeps Create disabled for a blank name and does not send it', async () => {
    const { wrapper } = await mountModal()
    await openModal(wrapper)

    await typeName(' '.repeat(3))
    expect(createButton().disabled).toBe(true)
    expect(createButton().classList.contains('disabled-gray')).toBe(false)
    expect(connectAiApi.createToken).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('alerts and stays on step 1 when the create fails', async () => {
    vi.mocked(connectAiApi.createToken).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')

    createButton().click()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.emitted('token-created')).toBeUndefined()
    expect(nameInput()).toBeTruthy()
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

  it('shows the one-time token warning after the token is created', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    createButton().click()
    await flushPromises()

    expect(document.body.textContent).toContain('heading.connectAi.tokenWarning')
    wrapper.unmount()
  })

  it('shows the labels, the disabled name, the question and the divider in step 2', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    createButton().click()
    await flushPromises()

    const text = document.body.textContent ?? ''
    expect(text).toContain('heading.connectAi.tokenName')
    expect(text).toContain('heading.connectAi.yourToken')
    expect(text).toContain('message.confirmBeforeProceedingAction')
    expect(text).toContain('heading.connectAi.tokenSavedConfirm')
    const input = document.querySelector<HTMLInputElement>('.v-input--disabled input')!
    expect(input.disabled).toBe(true)
    expect(input.value).toBe('CI')
    expect(document.querySelector('.modal-divider')).not.toBeNull()
    wrapper.unmount()
  })

  it('copies the created token', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    createButton().click()
    await flushPromises()

    // The copy control of the token row: the kit row `CopyRecordItem` (was the `CopyTextButton`).
    document.querySelector<HTMLElement>('[data-testid="connect-ai-created-token"]')!.click()
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('plain-secret')
    wrapper.unmount()
  })

  it('drops the token and returns to step 1 with an empty name on the dialog after-leave', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    createButton().click()
    await flushPromises()
    expect(document.querySelector('[data-testid="connect-ai-created-token"]')).not.toBeNull()

    wrapper.getComponent({ name: 'VDialog' }).vm.$emit('after-leave')
    await flushPromises()

    expect(document.querySelector('[data-testid="connect-ai-created-token"]')).toBeNull()
    expect(nameInput()).toBeTruthy()
    expect(nameInput().value).toBe('')
    wrapper.unmount()
  })

  it('copies the token with Enter and with Space on the named value (kit row)', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    createButton().click()
    await flushPromises()

    const value = document.querySelector<HTMLElement>('[data-testid="connect-ai-created-token"] .record-box-copy-element')!
    expect(value.getAttribute('role')).toBe('button')
    expect(value.getAttribute('tabindex')).toBe('0')
    expect(value.getAttribute('aria-label')).toBe('tooltip.copy: plain-secret')

    value.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('plain-secret')

    writeText.mockClear()
    value.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('plain-secret')
    wrapper.unmount()
  })

  it('shows Copied after a click on the token', async () => {
    vi.mocked(connectAiApi.createToken).mockResolvedValue(CREATED)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
    const { wrapper } = await mountModal()
    await openModal(wrapper)
    await typeName('CI')
    createButton().click()
    await flushPromises()

    document.querySelector<HTMLElement>('[data-testid="connect-ai-created-token"]')!.click()
    await flushPromises()

    expect(document.querySelector('.copied')).not.toBeNull()
    wrapper.unmount()
  })
})
