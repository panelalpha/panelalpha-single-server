import type { InstanceResource } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import TopBarTitle from './TopBarTitle.vue'

vi.mock('./SetYourDomainModal.vue', () => ({ default: { template: '<span />' } }))
vi.mock('./TopBarEditableTitle.vue', () => ({ default: { template: '<span />' } }))
vi.mock('@/entities/label/ui/InstanceLabels.vue', () => ({ default: { template: '<span />' } }))

function fakeInstance (): InstanceResource {
  return { id: 1, title: 'Blog', url: 'https://blog.example.com', isActive: true, labels: [] } as unknown as InstanceResource
}

describe('TopBarTitle', () => {
  it('shows the URL link with a copy button next to it (legacy TopBarTitle.vue:84)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = await mountKit(TopBarTitle, {
      props: { instance: fakeInstance(), fetching: false },
      global: { plugins: [pinia] },
    })

    const group = wrapper.get('.instance-domain-group')
    expect(group.get('[data-testid="instance-url"]').text()).toBe('https://blog.example.com')
    expect(group.find('button.copyButton').exists()).toBe(true)
    wrapper.unmount()
  })
})
