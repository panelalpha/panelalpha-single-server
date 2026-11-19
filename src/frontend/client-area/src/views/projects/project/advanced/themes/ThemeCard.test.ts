import type { VueWrapper } from '@vue/test-utils'
import type { InstalledTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ThemeCard from './ThemeCard.vue'

function theme (overrides: Partial<InstalledTheme> = {}): InstalledTheme {
  return { name: 'twentytwentyfive', title: 'Twenty Twenty-Five', status: 'inactive', version: '1.0.0', description: 'Short description.', ...overrides }
}

function buttonWithText (wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find(button => button.text().includes(text))
}

function iconNames (wrapper: VueWrapper): unknown[] {
  return wrapper.findAllComponents({ name: 'VIcon' }).map(icon => icon.props('icon'))
}

async function mountCard (item: InstalledTheme, props: Record<string, unknown> = {}) {
  return mountKit(ThemeCard, { props: { item, checked: false, instanceId: 7, ...props } })
}

describe('ThemeCard', () => {
  it('paints the active theme green and hides the hover Use button', async () => {
    const wrapper = await mountCard(theme({ status: 'active' }))

    expect(wrapper.find('.data-iterator-card').classes()).toContain('data-iterator-card--green')
    expect(buttonWithText(wrapper, 'button.theme.use')).toBeUndefined()
  })

  it('leaves an inactive theme grey and offers Use theme on hover', async () => {
    const item = theme()
    const wrapper = await mountCard(item)

    expect(wrapper.find('.data-iterator-card').classes()).not.toContain('data-iterator-card--green')
    await buttonWithText(wrapper, 'button.theme.use')!.trigger('click')
    expect(wrapper.emitted('action-button-activate')?.[0]).toEqual([item])
  })

  it('locks Activate and Remove on the active theme', async () => {
    const wrapper = await mountCard(theme({ status: 'active' }))

    expect(buttonWithText(wrapper, 'message.status.activated')!.attributes('disabled')).toBeDefined()
    expect(buttonWithText(wrapper, 'button.remove')!.attributes('disabled')).toBeDefined()
  })

  it('emits the theme when Activate is clicked on an inactive theme', async () => {
    const item = theme()
    const wrapper = await mountCard(item)

    expect(buttonWithText(wrapper, 'message.status.activated')).toBeUndefined()
    await buttonWithText(wrapper, 'message.status.active')!.trigger('click')
    expect(wrapper.emitted('action-button-activate')?.[0]).toEqual([item])
  })

  it('emits the theme when Remove is clicked on an inactive theme', async () => {
    const item = theme()
    const wrapper = await mountCard(item)

    expect(buttonWithText(wrapper, 'button.remove')!.attributes('disabled')).toBeUndefined()
    await buttonWithText(wrapper, 'button.remove')!.trigger('click')
    expect(wrapper.emitted('action-button-delete')?.[0]).toEqual([item])
  })

  it('shows the warning icon and Update only when an update is available', async () => {
    const without = await mountCard(theme({ update: 'none' }))
    expect(buttonWithText(without, 'button.update')).toBeUndefined()
    expect(iconNames(without)).toContain('$alertok')

    const item = theme({ update: 'available', update_version: '1.1.0' })
    const withUpdate = await mountCard(item)
    expect(iconNames(withUpdate)).toContain('$alertwarning')
    await buttonWithText(withUpdate, 'button.update')!.trigger('click')
    expect(withUpdate.emitted('action-button-update')?.[0]).toEqual([item])
  })

  it('shows Installing in place of the actions while an install runs', async () => {
    const wrapper = await mountCard(theme({ async_status: { install: 'pending' } }))

    expect(wrapper.text()).toContain('button.installing')
    expect(buttonWithText(wrapper, 'message.status.active')).toBeUndefined()
    expect(buttonWithText(wrapper, 'button.remove')).toBeUndefined()
  })

  it('shows Updating in place of the actions while an update runs', async () => {
    const wrapper = await mountCard(theme({ status: 'active', update: 'available', async_status: { update: 'in_progress' } }))

    expect(wrapper.text()).toContain('button.updating')
    expect(buttonWithText(wrapper, 'button.update')).toBeUndefined()
  })

  it('shows Installing before Updating when both are in progress', async () => {
    const wrapper = await mountCard(theme({ async_status: { install: 'pending', update: 'pending' } }))

    expect(wrapper.text()).toContain('button.installing')
    expect(wrapper.text()).not.toContain('button.updating')
  })

  it('offers Read More only for a long description and emits the theme on click', async () => {
    const short = await mountCard(theme({ description: 'Short description.' }))
    expect(short.find('.truncate-text').exists()).toBe(false)

    const item = theme({ description: `${'word '.repeat(40)}end` })
    const long = await mountCard(item)
    expect(long.find('.truncate-text').exists()).toBe(true)

    await long.find('.truncate-text').trigger('click')
    expect(long.emitted('action-button-read-more')?.[0]).toEqual([item])
  })

  it('keeps Read More for a long description without a space in its first 100 characters', async () => {
    const wrapper = await mountCard(theme({ description: 'x'.repeat(150) }))

    expect(wrapper.find('.truncate-text').exists()).toBe(true)
  })

  it('shows the no-description text and no Read More for an empty description', async () => {
    const wrapper = await mountCard(theme({ description: null }))

    expect(wrapper.text()).toContain('message.theme.noDescription')
    expect(wrapper.find('.truncate-text').exists()).toBe(false)
  })

  it('renders an escaped title as text, not as markup', async () => {
    const wrapper = await mountCard(theme({ title: '&lt;img src=x onerror=alert(1)&gt;' }))

    expect(wrapper.find('.item-title').text()).toBe('<img src=x onerror=alert(1)>')
    expect(wrapper.find('.item-title img').exists()).toBe(false)
  })

  it('decodes entities in the title', async () => {
    const wrapper = await mountCard(theme({ title: 'Twenty &#8211; Five' }))

    expect(wrapper.find('.item-title').text()).toBe('Twenty – Five')
  })

  it('links the preview to the WordPress theme page', async () => {
    const wrapper = await mountCard(theme())

    expect(wrapper.findAll('a').some(link => link.attributes('href') === 'https://wp-themes.com/twentytwentyfive')).toBe(true)
  })

  it('marks the card selected while checked', async () => {
    const wrapper = await mountCard(theme(), { checked: true })

    expect(wrapper.find('.data-iterator-card').classes()).toContain('data-iterator-card--selected')
  })
})
