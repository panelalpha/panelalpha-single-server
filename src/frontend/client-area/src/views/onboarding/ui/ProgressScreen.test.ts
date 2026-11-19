import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import ProgressScreen from '@/views/onboarding/ui/ProgressScreen.vue'
import { mountKit } from '@/test/mount-kit'

describe('ProgressScreen', () => {
  it('renders the full-screen progress card with its column around the content', async () => {
    const wrapper = await mountKit(ProgressScreen, { slots: { default: () => h('p', { 'data-testid': 'body' }, 'body') } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['v-card', 'installation-card', 'd-flex', 'align-center', 'mb-16']))

    const column = wrapper.find('.installation-card__content')
    expect(column.classes()).toEqual(expect.arrayContaining(['mx-auto', 'align-center', 'px-8', 'd-flex', 'flex-column', 'mt-8']))
    expect(column.find('[data-testid="body"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
