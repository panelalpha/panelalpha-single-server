import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ThemeReadMoreModal from './ThemeReadMoreModal.vue'

// The behaviour of the theme Read more modal before and after it moves onto the kit `ReadMoreModal`
// (closing, actions, the frame colour, the sanitized description and title, the rating and the preview link). The look is not asserted.
type Item = Record<string, unknown>

const INSTALLED: Item = { name: 'astra', title: 'Astra', slug: 'astra', status: 'inactive', update: 'none', version: '4.0.0', description: '<p>Theme</p>' }
const CATALOGUE: Item = { name: 'neve', title: 'Neve', slug: 'neve', rating: 80, description: '<p>Catalogue</p>' }

async function mountModal (item: Item, isNew = false) {
  const wrapper = await mountKit(ThemeReadMoreModal, {
    props: { item: item as never, instanceId: 7, modelValue: true, isNew },
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

describe('ThemeReadMoreModal behaviour', () => {
  it('closes from the Close button and from the X icon', async () => {
    const wrapper = await mountModal(INSTALLED)

    button('button.close')!.click()
    card().querySelector<HTMLElement>('.readme-card__content > .d-flex > .v-icon')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:model-value')).toEqual([[false], [false]])
    wrapper.unmount()
  })

  it('shows Activate and Update for an inactive installed theme and emits them with the theme, then closes', async () => {
    const wrapper = await mountModal(INSTALLED)

    expect(button('button.install')).toBeUndefined()
    button('button.activate')!.click()
    button('button.update')!.click()
    await flushPromises()

    expect(wrapper.emitted('action-button-activate')).toEqual([[INSTALLED]])
    expect(wrapper.emitted('action-button-update')).toEqual([[INSTALLED]])
    expect(wrapper.emitted('update:model-value')).toEqual([[false], [false]])
    wrapper.unmount()
  })

  it('shows only Update for the active theme', async () => {
    const wrapper = await mountModal({ ...INSTALLED, status: 'active' })

    expect(button('button.activate')).toBeUndefined()
    expect(button('button.update')).toBeDefined()
    expect(button('button.install')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows only Install for a catalogue theme and emits it with the theme, then closes', async () => {
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
  ])('frames a %s theme with update %s as %s', async (status, update, frame) => {
    const wrapper = await mountModal({ ...INSTALLED, status, update })

    expect(card().classList.contains(frame)).toBe(true)
    wrapper.unmount()
  })

  it('sanitizes the description and shows the title as text', async () => {
    const wrapper = await mountModal({
      ...INSTALLED,
      title: 'Astra &amp; <b>Pro</b>',
      description: '<p>Hello</p><script>window.x = 1</script><img src="x" onerror="window.x = 2">',
    })

    const description = card().querySelector('.description')!
    expect(description.querySelector('p')?.textContent).toBe('Hello')
    expect(description.querySelector('script')).toBeNull()
    expect(description.querySelector('img')).toBeNull()
    expect(card().querySelector('h5')?.textContent).toBe('Astra & Pro')
    expect(card().querySelector('h5 b')).toBeNull()
    wrapper.unmount()
  })

  it('shows the screenshot, the rating and the preview link of a catalogue theme', async () => {
    const wrapper = await mountModal(CATALOGUE, true)

    expect(card().querySelector('.readme-card__img')).not.toBeNull()
    expect(card().querySelectorAll('.star-icon')).toHaveLength(5)
    expect(card().textContent).toContain('4/5')
    const preview = card().querySelector<HTMLAnchorElement>('a.preview-button')!
    expect(preview.getAttribute('href')).toBe('https://wp-themes.com/neve')
    expect(preview.getAttribute('target')).toBe('_blank')
    // The eye has no text: the tooltip-less button needs its own name.
    expect(preview.getAttribute('aria-label')).toBe('button.preview Neve')
    wrapper.unmount()
  })

  it('shows no rating for an installed theme', async () => {
    const wrapper = await mountModal(INSTALLED)

    expect(card().querySelectorAll('.star-icon')).toHaveLength(0)
    wrapper.unmount()
  })
})
