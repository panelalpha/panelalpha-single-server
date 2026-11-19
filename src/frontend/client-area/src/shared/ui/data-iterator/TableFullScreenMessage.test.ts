import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import TableFullScreenMessage from './TableFullScreenMessage.vue'

describe('TableFullScreenMessage', () => {
  it('renders the legacy class contract, copy and default max width', async () => {
    const wrapper = await mountKit(TableFullScreenMessage, {
      props: { title: 'Nothing here', desc: 'Add something' },
      slots: { image: '<i class="img" />' },
    })
    expectLegacyClasses(wrapper.element, ['no-data', 'py-12', 'px-12'])
    expectLegacyClasses(wrapper.get('.no-data__img').element, ['no-data__img', 'mb-6'])
    expect(wrapper.find('.img').exists()).toBe(true)
    expect(wrapper.get('.no-data__content').attributes('style')).toContain('max-width: 560px')
    expectLegacyClasses(wrapper.get('h3').element, ['no-data__title', 'text--heading'])
    expect(wrapper.get('h3').text()).toBe('Nothing here')
    expectLegacyClasses(wrapper.get('p').element, ['no-data__desc', 'mt-4', 'mb-0', 'p-1', 'font-weight-light', 'text-center'])
    expect(wrapper.get('p').text()).toBe('Add something')
    // no `action` slot: no action wrapper
    expect(wrapper.find('.no-data__action').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the action wrapper only with an action slot and honours maxWidth', async () => {
    const wrapper = await mountKit(TableFullScreenMessage, {
      props: { title: 't', desc: 'd', maxWidth: '300px' },
      slots: { action: '<button class="act">go</button>' },
    })
    expect(wrapper.get('.no-data__content').attributes('style')).toContain('max-width: 300px')
    expectLegacyClasses(wrapper.get('.no-data__action').element, ['no-data__action', 'mt-6'])
    expect(wrapper.get('.no-data__action .act').text()).toBe('go')
    wrapper.unmount()
  })
})
