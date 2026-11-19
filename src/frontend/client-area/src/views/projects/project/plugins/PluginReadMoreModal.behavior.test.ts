import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PluginReadMoreModal from './PluginReadMoreModal.vue'

// The behaviour of the plugin Read more modal before and after it moves onto the kit `ReadMoreModal`
// (closing, actions, the frame colour, the sanitized description and title, the catalogue icon). The look is not asserted.
type Item = Record<string, unknown>

const INSTALLED: Item = { name: 'akismet', title: 'Akismet', slug: 'akismet', status: 'inactive', update: 'none', version: '5.0.0', description: '<p>Plugin</p>' }
const CATALOGUE: Item = { name: 'jetpack', slug: 'jetpack', short_description: 'Short one', icons: { svg: 'https://example.test/icon.svg' } }

async function mountModal (item: Item, isNew = false) {
  const wrapper = await mountKit(PluginReadMoreModal, {
    props: { item: item as never, modelValue: true, isNew },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function card (): HTMLElement {
  return document.body.querySelector<HTMLElement>('.v-overlay--active .readme-card')!
}

function button (label: string): HTMLElement | undefined {
  return [...card().querySelectorAll<HTMLElement>('button, a')].find(element => element.textContent?.includes(label))
}

describe('PluginReadMoreModal behaviour', () => {
  it('closes from the Close button and from the X icon', async () => {
    const wrapper = await mountModal(INSTALLED)

    button('button.close')!.click()
    card().querySelector<HTMLElement>('.readme-card__content > .d-flex > .v-icon')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:model-value')).toEqual([[false], [false]])
    wrapper.unmount()
  })

  it('shows only Activate for an inactive plugin without an update and emits it with the plugin, then closes', async () => {
    const wrapper = await mountModal(INSTALLED)

    expect(button('button.update')).toBeUndefined()
    expect(button('button.install')).toBeUndefined()
    button('button.activate')!.click()
    await flushPromises()

    expect(wrapper.emitted('action-button-activate')).toEqual([[INSTALLED]])
    expect(wrapper.emitted('update:model-value')).toEqual([[false]])
    wrapper.unmount()
  })

  it('shows only Update for the active plugin with an update and emits it with the plugin, then closes', async () => {
    const item = { ...INSTALLED, status: 'active', update: 'available' }
    const wrapper = await mountModal(item)

    expect(button('button.activate')).toBeUndefined()
    button('button.update')!.click()
    await flushPromises()

    expect(wrapper.emitted('action-button-update')).toEqual([[item]])
    expect(wrapper.emitted('update:model-value')).toEqual([[false]])
    wrapper.unmount()
  })

  it('shows no action for the active plugin without an update', async () => {
    const wrapper = await mountModal({ ...INSTALLED, status: 'active' })

    expect(button('button.activate')).toBeUndefined()
    expect(button('button.update')).toBeUndefined()
    expect(button('button.install')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows only Install for a catalogue plugin, emits it with the plugin and closes (K-39)', async () => {
    const wrapper = await mountModal(CATALOGUE, true)

    expect(button('button.activate')).toBeUndefined()
    expect(button('button.update')).toBeUndefined()
    button('button.install')!.click()
    await flushPromises()

    expect(wrapper.emitted('install-item')).toEqual([[CATALOGUE]])
    expect(wrapper.emitted('update:model-value')).toEqual([[false]])
    wrapper.unmount()
  })

  it.each([
    ['inactive', 'none', 'readme-card--gray'],
    ['active', 'none', 'readme-card--green'],
    ['active', 'available', 'readme-card--red'],
  ])('frames a %s plugin with update %s as %s', async (status, update, frame) => {
    const wrapper = await mountModal({ ...INSTALLED, status, update })

    expect(card().classList.contains(frame)).toBe(true)
    wrapper.unmount()
  })

  it('sanitizes the description and the HTML title', async () => {
    const wrapper = await mountModal({
      ...INSTALLED,
      title: 'Akismet <b>Pro</b><img src="x" onerror="window.x = 2">',
      description: '<p>Hello</p><script>window.x = 1</script><img src="x" onerror="window.x = 2">',
    })

    const description = card().querySelector('.description')!
    expect(description.querySelector('p')?.textContent).toBe('Hello')
    expect(description.querySelector('script')).toBeNull()
    expect(description.querySelector('img')).toBeNull()
    expect(card().querySelector('h5 b')?.textContent).toBe('Pro')
    expect(card().querySelector('h5 img')).toBeNull()
    wrapper.unmount()
  })

  it('shows the short description and the icon of a catalogue plugin', async () => {
    const wrapper = await mountModal(CATALOGUE, true)

    expect(card().querySelector('.description')?.textContent).toBe('Short one')
    expect(card().querySelector('.v-avatar')).not.toBeNull()
    wrapper.unmount()
  })

  it('shows no avatar for an installed plugin', async () => {
    const wrapper = await mountModal(INSTALLED)

    expect(card().querySelector('.v-avatar')).toBeNull()
    wrapper.unmount()
  })
})
