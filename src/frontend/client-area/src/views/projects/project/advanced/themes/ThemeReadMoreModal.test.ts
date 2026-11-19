import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ThemeReadMoreModal from './ThemeReadMoreModal.vue'

// The Active / Disabled chip of the read-more card.
function item (status: string) {
  return { name: 'astra', title: 'Astra', slug: 'astra', status, update: 'none', version: '4.0.0', description: 'Theme' } as never
}

async function mountModal (status: string, isNew = false) {
  const wrapper = await mountKit(ThemeReadMoreModal, {
    props: { item: item(status), instanceId: 7, modelValue: true, isNew },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('ThemeReadMoreModal status chip', () => {
  it('shows Active for the active theme', async () => {
    const wrapper = await mountModal('active')
    expect(document.body.textContent).toContain('message.status.active')
    expect(document.body.textContent).not.toContain('message.status.disabled')
    wrapper.unmount()
  })

  it('shows Disabled for an inactive theme', async () => {
    const wrapper = await mountModal('inactive')
    expect(document.body.textContent).toContain('message.status.disabled')
    expect(document.body.textContent).not.toContain('message.status.active')
    wrapper.unmount()
  })

  it('shows no status chip for a catalogue theme', async () => {
    const wrapper = await mountModal('inactive', true)
    expect(document.body.textContent).not.toContain('message.status.disabled')
    expect(document.body.textContent).not.toContain('message.status.active')
    wrapper.unmount()
  })
})
