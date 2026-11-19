import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import DataIteratorPagination from './DataIteratorPagination.vue'

function shown (wrapper: Awaited<ReturnType<typeof mountKit>>): string {
  return wrapper.findAll('.v-pagination__list > li').map(li => li.text()).filter(Boolean).join(' ')
}

describe('DataIteratorPagination', () => {
  it('shows the Vuetify 2 page list with dots as text, not as buttons', async () => {
    // Legacy: `1 2 3 4 … 45 46 47 48` at the start, `1 … 4 5 6 7 8 … 48` in the middle (pagination-items.ts).
    const first = await mountKit(DataIteratorPagination, { props: { length: 48, modelValue: 1 } })
    expect(shown(first)).toBe('1 2 3 4 ... 45 46 47 48')
    expect(first.findAll('.v-pagination__more')).toHaveLength(1)
    expect(first.findAll('.v-pagination__more button')).toHaveLength(0)
    first.unmount()
    const middle = await mountKit(DataIteratorPagination, { props: { length: 48, modelValue: 6 } })
    expect(shown(middle)).toBe('1 ... 4 5 6 7 8 ... 48')
    expect(middle.findAll('.v-pagination__more')).toHaveLength(2)
    middle.unmount()
  })

  it('keeps the V4 classes and the ARIA of the pagination', async () => {
    const wrapper = await mountKit(DataIteratorPagination, { props: { length: 3, modelValue: 2 } })
    expect(wrapper.get('nav').attributes('role')).toBe('navigation')
    expect(wrapper.get('nav').classes()).toContain('v-pagination')
    const items = wrapper.findAll('.v-pagination__item')
    expect(items).toHaveLength(3)
    expect(items[1]!.classes()).toContain('v-pagination__item--is-active')
    expect(items[1]!.get('button').attributes('aria-current')).toBe('true')
    expect(items[0]!.get('button').attributes('aria-current')).toBe('false')
    expect(items[0]!.get('button').attributes('aria-label')).toMatch(/1/)
    expect(wrapper.get('.v-pagination__prev button').attributes('aria-label')).toBeTruthy()
    expect(wrapper.get('.v-pagination__next button').attributes('aria-label')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits the clicked page and steps with the arrows', async () => {
    const wrapper = await mountKit(DataIteratorPagination, { props: { length: 5, modelValue: 2 } })
    await wrapper.findAll('.v-pagination__item button')[3]!.trigger('click')
    await wrapper.get('.v-pagination__prev button').trigger('click')
    await wrapper.get('.v-pagination__next button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[4], [3], [4]])
    wrapper.unmount()
  })

  it('disables the arrow at each end and the page stays active with one page', async () => {
    const start = await mountKit(DataIteratorPagination, { props: { length: 3, modelValue: 1 } })
    expect(start.get('.v-pagination__prev button').attributes('disabled')).toBeDefined()
    expect(start.get('.v-pagination__next button').attributes('disabled')).toBeUndefined()
    start.unmount()
    const end = await mountKit(DataIteratorPagination, { props: { length: 3, modelValue: 3 } })
    expect(end.get('.v-pagination__next button').attributes('disabled')).toBeDefined()
    end.unmount()
    const single = await mountKit(DataIteratorPagination, { props: { length: 1, modelValue: 1 } })
    expect(single.get('.v-pagination__item button').attributes('disabled')).toBeUndefined()
    single.unmount()
  })

  it('changes the page with the Left and Right keys and not past the ends', async () => {
    const wrapper = await mountKit(DataIteratorPagination, { props: { length: 3, modelValue: 1 } })
    await wrapper.get('nav').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('nav').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toEqual([[2]])
    await wrapper.get('nav').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    wrapper.unmount()
  })
})
