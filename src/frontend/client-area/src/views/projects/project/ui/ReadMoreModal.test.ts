import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mountKit } from '@/test/mount-kit'
import ReadMoreModal from './ReadMoreModal.vue'

// The Read more card of the theme and the plugin pages. Props, slots and emits of the pattern.
const BASE = { modelValue: true, title: 'Astra', description: '<p>Text</p>', frame: 'gray' as const }

async function mountModal (props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  const wrapper = await mountKit(ReadMoreModal, { props: { ...BASE, ...props }, slots, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function card (): HTMLElement {
  return document.body.querySelector<HTMLElement>('.v-overlay--active .readme-card')!
}

function button (label: string): HTMLElement | undefined {
  return [...card().querySelectorAll<HTMLElement>('button, a')].find(element => element.textContent?.includes(label))
}

describe('ReadMoreModal', () => {
  it('renders the card of the dialog family in the kit dialog with the legacy transition', async () => {
    const wrapper = await mountModal({ frame: 'green' })

    expect(wrapper.findComponent({ name: 'VDialog' }).props('transition')).toBe('custom-dialog-transition')
    expect(card().classList.contains('card-width-560')).toBe(true)
    expect(card().classList.contains('readme-card--green')).toBe(true)
    expect(card().querySelector('.readme-card__content')).not.toBeNull()
    wrapper.unmount()
  })

  it('renders nothing while closed', async () => {
    const wrapper = await mountModal({ modelValue: false })

    expect(document.body.querySelector('.readme-card')).toBeNull()
    wrapper.unmount()
  })

  it('shows the title as text, or as sanitized HTML with titleHtml', async () => {
    const text = await mountModal({ title: 'A <b>B</b>' })
    expect(card().querySelector('h5')?.textContent).toBe('A <b>B</b>')
    expect(card().querySelector('h5 b')).toBeNull()
    text.unmount()

    const html = await mountModal({ title: 'A <b>B</b><img src="x" onerror="window.x = 1">', titleHtml: true })
    expect(card().querySelector('h5 b')?.textContent).toBe('B')
    expect(card().querySelector('h5 img')).toBeNull()
    html.unmount()
  })

  it('sanitizes the description', async () => {
    const wrapper = await mountModal({ description: '<p>Hello</p><script>window.x = 1</script><img src="x">' })

    const description = card().querySelector('.description')!
    expect(description.querySelector('p')?.textContent).toBe('Hello')
    expect(description.querySelector('script')).toBeNull()
    expect(description.querySelector('img')).toBeNull()
    wrapper.unmount()
  })

  it.each([
    [undefined, []],
    ['active', ['message.status.active']],
    ['disabled', ['message.status.disabled']],
  ])('shows the chip for status %s', async (status, labels) => {
    const wrapper = await mountModal({ status })

    expect([...card().querySelectorAll('.status-label')].map(element => element.textContent?.trim())).toEqual(labels)
    wrapper.unmount()
  })

  it('shows only the buttons it is asked for and emits their actions without closing', async () => {
    const none = await mountModal()
    expect(button('button.install')).toBeUndefined()
    expect(button('button.activate')).toBeUndefined()
    expect(button('button.update')).toBeUndefined()
    none.unmount()

    const wrapper = await mountModal({ showInstall: true, showActivate: true, showUpdate: true })
    button('button.install')!.click()
    button('button.activate')!.click()
    button('button.update')!.click()
    await flushPromises()

    expect(wrapper.emitted('action-install')).toEqual([[]])
    expect(wrapper.emitted('action-activate')).toEqual([[]])
    expect(wrapper.emitted('action-update')).toEqual([[]])
    expect(wrapper.emitted('update:model-value')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes from the Close button, the X icon and the dialog', async () => {
    const wrapper = await mountModal()

    button('button.close')!.click()
    card().querySelector<HTMLElement>('.readme-card__content > .d-flex > .v-icon')!.click()
    wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(wrapper.emitted('update:model-value')).toEqual([[false], [false], [false]])
    wrapper.unmount()
  })

  it('renders the media and meta wrappers only for a given slot', async () => {
    const bare = await mountModal()
    expect(card().querySelector('.readme-card__img')).toBeNull()
    expect(card().querySelector('.meta-slot')).toBeNull()
    bare.unmount()

    const wrapper = await mountModal({ showUpdate: true }, {
      'media': () => h('span', { class: 'media-slot' }),
      'title-prepend': () => h('span', { class: 'title-slot' }),
      'meta': () => h('span', { class: 'meta-slot' }),
      'actions-prepend': () => h('a', { class: 'prepend-slot' }),
    })
    expect(card().querySelector('.readme-card__img > .media-slot')).not.toBeNull()
    expect(card().querySelector('.title-slot + h5')).not.toBeNull()
    expect(card().querySelector('.meta-slot')?.parentElement?.classList.contains('mt-2')).toBe(true)
    expect(card().querySelector('.prepend-slot')?.nextElementSibling?.textContent).toContain('button.update')
    wrapper.unmount()
  })
})
