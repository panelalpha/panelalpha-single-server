import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mountKit } from '@/test/mount-kit'
import AuthMessage from './AuthMessage.vue'

describe('AuthMessage', () => {
  it('renders the error banner: icon, title, then the description slot', async () => {
    const wrapper = await mountKit(AuthMessage, {
      props: { variant: 'error', title: 'Bad email' },
      attrs: { 'role': 'alert', 'data-testid': 'auth-error', 'class': 'mb-6' },
      slots: { default: () => h('p', 'Details') },
    })
    const root = wrapper.get('.app-message')
    expect(root.classes()).toEqual(expect.arrayContaining(['app-message--error', 'mb-6']))
    expect(root.attributes('role')).toBe('alert')
    expect(root.attributes('data-testid')).toBe('auth-error')

    expect(wrapper.get('.app-message__icon').classes()).toContain('text-error')
    expect(wrapper.get('h6.app-message__title').text()).toBe('Bad email')
    expect(wrapper.get('.app-message__text > p').text()).toBe('Details')
    wrapper.unmount()
  })

  it('renders the success banner with the success colour and the plain title class', async () => {
    const wrapper = await mountKit(AuthMessage, {
      props: { variant: 'success', title: 'Sent' },
      attrs: { role: 'status' },
    })
    const root = wrapper.get('.app-message')
    expect(root.classes()).toContain('app-message--success')
    expect(root.attributes('role')).toBe('status')
    expect(wrapper.get('.app-message__icon').classes()).toContain('text-success')
    expect(wrapper.get('h6').classes()).toEqual(['app-message__title'])
    wrapper.unmount()
  })

  it('puts only the title in the text column when there is no description slot', async () => {
    const wrapper = await mountKit(AuthMessage, {
      props: { variant: 'error', title: 'Code expired' },
    })
    expect(wrapper.get('.app-message__text').element.children).toHaveLength(1)
    expect(wrapper.get('.app-message__text > h6').text()).toBe('Code expired')
    wrapper.unmount()
  })
})
