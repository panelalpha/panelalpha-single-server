import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { VIcon } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import AppMessage from './AppMessage.vue'

describe('AppMessage', () => {
  it.each(['error', 'warning', 'success', 'info'] as const)('renders the %s variant with its colour and default icon', async variant => {
    const wrapper = await mountKit(AppMessage, { props: { variant } })
    expect(wrapper.get('.app-message').classes()).toEqual(expect.arrayContaining(['app-message', `app-message--${variant}`]))
    expect(wrapper.get('.app-message__icon').classes()).toContain(`text-${variant}`)
    const icon = variant === 'error' || variant === 'warning' ? '$alertwarning' : '$infoCircle'
    expect(wrapper.findComponent(VIcon).props('icon')).toBe(icon)
    wrapper.unmount()
  })

  it('uses the icon prop instead of the variant default', async () => {
    const wrapper = await mountKit(AppMessage, { props: { variant: 'warning', icon: '$stars' } })
    expect(wrapper.findComponent(VIcon).props('icon')).toBe('$stars')
    wrapper.unmount()
  })

  it('renders the title as an h6 only when it is given', async () => {
    const withTitle = await mountKit(AppMessage, { props: { variant: 'error', title: 'T' } })
    expect(withTitle.get('h6.app-message__title').text()).toBe('T')
    withTitle.unmount()

    const withoutTitle = await mountKit(AppMessage, { props: { variant: 'error' } })
    expect(withoutTitle.find('h6').exists()).toBe(false)
    withoutTitle.unmount()
  })

  it('puts the default slot in the text column', async () => {
    const wrapper = await mountKit(AppMessage, {
      props: { variant: 'info' },
      slots: { default: () => h('p', 'Body') },
    })
    expect(wrapper.get('.app-message__text > p').text()).toBe('Body')
    wrapper.unmount()
  })

  it('keeps the icon in one row with the text, so a taller action column does not leave it above the first line', async () => {
    const wrapper = await mountKit(AppMessage, {
      props: { variant: 'info' },
      slots: { default: () => h('p', 'Body'), action: () => h('button', { class: 'retry' }, 'Retry') },
    })
    expect(wrapper.find('.app-message__main > .app-message__icon').exists()).toBe(true)
    expect(wrapper.find('.app-message__main > .app-message__text').exists()).toBe(true)
    expect(wrapper.find('.app-message__main .app-message__action').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the action slot only when it is used', async () => {
    const bare = await mountKit(AppMessage, { props: { variant: 'info' } })
    expect(bare.find('.app-message__action').exists()).toBe(false)
    bare.unmount()

    const withAction = await mountKit(AppMessage, {
      props: { variant: 'info' },
      slots: { action: () => h('button', { class: 'retry' }, 'Retry') },
    })
    expect(withAction.get('.app-message__action .retry').text()).toBe('Retry')
    withAction.unmount()
  })

  it('passes role, data-testid and classes through to the root', async () => {
    const wrapper = await mountKit(AppMessage, {
      props: { variant: 'error' },
      attrs: { 'role': 'alert', 'data-testid': 'x', 'class': 'mb-6' },
    })
    expect(wrapper.get('.app-message').attributes('role')).toBe('alert')
    expect(wrapper.get('.app-message').attributes('data-testid')).toBe('x')
    expect(wrapper.get('.app-message').classes()).toContain('mb-6')
    wrapper.unmount()
  })

  it('adds no role of its own', async () => {
    const wrapper = await mountKit(AppMessage, { props: { variant: 'error' } })
    expect(wrapper.get('.app-message').attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('lets bold text in the body follow the variant colour (global `b, strong` forces the heading colour)', async () => {
    // Legacy gave `b` the variant colour (`error--text`); V4 + global `_general.scss` `b, strong { color: headings !important }` made it black.
    const wrapper = await mountKit(AppMessage, {
      props: { variant: 'error' },
      slots: { default: () => h('b', 'Failed: ') },
    })
    expect(wrapper.get('.app-message__text > b').text()).toBe('Failed:')
    wrapper.unmount()
    const source = readFileSync('src/shared/ui/message/AppMessage.vue', 'utf8')
    expect(source).toMatch(/:deep\(b:not\(\.text--heading\)\),\s*:deep\(strong:not\(\.text--heading\)\)\s*\{\s*color:\s*inherit !important;/)
  })

  it('does not turn the text column basis into a minimum height in the column layout', () => {
    // Row layout: `flex: 1 1 200px` is a width. Below `md` the body is a column, so the basis must be `auto` (the login error was 232 px tall, legacy 98 px).
    const source = readFileSync('src/shared/ui/message/AppMessage.vue', 'utf8')
    const mobile = source.slice(source.indexOf('@media (max-width'))
    expect(mobile).toMatch(/flex-direction:\s*column;/)
    expect(mobile).toMatch(/\.app-message__main\s*\{\s*(\/\/[^\n]*\n\s*)*flex-basis:\s*auto;/)
  })
})
