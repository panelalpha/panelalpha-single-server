// Behaviour of the catalogue theme card of Add New: written on the code before the catalogue card pattern, so the same tests guard the move onto `CatalogCard`.
// Locators: the `VBtn`, `VIcon` and `Loader` components and their text.
import type { VueWrapper } from '@vue/test-utils'
import type { RepositoryTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import Loader from '@/shared/ui/loader/Loader.vue'
import { mountKit } from '@/test/mount-kit'
import { openTooltip } from '@/test/tooltip'
import NewThemeCard from './NewThemeCard.vue'

const LONG = 'A theme description that is long enough to be cut on the card, because it runs well past the one hundred characters limit.'

function theme (overrides: Partial<RepositoryTheme> = {}): RepositoryTheme {
  return { id: 11, slug: 'astra', name: 'Astra', version: '4.0', description: 'Short description.', rating: 80, ...overrides }
}

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

async function mountCard (item: RepositoryTheme, props: Record<string, unknown> = {}) {
  return mountKit(NewThemeCard, { props: { item, ...props } })
}

describe('NewThemeCard', () => {
  it('shows the decoded name as text', async () => {
    const wrapper = await mountCard(theme({ name: 'Tom &amp; Jerry' }))

    expect(wrapper.text()).toContain('Tom & Jerry')
  })

  it('emits the theme from the hover Install and from the install icon', async () => {
    const item = theme()
    const wrapper = await mountCard(item)

    await buttonWithText(wrapper, 'button.theme.install')!.trigger('click')
    const icon = buttonsWithIcon(wrapper, '$installIcon').find(button => button.text() === '')!
    await icon.trigger('click')
    expect(wrapper.emitted('action-button-install')).toEqual([[item], [item]])
  })

  it('shows the loader in both install buttons while an install runs, and they still emit', async () => {
    const item = theme({ async_status: { install: 'pending' } })
    const wrapper = await mountCard(item)
    const busy = buttons(wrapper).filter(button => button.findComponent(Loader).exists())

    expect(busy).toHaveLength(2)
    expect(buttonsWithIcon(wrapper, '$installIcon')).toHaveLength(0)
    await busy[0]!.trigger('click')
    await busy[1]!.trigger('click')
    expect(wrapper.emitted('action-button-install')).toHaveLength(2)
  })

  it('links the hover Preview to wp-themes in a new tab', async () => {
    const wrapper = await mountCard(theme())
    const preview = buttonWithText(wrapper, 'button.preview')!

    expect(preview.attributes('href')).toBe('https://wp-themes.com/astra')
    expect(preview.attributes('target')).toBe('_blank')
  })

  it('shows the eye link only with a preview url: the API url for a custom theme, wp-themes otherwise', async () => {
    const none = await mountCard(theme())
    expect(buttonsWithIcon(none, '$eye')).toHaveLength(0)

    const repository = await mountCard(theme({ preview_url: 'https://demo.example/astra' }))
    expect(buttonsWithIcon(repository, '$eye')[0]!.attributes('href')).toBe('https://wp-themes.com/astra')

    const custom = await mountCard(theme({ type: 'custom', preview_url: 'https://demo.example/custom' }))
    expect(buttonsWithIcon(custom, '$eye')[0]!.attributes('href')).toBe('https://demo.example/custom')
  })

  it('shows the rating out of five, and 0 without a rating', async () => {
    const rated = await mountCard(theme({ rating: 80 }))
    expect(rated.findAll('b').map(element => element.text())).toContain('4')

    const unrated = await mountCard(theme({ rating: null }))
    expect(unrated.findAll('b').map(element => element.text())).toContain('0')
  })

  it('cuts a long description with Read more, which emits the theme', async () => {
    const item = theme({ description: LONG })
    const wrapper = await mountCard(item)
    const link = wrapper.findAll('a').find(element => element.text().includes('button.readMore'))!

    expect(wrapper.text()).not.toContain('limit.')
    await link.trigger('click')
    expect(wrapper.emitted('action-button-read-more')?.[0]).toEqual([item])
  })

  it('shows a short description whole and the fallback without one', async () => {
    const short = await mountCard(theme())
    expect(short.text()).toContain('Short description.')
    expect(short.text()).not.toContain('button.readMore')

    const empty = await mountCard(theme({ description: null }))
    expect(empty.text()).toContain('message.theme.noDescription')
  })

  it('shows the Featured ribbon only on a featured card', async () => {
    const featured = await mountCard(theme(), { featured: true })
    expect(featured.text()).toContain('general.featured')
    expect(featured.classes()).toContain('data-iterator-card--featured')

    const plain = await mountCard(theme())
    expect(plain.text()).not.toContain('general.featured')
    expect(plain.classes()).not.toContain('data-iterator-card--featured')
  })

  it('names the eye and the install icon in their tooltips', async () => {
    const wrapper = await mountCard(theme({ preview_url: 'https://demo.example/astra' }))

    const eye = await openTooltip(domButton(wrapper, buttonsWithIcon(wrapper, '$eye')[0]!))
    expect(eye.textContent).toContain('tooltip.instance.theme.preview')

    const install = buttonsWithIcon(wrapper, '$installIcon').find(button => button.text() === '')!
    const tooltip = await openTooltip(domButton(wrapper, install))
    expect(tooltip.textContent).toContain('tooltip.instance.theme.install')
  })

  // The eye link and the install icon have no text, so their tooltips (descriptions) leave them unnamed for a screen reader.
  it('names the eye and the install icon with their action and the theme', async () => {
    const wrapper = await mountCard(theme({ preview_url: 'https://demo.example/astra' }))

    expect(buttonsWithIcon(wrapper, '$eye')[0]!.attributes('aria-label')).toBe('button.preview Astra')
    const install = buttonsWithIcon(wrapper, '$installIcon').find(button => button.text() === '')!
    expect(install.attributes('aria-label')).toBe('button.install Astra')
  })
})
