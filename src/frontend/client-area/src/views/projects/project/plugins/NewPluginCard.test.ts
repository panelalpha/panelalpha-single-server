// Behaviour of the catalogue plugin card of Add New: written on the code before the catalogue card
// pattern, so the same tests guard the move onto `CatalogCard`. Locators: the `VBtn`, `VIcon`, `Loader` and `StarIcon` components.
import type { VueWrapper } from '@vue/test-utils'
import type { RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import { describe, expect, it } from 'vitest'
import StarIcon from '@/shared/ui/icons/star.vue'
import Loader from '@/shared/ui/loader/Loader.vue'
import { mountKit } from '@/test/mount-kit'
import { openTooltip } from '@/test/tooltip'
import NewPluginCard from './NewPluginCard.vue'

const LONG = 'A plugin description that is long enough to be cut on the card, because it runs well past the one hundred characters limit.'

function plugin (overrides: Partial<RepositoryPlugin> = {}): RepositoryPlugin {
  return {
    id: 21,
    type: 'repository',
    name: 'Akismet',
    slug: 'akismet',
    version: '5.0',
    short_description: 'Spam protection.',
    status: 'inactive',
    tested: '6.5',
    rating: 60,
    active_installs: 1000,
    last_updated: '2026-01-01',
    ...overrides,
  }
}

function installButton (wrapper: VueWrapper) {
  return wrapper.findAllComponents({ name: 'VBtn' }).find(button => button.text() === '')!
}

function iconNames (wrapper: VueWrapper): unknown[] {
  return wrapper.findAllComponents({ name: 'VIcon' }).map(icon => icon.props('icon'))
}

async function mountCard (item: RepositoryPlugin, props: Record<string, unknown> = {}) {
  return mountKit(NewPluginCard, { props: { item, ...props } })
}

describe('NewPluginCard', () => {
  it('shows the decoded name as text', async () => {
    const wrapper = await mountCard(plugin({ name: 'Tom &amp; Jerry' }))

    expect(wrapper.text()).toContain('Tom & Jerry')
  })

  it('emits the plugin from the install button', async () => {
    const item = plugin()
    const wrapper = await mountCard(item)

    await installButton(wrapper).trigger('click')
    expect(wrapper.emitted('action-button-install')?.[0]).toEqual([item])
  })

  it('shows the loader while an install runs, and the button still emits', async () => {
    const item = plugin({ async_status: { install: 'pending' } })
    const wrapper = await mountCard(item)

    expect(installButton(wrapper).findComponent(Loader).exists()).toBe(true)
    await installButton(wrapper).trigger('click')
    expect(wrapper.emitted('action-button-install')?.[0]).toEqual([item])
  })

  it('names the install button in its tooltip', async () => {
    const wrapper = await mountCard(plugin())
    const button = wrapper.findAll('.v-btn').find(element => element.element === installButton(wrapper).element)!

    const tooltip = await openTooltip(button)
    expect(tooltip.textContent).toContain('button.plugin.install')
  })

  // The install icon has no text, so the tooltip (a description) leaves it unnamed for a screen reader.
  it('names the install button with its action and the plugin', async () => {
    const wrapper = await mountCard(plugin())

    expect(installButton(wrapper).attributes('aria-label')).toBe('button.install Akismet')
  })

  it('shows the rating and the installs only when the plugin has them', async () => {
    const full = await mountCard(plugin())
    expect(full.findAll('b').map(element => element.text())).toEqual(['3', '1000+'])
    expect(full.findComponent(StarIcon).exists()).toBe(true)

    const bare = await mountCard(plugin({ rating: 0, active_installs: 0 }))
    expect(bare.findComponent(StarIcon).exists()).toBe(false)
    expect(bare.findAll('b')).toHaveLength(0)
  })

  it('cuts a long description with Read more, which emits the plugin', async () => {
    const item = plugin({ short_description: LONG })
    const wrapper = await mountCard(item)
    const link = wrapper.findAll('a').find(element => element.text().includes('button.readMore'))!

    expect(wrapper.text()).not.toContain('limit.')
    await link.trigger('click')
    expect(wrapper.emitted('action-button-read-more')?.[0]).toEqual([item])
  })

  it('shows a short description whole, without Read more', async () => {
    const wrapper = await mountCard(plugin())

    expect(wrapper.text()).toContain('Spam protection.')
    expect(wrapper.text()).not.toContain('button.readMore')
  })

  it('shows the Featured ribbon and the special icon only on a featured card', async () => {
    const featured = await mountCard(plugin(), { featured: true })
    expect(featured.text()).toContain('general.featured')
    expect(featured.classes()).toContain('data-iterator-card--featured')
    expect(iconNames(featured)).toContain('$alertcircle')

    const plain = await mountCard(plugin())
    expect(plain.text()).not.toContain('general.featured')
    expect(plain.classes()).not.toContain('data-iterator-card--featured')
    expect(iconNames(plain)).not.toContain('$alertcircle')
  })

  it('explains the special icon in its tooltip', async () => {
    const wrapper = await mountCard(plugin(), { featured: true })
    const icon = wrapper.findAllComponents({ name: 'VIcon' }).find(item => item.props('icon') === '$alertcircle')!
    const element = wrapper.findAll('.v-icon').find(item => item.element === icon.element)!

    const tooltip = await openTooltip(element)
    expect(tooltip.textContent).toContain('message.status.plugin.special')
  })
})
