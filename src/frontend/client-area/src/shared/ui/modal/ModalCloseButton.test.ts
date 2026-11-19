import { describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ModalCloseButton from './ModalCloseButton.vue'

describe('ModalCloseButton', () => {
  const mountButton = (attrs: Record<string, unknown> = {}) => mountKit(ModalCloseButton, { attrs })

  it('renders an x-small text icon button with the close icon', async () => {
    const wrapper = await mountButton()
    const button = wrapper.get('button')
    expect(button.classes()).toEqual(expect.arrayContaining(['modal-close-button', 'ml-auto', 'v-btn--icon', 'v-btn--variant-text']))
    expect(wrapper.find('.v-icon').exists()).toBe(true)
  })

  it('passes data-testid and click through to the button', async () => {
    const onClick = vi.fn()
    const wrapper = await mountButton({ 'data-testid': 'close', onClick })
    await wrapper.get('[data-testid="close"]').trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not emit click while disabled', async () => {
    const onClick = vi.fn()
    const wrapper = await mountButton({ disabled: true, onClick })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('colours the icon with iconColor (legacy `<v-icon color>`) and leaves it uncoloured by default', async () => {
    expect((await mountButton()).get('.v-icon').classes()).not.toContain('text-gray')
    const wrapper = await mountKit(ModalCloseButton, { props: { iconColor: 'gray' } })
    expect(wrapper.get('.v-icon').classes()).toContain('text-gray')
  })

  it('drops the push to the end of the row with pushRight false', async () => {
    const wrapper = await mountKit(ModalCloseButton, { props: { pushRight: false } })
    expect(wrapper.get('button').classes()).not.toContain('ml-auto')
  })

  it('labels the button for assistive technology with button.close (not in legacy)', async () => {
    const wrapper = await mountButton()
    expect(wrapper.get('button').attributes('aria-label')).toBe('button.close')
  })
})
