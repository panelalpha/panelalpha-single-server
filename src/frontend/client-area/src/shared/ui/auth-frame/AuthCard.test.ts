import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mountKit } from '@/test/mount-kit'
import AuthCard from './AuthCard.vue'

describe('AuthCard', () => {
  it('renders the card with an h1 title and the default slot in the card text', async () => {
    const wrapper = await mountKit(AuthCard, {
      props: { title: 'Log in' },
      slots: { default: () => h('p', { 'data-testid': 'body' }, 'Body') },
    })

    const card = wrapper.get('[data-testid="auth-card"]')
    expect(card.classes()).toEqual(expect.arrayContaining(['v-card', 'd-flex', 'elevation-4']))
    expect(card.classes()).not.toContain('v-card--mwidth-600px')
    const title = card.get('.v-card-title [data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H1')
    expect(title.text()).toBe('Log in')
    expect(title.classes()).toEqual(['font-weight-800', 'text-center'])
    expect(card.get('.v-card-title').classes()).toEqual(expect.arrayContaining(['d-flex', 'justify-center']))
    const text = card.get('.v-card-text')
    expect(text.get('[data-testid="body"]').text()).toBe('Body')
    expect(text.classes()).not.toContain('pb-8')
    expect(card.find('[data-testid="auth-bottom-box"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('gives an h5 title the 22px class and an h2 title none', async () => {
    const h5 = await mountKit(AuthCard, { props: { title: 'Two-factor', titleTag: 'h5' } })
    const title5 = h5.get('[data-testid="auth-title"]')
    expect(title5.element.tagName).toBe('H5')
    expect(title5.classes()).toContain('auth-card-title--h5')
    h5.unmount()

    const h2 = await mountKit(AuthCard, { props: { title: 'Register', titleTag: 'h2' } })
    const title2 = h2.get('[data-testid="auth-title"]')
    expect(title2.element.tagName).toBe('H2')
    expect(title2.classes()).not.toContain('auth-card-title--h5')
    h2.unmount()
  })

  it('renders the bottom box after the text only with the bottom slot, and pads the text with pb-8', async () => {
    const wrapper = await mountKit(AuthCard, {
      props: { title: 'Log in' },
      slots: { bottom: () => h('a', { 'href': '/register', 'data-testid': 'link' }, 'Sign up') },
    })

    const box = wrapper.get('[data-testid="auth-bottom-box"]')
    expect(box.classes()).toEqual(['login-bottom-box', 'p-d', 'text--base'])
    expect(box.get('[data-testid="link"]').attributes('href')).toBe('/register')
    expect(wrapper.get('.v-card-text').classes()).toContain('pb-8')
    expect(wrapper.element.querySelector('.v-card-text + .login-bottom-box')).not.toBeNull()
    wrapper.unmount()
  })

  it('stacks the bottom box with stackBottom and widens the card with wide', async () => {
    const wrapper = await mountKit(AuthCard, {
      props: { title: 'Register', wide: true, stackBottom: true },
      slots: { bottom: () => h('div', 'Already registered?') },
    })

    expect(wrapper.get('[data-testid="auth-card"]').classes()).toContain('v-card--mwidth-600px')
    expect(wrapper.get('[data-testid="auth-bottom-box"]').classes()).toContain('login-bottom-box--register')
    wrapper.unmount()
  })

  it('centered: media, then the title, then the slot inside one centred card text', async () => {
    const wrapper = await mountKit(AuthCard, {
      props: { title: 'Creating account', titleTag: 'h2', wide: true, centered: true },
      attrs: { 'data-testid': 'auth-quick-card' },
      slots: {
        media: () => h('span', { 'data-testid': 'media' }),
        default: () => h('div', { 'data-testid': 'body' }, 'Wait'),
      },
    })

    const card = wrapper.get('[data-testid="auth-quick-card"]')
    expect(card.classes()).toEqual(expect.arrayContaining(['v-card--mwidth-600px', 'v-card--minheight-508px']))
    const text = card.get('.v-card-text')
    expect(text.classes()).toEqual(expect.arrayContaining(['d-flex', 'justify-center', 'align-center', 'flex-column', 'flex-grow-1', 'pb-0']))
    const order = [...text.element.children].map(child => child.dataset.testid ?? child.className.split(' ', 1)[0])
    expect(order).toEqual(['media', 'v-card-title', 'body'])
    expect(text.get('.v-card-title [data-testid="auth-title"]').element.tagName).toBe('H2')
    expect(card.find('[data-testid="auth-bottom-box"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
