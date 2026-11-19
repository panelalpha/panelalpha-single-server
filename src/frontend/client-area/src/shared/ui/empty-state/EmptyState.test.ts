import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('table: renders the legacy TableFullScreenMessage classes with an h3, without inline styles', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { title: 'Nothing here', desc: 'Add something' },
      slots: { image: '<i class="img" />', action: '<button class="act">go</button>' },
    })
    expectLegacyClasses(wrapper.element, ['no-data', 'no-data--table', 'py-12', 'px-12'])
    expectLegacyClasses(wrapper.get('.no-data__img').element, ['no-data__img', 'mb-6'])
    expect(wrapper.find('.img').exists()).toBe(true)
    expectLegacyClasses(wrapper.get('h3').element, ['no-data__title', 'h3', 'text--heading'])
    expect(wrapper.get('h3').text()).toBe('Nothing here')
    expectLegacyClasses(wrapper.get('p').element, ['no-data__desc', 'mt-4', 'mb-0', 'p-1', 'font-weight-light', 'text-center', 'text-gray-darken-1'])
    expect(wrapper.get('p').text()).toBe('Add something')
    expectLegacyClasses(wrapper.get('.no-data__action').element, ['no-data__action', 'mt-6'])
    expect(wrapper.get('.no-data__action .act').text()).toBe('go')
    expect(wrapper.get('.no-data__content').attributes('style')).toBeUndefined()
    wrapper.unmount()
  })

  it('table: leaves out the image, text and action wrappers without their slot or prop', async () => {
    const wrapper = await mountKit(EmptyState, { props: { title: 'Only a title' } })
    expect(wrapper.find('.no-data__img').exists()).toBe(false)
    expect(wrapper.find('p').exists()).toBe(false)
    expect(wrapper.find('.no-data__action').exists()).toBe(false)
    expect(wrapper.get('h3').text()).toBe('Only a title')
    wrapper.unmount()
  })

  it('keeps the heading level of the consumer with the look of the variant', async () => {
    const wrapper = await mountKit(EmptyState, { props: { title: 'Title', titleTag: 'h6' } })
    expect(wrapper.find('h3').exists()).toBe(false)
    expectLegacyClasses(wrapper.get('h6').element, ['no-data__title', 'h3', 'text--heading'])
    wrapper.unmount()
  })

  it('card: renders the legacy nodata-container classes with the above-title slot before the title', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'card', title: 'No logs', desc: 'Nothing yet' },
      slots: { 'image': '<i class="img" />', 'above-title': '<p class="greet">Hi</p>', 'action': '<button class="act">go</button>' },
    })
    expectLegacyClasses(wrapper.element, ['nodata-container__box', 'no-data--card', 'pt-15', 'pb-15'])
    expect(wrapper.get('.nodata-container__img .img').exists()).toBe(true)
    expectLegacyClasses(wrapper.get('.nodata-container__title').element, ['nodata-container__title', 'mt-6', 'p-lg', 'font-weight-bold', 'mb-0'])
    expect(wrapper.get('.nodata-container__title').element.tagName).toBe('P')
    expectLegacyClasses(wrapper.get('.nodata-container__message').element, ['nodata-container__message', 'mb-0', 'p-sm', 'mt-4', 'text--gray-darken1'])
    expect(wrapper.get('.nodata-container__message').text()).toBe('Nothing yet')
    expectLegacyClasses(wrapper.get('.nodata-container__action').element, ['nodata-container__action', 'mt-6'])
    const html = wrapper.html()
    expect(html.indexOf('greet')).toBeLessThan(html.indexOf('nodata-container__title'))
    wrapper.unmount()
  })

  it('welcome: renders the box of the empty project list with an h1 look, without the card padding (K-39)', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'welcome', title: 'Create your first project', desc: 'Nothing yet' },
      slots: { 'image': '<i class="img" />', 'above-title': '<p class="greet">Hi</p>', 'action': '<button class="act">go</button>' },
    })
    expectLegacyClasses(wrapper.element, ['nodata-container__box', 'no-data--welcome'])
    expect(wrapper.classes()).not.toContain('pt-15')
    expect(wrapper.get('.nodata-container__img .img').exists()).toBe(true)
    expectLegacyClasses(wrapper.get('.nodata-container__title').element, ['nodata-container__title', 'h1', 'mt-1'])
    expect(wrapper.get('.nodata-container__title').element.tagName).toBe('H1')
    expectLegacyClasses(wrapper.get('.nodata-container__message').element, ['nodata-container__message', 'mb-0', 'p-1', 'mt-4'])
    expect(wrapper.get('.nodata-container__message').text()).toBe('Nothing yet')
    expectLegacyClasses(wrapper.get('.nodata-container__action').element, ['nodata-container__action', 'mt-8'])
    const html = wrapper.html()
    expect(html.indexOf('greet')).toBeLessThan(html.indexOf('nodata-container__title'))
    wrapper.unmount()
  })

  it('panel: renders the OLD card text of Connect AI tokens and Reseller API with an h6, a p-2 text and the action (#12)', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'panel', title: 'No tokens yet', desc: 'Create a token' },
      slots: { image: '<i class="img" />', action: '<button class="act">go</button>' },
    })
    expectLegacyClasses(wrapper.element, ['no-data', 'no-data--panel'])
    expect(wrapper.classes()).not.toContain('no-data--table')
    expect(wrapper.classes()).not.toContain('px-12')
    expect(wrapper.get('.no-data__img .img').exists()).toBe(true)
    expect(wrapper.get('h6').text()).toBe('No tokens yet')
    expectLegacyClasses(wrapper.get('h6').element, ['no-data__title', 'h6', 'mt-4', 'mb-6'])
    expectLegacyClasses(wrapper.get('p').element, ['no-data__desc', 'p-2', 'mb-0'])
    expectLegacyClasses(wrapper.get('.no-data__action').element, ['no-data__action', 'mt-6'])
    wrapper.unmount()
  })

  it('cell: renders the OLD no-data-container of Reseller Users and Logs with an h6 and a 14px text (#12)', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'cell', title: 'There is no logs to display yet', desc: 'They will show here' },
      slots: { image: '<i class="img" />' },
    })
    expectLegacyClasses(wrapper.element, ['no-data-container', 'no-data--cell'])
    expectLegacyClasses(wrapper.get('.no-data__img').element, ['no-data__img', 'mb-6'])
    expectLegacyClasses(wrapper.get('h6').element, ['no-data__title', 'h6', 'mb-4', 'font-weight-bold'])
    expectLegacyClasses(wrapper.get('p').element, ['no-data__desc', 'no-data-container__description', 'mb-0'])
    wrapper.unmount()
  })

  it('panel and cell: the look is OLD at every width, the 32px side padding and the 26px title of the table variant are not used (#12)', () => {
    const source = readFileSync(join(import.meta.dirname, 'EmptyState.vue'), 'utf8')
    const panel = /\.no-data--panel \{([^}]*)\}/.exec(source)
    expect(panel).not.toBeNull()
    expect(panel![1]).toMatch(/padding:\s*56px 24px\s*;/)
    expect(source).not.toMatch(/\.no-data--(?:panel|cell)[^{]*\{[^}]*font-size:\s*(?:26|18)px/)
  })

  it('compact: renders the image slot above the title', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'compact', title: 'Empty' },
      slots: { image: '<i class="img" />' },
    })
    expectLegacyClasses(wrapper.get('.no-data__img').element, ['no-data__img', 'mb-2'])
    const html = wrapper.html()
    expect(html.indexOf('class="img"')).toBeLessThan(html.indexOf('no-data__title'))
    wrapper.unmount()
  })

  it('compact: renders the title and the text, the image only with its slot', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'compact', title: 'No logs', desc: 'Push to deploy' },
    })
    expectLegacyClasses(wrapper.element, ['no-data', 'no-data--compact', 'text-center', 'py-8', 'px-4'])
    expect(wrapper.find('.no-data__img').exists()).toBe(false)
    expectLegacyClasses(wrapper.get('.no-data__title').element, ['no-data__title', 'mb-1', 'p-3', 'text--gray-darken2'])
    expectLegacyClasses(wrapper.get('.no-data__desc').element, ['no-data__desc', 'mb-0', 'caption', 'text--gray-darken1'])
    wrapper.unmount()
  })

  it('intro: renders the intro-page card in a container with an h4', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'intro', title: 'No invoices', desc: 'Come back later' },
      slots: { image: '<i class="img" />', action: '<a class="act">Back</a>' },
    })
    expectLegacyClasses(wrapper.element, ['container', 'empty-state-intro'])
    expect(wrapper.get('.v-card.intro-page .intro-page__illustration .img').exists()).toBe(true)
    expectLegacyClasses(wrapper.get('h4').element, ['intro-page__title', 'h4'])
    expectLegacyClasses(wrapper.get('.intro-page__desc').element, ['intro-page__desc', 'p-lg'])
    expect(wrapper.get('.intro-page__actions .act').text()).toBe('Back')
    wrapper.unmount()
  })

  it('table: the title has no vertical margin (legacy sets none, a 1em margin made the card 52px taller; #6)', () => {
    const source = readFileSync(join(import.meta.dirname, 'EmptyState.vue'), 'utf8')
    const rule = /\.no-data--table \.no-data__title \{([^}]*)\}/.exec(source)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/margin-block:\s*0\s*;/)
  })

  it('passes class and data-testid to the root and the title test id to the title', async () => {
    const wrapper = await mountKit(EmptyState, {
      props: { variant: 'compact', title: 'T', titleTestid: 'x-title' },
      attrs: { 'class': 'git-logs-empty', 'data-testid': 'x-empty' },
    })
    expect(wrapper.classes()).toContain('git-logs-empty')
    expect(wrapper.attributes('data-testid')).toBe('x-empty')
    expect(wrapper.get('[data-testid="x-title"]').text()).toBe('T')
    wrapper.unmount()
  })
})
