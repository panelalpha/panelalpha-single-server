import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import ChoiceCardGrid from '@/views/onboarding/ui/ChoiceCardGrid.vue'
import { mountKit } from '@/test/mount-kit'

const cards = () => [h('div', { class: 'checkbox-big' }), h('div', { class: 'checkbox-big' })]

describe('ChoiceCardGrid', () => {
  it('wraps the option cards in the legacy selection box', async () => {
    const wrapper = await mountKit(ChoiceCardGrid, { slots: { default: cards as never } })
    expect(wrapper.classes()).toEqual(['selection-box'])
    expect(wrapper.findAll('.checkbox-big')).toHaveLength(2)
    wrapper.unmount()
  })

  it('is the radiogroup of the option cards, named by its heading', async () => {
    const wrapper = await mountKit(ChoiceCardGrid, {
      attrs: { 'aria-labelledby': 'step-title' },
      slots: { default: cards as never },
    })
    expect(wrapper.attributes('role')).toBe('radiogroup')
    expect(wrapper.attributes('aria-labelledby')).toBe('step-title')
    wrapper.unmount()
  })

  it('lays the cards in one column on request', async () => {
    const wrapper = await mountKit(ChoiceCardGrid, { props: { column: true }, slots: { default: cards as never } })
    expect(wrapper.classes()).toEqual(['selection-box', 'selection-box--column'])
    wrapper.unmount()
  })
})
