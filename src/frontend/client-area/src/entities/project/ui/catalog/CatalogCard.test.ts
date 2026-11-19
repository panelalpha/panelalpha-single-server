// The catalogue card of the kit: props switch the parts of the card on, the emits carry no payload
// (the consumer adds its item). Locators: the `VBtn`, `VIcon`, `VImg`, `Loader` and `StarIcon` components and their text.
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StarIcon from '@/shared/ui/icons/star.vue'
import Loader from '@/shared/ui/loader/Loader.vue'
import { mountKit } from '@/test/mount-kit'
import { openTooltip } from '@/test/tooltip'
import CatalogCard from './CatalogCard.vue'

function buttons (wrapper: VueWrapper) {
  return wrapper.findAllComponents({ name: 'VBtn' })
}

function buttonWithText (wrapper: VueWrapper, text: string) {
  return buttons(wrapper).find(button => button.text().includes(text))
}

function buttonsWithIcon (wrapper: VueWrapper, icon: string) {
  return buttons(wrapper).filter(button => button.findAllComponents({ name: 'VIcon' }).some(item => item.props('icon') === icon))
}

function domButton (wrapper: VueWrapper, button: VueWrapper) {
  return wrapper.findAll('.v-btn').find(element => element.element === button.element)!
}

const FULL = {
  title: 'Astra',
  media: true,
  src: 'https://cdn.example/astra.png',
  actionLabel: 'Install',
  actionIcon: '$installIcon',
  previewHref: 'https://wp-themes.com/astra',
  previewLabel: 'Preview',
  description: 'Short description.',
  readMore: true,
  readMoreLabel: 'Read more',
  rating: 80,
  installs: 1000,
  linkHref: 'https://demo.example/astra',
  linkTooltip: 'Preview tooltip',
  installTooltip: 'Install tooltip',
}

describe('CatalogCard', () => {
  it('renders every part of a full card', async () => {
    const wrapper = await mountKit(CatalogCard, { props: FULL })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['data-iterator-card', 'catalog-card']))
    expect(wrapper.text()).toContain('Astra')
    expect(wrapper.findComponent({ name: 'VImg' }).props('src')).toBe('https://cdn.example/astra.png')
    expect(wrapper.text()).toContain('Short description.')
    expect(wrapper.findComponent(StarIcon).exists()).toBe(true)
    expect(wrapper.findAll('b').map(element => element.text())).toEqual(['4', '1000+'])
    expect(buttonsWithIcon(wrapper, '$eye')[0]!.attributes('href')).toBe('https://demo.example/astra')
    expect(buttonWithText(wrapper, 'Preview')!.attributes('target')).toBe('_blank')
  })

  it('emits action, install and read-more without a payload', async () => {
    const wrapper = await mountKit(CatalogCard, { props: FULL })

    await buttonWithText(wrapper, 'Install')!.trigger('click')
    await buttonsWithIcon(wrapper, '$installIcon').find(button => button.text() === '')!.trigger('click')
    await wrapper.findAll('a').find(element => element.text().includes('Read more'))!.trigger('click')
    expect(wrapper.emitted('action')).toEqual([[]])
    expect(wrapper.emitted('install')).toEqual([[]])
    expect(wrapper.emitted('read-more')).toEqual([[]])
  })

  it('keeps only the screenshot and the title with titleOnly', async () => {
    const wrapper = await mountKit(CatalogCard, { props: { ...FULL, titleOnly: true } })

    expect(wrapper.text()).toContain('Astra')
    expect(wrapper.text()).not.toContain('Short description.')
    expect(wrapper.findComponent(StarIcon).exists()).toBe(false)
    expect(buttonsWithIcon(wrapper, '$eye')).toHaveLength(0)
    expect(buttonWithText(wrapper, 'Install')).toBeDefined()
  })

  it('has no screenshot without media and no optional parts without their props', async () => {
    const wrapper = await mountKit(CatalogCard, { props: { title: 'Akismet', description: 'Spam protection.' } })

    expect(wrapper.findComponent({ name: 'VImg' }).exists()).toBe(false)
    expect(wrapper.findComponent(StarIcon).exists()).toBe(false)
    expect(wrapper.findAll('b')).toHaveLength(0)
    expect(buttons(wrapper)).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Read more')
  })

  it('shows the Featured ribbon from its label', async () => {
    const featured = await mountKit(CatalogCard, { props: { title: 'Astra', featuredLabel: 'Featured' } })
    expect(featured.text()).toContain('Featured')
    expect(featured.classes()).toContain('data-iterator-card--featured')

    const plain = await mountKit(CatalogCard, { props: { title: 'Astra' } })
    expect(plain.classes()).not.toContain('data-iterator-card--featured')
  })

  it('renders the title-append slot next to the title', async () => {
    const wrapper = await mountKit(CatalogCard, {
      props: { title: 'Akismet' },
      slots: { 'title-append': '<span class="special-icon">!</span>' },
    })

    expect(wrapper.find('.v-card-title .special-icon').exists()).toBe(true)
  })

  it('shows a Details button in place of the preview link, and emits details', async () => {
    const wrapper = await mountKit(CatalogCard, { props: { ...FULL, previewHref: undefined, detailsLabel: 'Details' } })

    const details = buttonWithText(wrapper, 'Details')!
    expect(details.attributes('href')).toBeUndefined()
    await domButton(wrapper, details).trigger('click')

    expect(wrapper.emitted('details')).toEqual([[]])
  })

  it('takes its title, a line under the text and its footer from the slots', async () => {
    const wrapper = await mountKit(CatalogCard, {
      props: FULL,
      slots: {
        'title': '<h5 class="own-title">Own title</h5>',
        'text-append': '<span class="own-line">Own line</span>',
        'actions': '<span class="own-footer">Own footer</span>',
      },
    })

    expect(wrapper.find('.own-title').text()).toBe('Own title')
    expect(wrapper.find('.v-card-text .own-line').text()).toBe('Own line')
    expect(wrapper.find('.own-footer').text()).toBe('Own footer')
    expect(wrapper.findComponent(StarIcon).exists()).toBe(false)
    expect(buttonsWithIcon(wrapper, '$eye')).toHaveLength(0)
  })

  it('blocks the hover action while loading and keeps it clickable while busy', async () => {
    const loading = await mountKit(CatalogCard, { props: { ...FULL, actionLoading: true, actionLoadingLabel: 'Creating' } })
    const action = buttonWithText(loading, 'Install')!
    expect(action.props('loading')).toBe(true)
    expect(action.text()).toContain('Creating')

    const busy = await mountKit(CatalogCard, { props: { ...FULL, actionBusy: true, installBusy: true } })
    const spinners = buttons(busy).filter(button => button.findComponent(Loader).exists())
    expect(spinners).toHaveLength(2)
    expect(spinners[0]!.props('loading')).toBeFalsy()
    await spinners[0]!.trigger('click')
    await spinners[1]!.trigger('click')
    expect(busy.emitted('action')).toHaveLength(1)
    expect(busy.emitted('install')).toHaveLength(1)
  })

  it('opens the preview in the given target', async () => {
    const wrapper = await mountKit(CatalogCard, { props: { ...FULL, previewTarget: '_blank' } })

    expect(buttonWithText(wrapper, 'Preview')!.attributes('target')).toBe('_blank')
    expect(buttonWithText(wrapper, 'Preview')!.attributes('rel')).toBe('noopener noreferrer')
  })

  it('names the eye link and the install button in their tooltips', async () => {
    const wrapper = await mountKit(CatalogCard, { props: FULL })

    const eye = await openTooltip(domButton(wrapper, buttonsWithIcon(wrapper, '$eye')[0]!))
    expect(eye.textContent).toContain('Preview tooltip')

    const install = buttonsWithIcon(wrapper, '$installIcon').find(button => button.text() === '')!
    const tooltip = await openTooltip(domButton(wrapper, install))
    expect(tooltip.textContent).toContain('Install tooltip')
  })

  // A tooltip is `aria-describedby`, not a name: an icon-only button without `aria-label` is announced as "button" only.
  it('gives the eye link and the install button their accessible names', async () => {
    const wrapper = await mountKit(CatalogCard, {
      props: { ...FULL, linkAriaLabel: 'Preview Astra', installAriaLabel: 'Install Astra' },
    })

    expect(buttonsWithIcon(wrapper, '$eye')[0]!.attributes('aria-label')).toBe('Preview Astra')
    const install = buttonsWithIcon(wrapper, '$installIcon').find(button => button.text() === '')!
    expect(install.attributes('aria-label')).toBe('Install Astra')
  })
})
