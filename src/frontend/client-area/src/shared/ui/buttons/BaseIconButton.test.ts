import { describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import BaseIconButton from './BaseIconButton.vue'

describe('BaseIconButton', () => {
  it('renders the vertical text button with the icon over the caption', async () => {
    const wrapper = await mountKit(BaseIconButton, { props: { icon: '$settings3', text: 'Settings' } })
    const button = wrapper.get('button')
    expect(button.classes()).toEqual(expect.arrayContaining(['v-btn', 'v-btn--vertical', 'v-btn--variant-text']))
    expect(button.classes()).not.toContain('v-btn--vertical-sm')
    expect(button.classes()).not.toContain('v-btn--vertical-loading')
    expect(button.classes()).not.toContain('v-btn--loading')
    expect(button.attributes('style')).toContain('height: auto')
    expect(wrapper.get('.v-icon').classes()).toContain('heading--text')
    expect(wrapper.get('.v-btn__text').text()).toBe('Settings')
  })

  it('small adds the narrow variant class', async () => {
    const wrapper = await mountKit(BaseIconButton, { props: { icon: '$settings3', small: true, text: 'Settings' } })
    expect(wrapper.get('button').classes()).toContain('v-btn--vertical-sm')
  })

  it('filled renders the flat variant', async () => {
    const wrapper = await mountKit(BaseIconButton, { props: { filled: true, icon: '$settings3', text: 'Settings' } })
    const classes = wrapper.get('button').classes()
    expect(classes).toContain('v-btn--variant-flat')
    expect(classes).not.toContain('v-btn--variant-text')
  })

  it('loading swaps the icon for the Loader and keeps v-btn out of its own loading state', async () => {
    const wrapper = await mountKit(BaseIconButton, { props: { icon: '$settings3', loading: true, text: 'Settings' } })
    const button = wrapper.get('button')
    expect(button.classes()).toContain('v-btn--vertical-loading')
    expect(button.classes()).not.toContain('v-btn--loading')
    expect(wrapper.find('.loading-container').exists()).toBe(true)
    expect(wrapper.find('.v-icon').exists()).toBe(false)
    expect(wrapper.get('.v-btn__text').classes()).toContain('loading')
  })

  it('color sets the classes on the icon and the caption only, not on the button', async () => {
    const wrapper = await mountKit(BaseIconButton, { props: { color: 'error', icon: '$settings3', text: 'Delete' } })
    const button = wrapper.get('button')
    expect(button.classes().some(name => name.includes('error'))).toBe(false)
    expect(button.attributes('style') ?? '').not.toContain('background')
    expect(wrapper.get('.v-icon').classes()).toContain('error--text')
    expect(wrapper.get('.v-btn__text').classes()).toContain('error--text')
  })

  it('disabled disables the button', async () => {
    const wrapper = await mountKit(BaseIconButton, { props: { disabled: true, icon: '$settings3', text: 'Settings' } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').classes()).toContain('v-btn--disabled')
  })

  it('passes href, target, data-testid and click through to the button', async () => {
    const onClick = vi.fn()
    const wrapper = await mountKit(BaseIconButton, {
      attrs: { 'data-testid': 'wp-admin', 'href': '/x', 'target': '_blank', onClick },
      props: { icon: '$settings3', text: 'WP Admin' },
    })
    const button = wrapper.get('[data-testid="wp-admin"]')
    expect(button.element.tagName).toBe('A')
    expect(button.attributes('href')).toBe('/x')
    expect(button.attributes('target')).toBe('_blank')
    await button.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
