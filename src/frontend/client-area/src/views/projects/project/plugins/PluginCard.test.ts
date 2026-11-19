import type { VueWrapper } from '@vue/test-utils'
import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PluginCard from './PluginCard.vue'

function plugin (overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return { name: 'akismet', title: 'Akismet', description: 'Short description.', version: '1.0.0', status: 'inactive', ...overrides }
}

function buttonWithText (wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find(button => button.text().includes(text))
}

async function mountCard (item: InstalledPlugin, props: Record<string, unknown> = {}) {
  return mountKit(PluginCard, { props: { item, ...props } })
}

describe('PluginCard', () => {
  it('paints an active plugin green and not red', async () => {
    const wrapper = await mountCard(plugin({ status: 'active' }))
    const card = wrapper.find('.data-iterator-card')

    expect(card.classes()).toContain('data-iterator-card--green')
    expect(card.classes()).not.toContain('data-iterator-card--red')
  })

  it('does not run markup in a catalogue title or description (sec-html-sanitize)', async () => {
    const wrapper = await mountCard(plugin({
      title: 'Evil <img src=x onerror=alert(1)>Plugin <a href="javascript:alert(1)" onclick="alert(1)">link</a>',
      description: 'Great <script>alert(1)</script><em class="x" style="position: fixed">style</em>.',
    }))
    const html = wrapper.html()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(wrapper.text()).toContain('Evil Plugin')
    expect(wrapper.text()).toContain('Great')
    expect(wrapper.find('em').exists()).toBe(true)
    expect(wrapper.find('em').attributes('style')).toBeUndefined()
  })

  it('paints an active plugin with an update red', async () => {
    const wrapper = await mountCard(plugin({ status: 'active', update: 'available' }))

    expect(wrapper.find('.data-iterator-card').classes()).toContain('data-iterator-card--red')
  })

  it('leaves an inactive plugin grey', async () => {
    const wrapper = await mountCard(plugin({ status: 'inactive', update: 'available' }))
    const card = wrapper.find('.data-iterator-card')

    expect(card.classes()).not.toContain('data-iterator-card--green')
    expect(card.classes()).not.toContain('data-iterator-card--red')
  })

  it('offers Read More only for a long description', async () => {
    const short = await mountCard(plugin({ description: 'Short description.' }))
    expect(short.text()).not.toContain('button.readMore')

    const long = await mountCard(plugin({ description: `${'word '.repeat(40)}end` }))
    expect(long.text()).toContain('button.readMore')
  })

  it('emits read-more with the plugin when Read More is clicked', async () => {
    const item = plugin({ description: `${'word '.repeat(40)}end` })
    const wrapper = await mountCard(item)

    await wrapper.find('a.truncate-text').trigger('click')

    expect(wrapper.emitted('action-button-read-more')?.[0]).toEqual([item])
  })

  it('renders a null description as empty without throwing', async () => {
    const wrapper = await mountCard(plugin({ description: null as unknown as string }))

    expect(wrapper.text()).not.toContain('button.readMore')
  })

  it('shows Installing in place of the actions while an install runs', async () => {
    const wrapper = await mountCard(plugin(), { asyncState: 'installing' })

    expect(wrapper.text()).toContain('button.installing')
    expect(buttonWithText(wrapper, 'button.activate')).toBeUndefined()
  })

  it('shows Updating in place of the actions while an update runs', async () => {
    const wrapper = await mountCard(plugin({ status: 'active', update: 'available' }), { asyncState: 'updating' })

    expect(wrapper.text()).toContain('button.updating')
    expect(buttonWithText(wrapper, 'button.update')).toBeUndefined()
  })

  it('shows Activate for an inactive plugin and emits the plugin on click', async () => {
    const item = plugin()
    const wrapper = await mountCard(item)

    await buttonWithText(wrapper, 'button.activate')!.trigger('click')

    expect(buttonWithText(wrapper, 'button.disable')).toBeUndefined()
    expect(wrapper.emitted('action-button-activate')?.[0]).toEqual([item])
  })

  it('disables Activate when activation is not allowed', async () => {
    const wrapper = await mountCard(plugin({ activation_disabled: true }))

    expect(buttonWithText(wrapper, 'button.activate')!.attributes('disabled')).toBeDefined()
  })

  it('shows Deactivate for an active plugin and emits the plugin on click', async () => {
    const item = plugin({ status: 'active' })
    const wrapper = await mountCard(item)

    expect(buttonWithText(wrapper, 'button.activate')).toBeUndefined()
    await buttonWithText(wrapper, 'button.disable')!.trigger('click')

    expect(wrapper.emitted('action-button-deactivate')?.[0]).toEqual([item])
  })

  it('shows Update only when an update is available', async () => {
    const without = await mountCard(plugin({ status: 'active' }))
    expect(buttonWithText(without, 'button.update')).toBeUndefined()

    const withUpdate = await mountCard(plugin({ status: 'active', update: 'available' }))
    expect(buttonWithText(withUpdate, 'button.update')).toBeDefined()
  })
})
