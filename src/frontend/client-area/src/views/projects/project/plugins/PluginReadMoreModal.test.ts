import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PluginReadMoreModal from './PluginReadMoreModal.vue'

// The Active / Disabled chip of the read-more card.
function item (status: string) {
  return { name: 'akismet', title: 'Akismet', slug: 'akismet', status, update: 'none', version: '5.0.0', description: 'Plugin' } as never
}

async function mountModal (status: string, isNew = false) {
  const wrapper = await mountKit(PluginReadMoreModal, {
    props: { item: item(status), modelValue: true, isNew },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PluginReadMoreModal status chip', () => {
  it('shows Active for the active plugin', async () => {
    const wrapper = await mountModal('active')
    expect(document.body.textContent).toContain('message.status.active')
    expect(document.body.textContent).not.toContain('message.status.disabled')
    wrapper.unmount()
  })

  it('shows Disabled for an inactive plugin', async () => {
    const wrapper = await mountModal('inactive')
    expect(document.body.textContent).toContain('message.status.disabled')
    expect(document.body.textContent).not.toContain('message.status.active')
    wrapper.unmount()
  })

  it('shows no status chip for a catalogue plugin', async () => {
    const wrapper = await mountModal('inactive', true)
    expect(document.body.textContent).not.toContain('message.status.disabled')
    expect(document.body.textContent).not.toContain('message.status.active')
    wrapper.unmount()
  })
})
