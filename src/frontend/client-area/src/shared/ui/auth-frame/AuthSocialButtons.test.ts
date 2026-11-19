import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mountKit } from '@/test/mount-kit'
import AuthSocialButtons from './AuthSocialButtons.vue'

describe('AuthSocialButtons', () => {
  it('renders the register markup: divider, v-row of v-cols with 6-wide columns for two providers', async () => {
    const wrapper = await mountKit(AuthSocialButtons, {
      props: { providers: ['google', 'github'], dividerText: 'Fill the form', modifier: 'register' },
    })
    expect(wrapper.get('[data-testid="auth-or-divider"]').classes()).toEqual(expect.arrayContaining(['or-divider', 'mt-6', 'mb-6']))
    expect(wrapper.get('[data-testid="auth-or-divider"] > div').text()).toBe('Fill the form')

    const row = wrapper.get('.social-login-btns.social-login-btns--register')
    expect(row.classes()).toContain('row--small')
    expect(wrapper.findAll('.social-login-btn-col')).toHaveLength(2)
    expect(wrapper.get('[data-testid="auth-social-google"]').classes()).toContain('social-login-btn')
    expect(wrapper.get('.social-icon-google').exists()).toBe(true)
    expect(wrapper.get('[data-testid="auth-social-github"] .p-sm').text()).toContain('Github')
    wrapper.unmount()
  })

  it('orders the blocks like legacy: register has the buttons above the divider, login the divider above the buttons', async () => {
    const register = await mountKit(AuthSocialButtons, {
      props: { providers: ['google'], dividerText: 'or', modifier: 'register' },
    })
    const registerHtml = register.html()
    expect(registerHtml.indexOf('social-login-btns--register')).toBeLessThan(registerHtml.indexOf('auth-or-divider'))
    register.unmount()

    const login = await mountKit(AuthSocialButtons, { props: { providers: ['google'], dividerText: 'or' } })
    const loginHtml = login.html()
    expect(loginHtml.indexOf('auth-or-divider')).toBeLessThan(loginHtml.indexOf('social-login-btns'))
    login.unmount()
  })

  it('renders a single register provider in a full-width column', async () => {
    const wrapper = await mountKit(AuthSocialButtons, {
      props: { providers: ['google'], dividerText: 'or', modifier: 'register' },
    })
    expect(wrapper.get('.social-login-btn-col').attributes('style') ?? '').not.toContain('width')
    expect(wrapper.get('.social-login-btn-col').classes()).not.toContain('v-col-sm-6')
    wrapper.unmount()
  })

  it('renders the login markup: plain wrapper with the slot first, then the provider buttons', async () => {
    const wrapper = await mountKit(AuthSocialButtons, {
      props: { providers: ['google'], dividerText: 'or' },
      slots: { default: () => h('button', { 'data-testid': 'auth-hub-login', 'class': 'social-login-btn' }, 'Hub') },
    })
    expect(wrapper.get('[data-testid="auth-or-divider"]').classes()).toEqual(expect.arrayContaining(['mt-4', 'mb-4']))
    expect(wrapper.find('.social-login-btns--register').exists()).toBe(false)

    const wrap = wrapper.get('.social-login-btns')
    const buttons = wrap.findAll('.social-login-btn')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].attributes('data-testid')).toBe('auth-hub-login')
    expect(buttons[1].attributes('data-testid')).toBe('auth-social-google')
    expect(wrapper.get('[data-testid="auth-social-google"] .p-d').text()).toContain('Google')
    wrapper.unmount()
  })

  it('emits select with the provider key on click and passes loading to every button', async () => {
    const wrapper = await mountKit(AuthSocialButtons, {
      props: { providers: ['google', 'github'], dividerText: 'or', loading: true, modifier: 'register' },
    })
    expect(wrapper.findAll('.social-login-btn.v-btn--loading')).toHaveLength(2)
    await wrapper.get('[data-testid="auth-social-github"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['github']])
    wrapper.unmount()
  })
})
