import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import TokenCreatedPanel from './TokenCreatedPanel.vue'

const PROPS = {
  name: 'CI',
  token: '9|secret',
  nameLabel: 'Name label',
  tokenLabel: 'Token label',
  confirmLabel: 'Saved label',
  confirmed: false,
}

describe('TokenCreatedPanel', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    // Only the clipboard: Vuetify reads the rest of `navigator` when it is created.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  async function mountPanel (props: Record<string, unknown> = {}) {
    return mountKit(TokenCreatedPanel, {
      props: { ...PROPS, ...props },
      slots: { warning: '<p class="test-warning">Warning text</p>' },
    })
  }

  it('renders the labels, the disabled name, the token, the warning and the confirmation', async () => {
    const wrapper = await mountPanel()
    const text = wrapper.text()
    expect(text).toContain('Name label')
    expect(text).toContain('Token label')
    expect(text).toContain('message.confirmBeforeProceedingAction')
    expect(text).toContain('Saved label')

    const input = wrapper.get('.token-created-panel__name input').element as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.readOnly).toBe(true)
    expect(input.value).toBe('CI')
    expect(wrapper.get('.well.well--gray ul.record-box-list .record-box-copy-element > span').text()).toBe('9|secret')
    expect(wrapper.get('.app-message--error .test-warning').text()).toBe('Warning text')
    expect(wrapper.find('.modal-divider').exists()).toBe(true)
    wrapper.unmount()
  })

  it('puts the test ids and the hook class only where given', async () => {
    const wrapper = await mountPanel({ nameTestid: 'n-id', tokenTestid: 't-id', confirmTestid: 'c-id', nameClass: 'hook-class' })
    expect(wrapper.get('[data-testid="n-id"]').classes()).toEqual(expect.arrayContaining(['v-input--md', 'mb-4', 'token-created-panel__name', 'hook-class']))
    expect(wrapper.get('[data-testid="t-id"]').element.tagName).toBe('LI')
    expect(wrapper.find('[data-testid="c-id"] input').exists()).toBe(true)
    wrapper.unmount()

    const bare = await mountPanel()
    expect(bare.get('.token-created-panel__name').attributes('data-testid')).toBeUndefined()
    expect(bare.get('.token-created-panel__name').classes()).not.toContain('hook-class')
    expect(bare.get('li.record-box-list-item').attributes('data-testid')).toBeUndefined()
    expect(bare.get('.checkbox').attributes('data-testid')).toBeUndefined()
    bare.unmount()
  })

  it('copies the token on click, with Enter and with Space, and shows Copied', async () => {
    const wrapper = await mountPanel({ tokenTestid: 't-id' })
    const value = wrapper.get('.record-box-copy-element')
    expect(value.attributes('role')).toBe('button')
    expect(value.attributes('aria-label')).toBe('tooltip.copy: 9|secret')

    await wrapper.get('[data-testid="t-id"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('9|secret')
    // The tooltip is teleported out of the wrapper.
    expect(document.body.textContent).toContain('tooltip.copied')

    await value.trigger('blur')
    writeText.mockClear()
    await value.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('9|secret')

    await value.trigger('blur')
    writeText.mockClear()
    await value.trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('9|secret')
    wrapper.unmount()
  })

  it('emits update:confirmed when the checkbox is toggled', async () => {
    // `setValue` as in `Checkbox.test.ts`: a bare `click()` on the input did not reach the v-model in jsdom.
    const wrapper = await mountPanel({ confirmTestid: 'c-id' })
    await wrapper.get('[data-testid="c-id"] input').setValue(true)
    await flushPromises()
    expect(wrapper.emitted('update:confirmed')?.at(-1)).toEqual([true])
    wrapper.unmount()
  })
})
