import type * as Vuetify from 'vuetify'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref, withCtx } from 'vue'
import { VDialog } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import AppDialog from './AppDialog.vue'

const smAndDown = ref(true)
vi.mock('vuetify', async importOriginal => ({ ...(await importOriginal<typeof Vuetify>()), useDisplay: () => ({ smAndDown }) }))

const html = document.documentElement
const card = () => h('div', { 'class': 'card', 'data-testid': 'inner' }, 'card')
const overlayAndCard = () => [h('div', { class: 'card-overlay' }), card()]

// The teleported content of an open dialog, with the generated ids (`v-overlay-3`, `v-3`) made stable and the empty `v-if` comments dropped.
function overlayHtml (): string {
  return (document.body.querySelector('.v-overlay-container')?.innerHTML ?? '').replaceAll(/\b(v-overlay-|v-)\d+/g, '$1N').replaceAll('<!--v-if-->', '')
}

async function rendered (component: unknown, props: Record<string, unknown>, children: () => unknown): Promise<string> {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(component as never, { props, attachTo: host, slots: { default: children as never } })
  await flushPromises()
  const result = overlayHtml()
  wrapper.unmount()
  host.remove()
  return result
}

describe('AppDialog', () => {
  it('renders the markup of the ActionModalHost dialog (overlay, persistent, custom transition)', async () => {
    for (const persistent of [true, false]) {
      const expected = await rendered(VDialog, { modelValue: true, persistent, transition: 'custom-dialog-transition' }, overlayAndCard)
      const actual = await rendered(AppDialog, { modelValue: true, overlay: true, persistent, transition: 'custom-dialog-transition', scrollLock: 'mobile' }, card)
      expect(actual).toBe(expected)
      expect(actual).toContain('card-overlay')
    }
  })

  it('renders the markup of the McpTokenModal dialog (no props)', async () => {
    const expected = await rendered(VDialog, { modelValue: true }, card)
    const actual = await rendered(AppDialog, { modelValue: true }, card)
    expect(actual).toBe(expected)
    expect(actual).not.toContain('card-overlay')
  })

  it('leaves transition and persistent at the V4 defaults when they are not set', async () => {
    const bare = await mountKit(VDialog, { props: { modelValue: true }, slots: { default: card as never } })
    const wrapper = await mountKit(AppDialog, { props: { modelValue: true }, slots: { default: card as never } })
    expect(wrapper.findComponent(VDialog).props('transition')).toEqual(bare.findComponent(VDialog).props('transition'))
    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(false)
    bare.unmount()
    wrapper.unmount()
  })

  it('emits update:modelValue from the dialog and from a click on the overlay, unless persistent', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(AppDialog, { props: { modelValue: true, overlay: true }, attachTo: host, slots: { default: card as never } })
    await flushPromises()

    wrapper.findComponent(VDialog).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('update:model-value')).toEqual([[false]])
    ;(document.body.querySelector('.card-overlay') as HTMLElement).click()
    expect(wrapper.emitted('update:model-value')).toEqual([[false], [false]])

    await wrapper.setProps({ persistent: true })
    ;(document.body.querySelector('.card-overlay') as HTMLElement).click()
    expect(wrapper.emitted('update:model-value')).toHaveLength(2)
    wrapper.unmount()
    host.remove()
  })

  it('emits close after every update:modelValue with false, in that order, and never for true', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const order: string[] = []
    const wrapper = await mountKit(AppDialog, {
      props: {
        'modelValue': true,
        'overlay': true,
        'onUpdate:modelValue': (value: boolean) => order.push(`update:${value}`),
        'onClose': () => order.push('close'),
      },
      attachTo: host,
      slots: { default: card as never },
    })
    await flushPromises()

    wrapper.findComponent(VDialog).vm.$emit('update:modelValue', true)
    expect(wrapper.emitted('close')).toBeUndefined()

    wrapper.findComponent(VDialog).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('close')).toHaveLength(1)
    ;(document.body.querySelector('.card-overlay') as HTMLElement).click()
    expect(wrapper.emitted('close')).toHaveLength(2)
    expect(order).toEqual(['update:true', 'update:false', 'close', 'update:false', 'close'])

    await wrapper.setProps({ persistent: true })
    ;(document.body.querySelector('.card-overlay') as HTMLElement).click()
    expect(wrapper.emitted('close')).toHaveLength(2)
    expect(wrapper.emitted('update:model-value')).toHaveLength(3)
    wrapper.unmount()
    host.remove()
  })

  // Pitfall: the scope id of the file that writes the card belongs to the card in the slot, not to the `.v-overlay` root
  // (Vuetify takes it from the component that renders the dialog, here `AppDialog` without a style). Rules of a consumer must start at its card.
  it('puts the scope id of the consumer on the slot content and not on the .v-overlay root', async () => {
    const consumer = {
      __scopeId: 'data-v-consumer',
      render () {
        return h(AppDialog, { modelValue: true }, { default: withCtx(() => [h('div', { 'class': 'card', 'data-testid': 'inner' }, 'card')]), _: 1 })
      },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(consumer as never, { attachTo: host })
    await flushPromises()

    expect(document.body.querySelector('[data-testid="inner"]')?.hasAttribute('data-v-consumer')).toBe(true)
    expect(document.body.querySelector('.v-overlay')?.hasAttribute('data-v-consumer')).toBe(false)
    wrapper.unmount()
    host.remove()
  })

  it('emits after-leave from the dialog', async () => {
    const wrapper = await mountKit(AppDialog, { props: { modelValue: true }, slots: { default: card as never } })
    wrapper.findComponent(VDialog).vm.$emit('afterLeave')
    expect(wrapper.emitted('after-leave')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders the slot and passes data-testid, class and width through to the dialog', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(AppDialog, {
      props: { modelValue: true },
      attrs: { 'data-testid': 'dlg', 'class': 'extra', 'width': '320px' },
      attachTo: host,
      slots: { default: card as never },
    })
    await flushPromises()

    expect(document.body.querySelector('[data-testid="inner"]')).not.toBeNull()
    expect(document.body.querySelector('[data-testid="dlg"]')?.classList.contains('extra')).toBe(true)
    expect((document.body.querySelector('.v-overlay__content') as HTMLElement).style.width).toBe('320px')
    wrapper.unmount()
    host.remove()
  })

  it('holds overflow-y-hidden on <html> only for scrollLock mobile on a small screen', async () => {
    smAndDown.value = true
    const plain = await mountKit(AppDialog, { props: { modelValue: true }, slots: { default: card as never } })
    await nextTick()
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
    plain.unmount()

    const locked = await mountKit(AppDialog, { props: { modelValue: true, scrollLock: 'mobile' }, slots: { default: card as never } })
    await nextTick()
    expect(html.classList.contains('overflow-y-hidden')).toBe(true)
    await locked.setProps({ modelValue: false })
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
    locked.unmount()
    expect(html.classList.contains('overflow-y-hidden')).toBe(false)
  })

  it('passes transition false through to the dialog (kit-dialog-onboarding)', async () => {
    const wrapper = await mountKit(AppDialog, { props: { modelValue: true, transition: false }, slots: { default: card as never } })
    expect(wrapper.findComponent(VDialog).props('transition')).toBe(false)
    wrapper.unmount()
  })
})
