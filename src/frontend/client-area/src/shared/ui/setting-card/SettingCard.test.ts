import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mountKit } from '@/test/mount-kit'
import SettingCard from './SettingCard.vue'
import SettingCardSkeleton from './SettingCardSkeleton.vue'

describe('SettingCard', () => {
  it('renders the title as an h6 and the description under it', async () => {
    const wrapper = await mountKit(SettingCard, { props: { title: 'Title', description: 'Text' } })
    expect(wrapper.find('.v-card.setting-card').exists()).toBe(true)
    expect(wrapper.get('h6.setting-card__title').text()).toBe('Title')
    expect(wrapper.get('p.setting-card__description').text()).toBe('Text')
    wrapper.unmount()
  })

  it('keeps the h5 tag of titleTag with the h6 look', async () => {
    const wrapper = await mountKit(SettingCard, { props: { title: 'Title', titleTag: 'h5' } })
    expect(wrapper.get('h5.setting-card__title').classes()).toContain('h6')
    expect(wrapper.find('h6').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders no description, hint, action or footer without the prop or slot', async () => {
    const wrapper = await mountKit(SettingCard, { props: { title: 'Title' } })
    for (const selector of ['.setting-card__description', '.setting-card__alert', '.setting-card__action', '.setting-card__footer', '.v-divider']) {
      expect({ selector, count: wrapper.findAll(selector).length }).toEqual({ selector, count: 0 })
    }
    wrapper.unmount()
  })

  it('puts the hint under the text, the action beside it and the footer under a divider', async () => {
    const wrapper = await mountKit(SettingCard, {
      props: { title: 'Title' },
      slots: {
        alert: () => h('span', { class: 'hint' }, 'Hint'),
        action: () => h('button', { class: 'act' }, 'Go'),
        footer: () => h('p', { class: 'foot' }, 'Foot'),
      },
    })
    expect(wrapper.get('.setting-card__text .setting-card__alert .hint').text()).toBe('Hint')
    expect(wrapper.get('.setting-card__header > .setting-card__action .act').text()).toBe('Go')
    expect(wrapper.find('.setting-card > .v-divider').exists()).toBe(true)
    expect(wrapper.get('.setting-card > .setting-card__footer .foot').text()).toBe('Foot')
    wrapper.unmount()
  })

  // jsdom does not apply scoped media queries, so the rule is checked in the source: one look for every card, no prop (decision of 2026-11-10).
  it('stacks the action under the text below 768 px for every card', () => {
    const source = readFileSync(join(import.meta.dirname, 'SettingCard.vue'), 'utf8')
    const style = source.slice(source.indexOf('<style'))
    const media = /@media \(max-width: 767px\) \{([\s\S]+)\n\}/.exec(style)?.[1] ?? ''
    expect(media).toMatch(/\.setting-card__header \{\s*flex-direction: column;/)
    expect(media).toMatch(/\.setting-card__text \{\s*padding-inline-end: 0;/)
    expect(media).toMatch(/\.setting-card__action \{[\s\S]*margin-top: 12px;[\s\S]*width: 100%;/)
    expect(source).not.toMatch(/stackOnMobile/)
  })

  it('shows the skeleton instead of the card while loading', async () => {
    const wrapper = await mountKit(SettingCard, { props: { title: 'Title', loading: true } })
    expect(wrapper.findComponent(SettingCardSkeleton).exists()).toBe(true)
    expect(wrapper.find('.setting-card').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Title')
    wrapper.unmount()
  })

  it('passes class and data-testid to the card', async () => {
    const wrapper = await mountKit(SettingCard, { props: { title: 'Title' }, attrs: { 'class': 'mt-4', 'data-testid': 'card' } })
    expect(wrapper.get('[data-testid="card"]').classes()).toEqual(expect.arrayContaining(['v-card', 'setting-card', 'mt-4']))
    wrapper.unmount()
  })

  it('adds and removes the footer when the parent drops the slot', async () => {
    const shown = ref(true)
    const Host = defineComponent({
      setup: () => () => h(SettingCard, { title: 'Title' }, shown.value ? { footer: () => h('p', { class: 'foot' }, 'Foot') } : {}),
    })
    const wrapper = await mountKit(Host)
    expect(wrapper.find('.foot').exists()).toBe(true)
    shown.value = false
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.setting-card__footer').exists()).toBe(false)
    expect(wrapper.find('.v-divider').exists()).toBe(false)
    shown.value = true
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.foot').exists()).toBe(true)
    wrapper.unmount()
  })
})
