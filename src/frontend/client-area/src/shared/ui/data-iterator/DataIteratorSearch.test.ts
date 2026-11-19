import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DataIteratorSearch from './DataIteratorSearch.vue'

describe('DataIteratorSearch', () => {
  const width = window.innerWidth
  afterEach(() => {
    vi.useRealTimers()
    window.innerWidth = width
  })

  it('renders an outlined field with the search placeholder and icon', async () => {
    const wrapper = await mountKit(DataIteratorSearch, { props: { modelValue: '' } })
    expect(wrapper.find('.v-field--variant-outlined').exists()).toBe(true)
    expect(wrapper.get('input').attributes('placeholder')).toBe('form.placeholder.search')
    expect(wrapper.find('.v-field__prepend-inner .v-icon svg').exists()).toBe(true)
    expect(wrapper.find('.full-width-input').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits the typed value after a 300 ms debounce', async () => {
    // Legacy debounced with `_.debounce(..., 300)`.
    vi.useFakeTimers()
    const wrapper = await mountKit(DataIteratorSearch, { props: { modelValue: '' } })
    const input = wrapper.get('input')
    await input.setValue('a')
    await input.setValue('ab')
    vi.advanceTimersByTime(299)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([['ab']])
    wrapper.unmount()
  })

  it('debounces per instance, not through a shared timer', async () => {
    // Plan: 300 ms debounce per instance (legacy shared one lodash debounce across instances)
    vi.useFakeTimers()
    const first = await mountKit(DataIteratorSearch, { props: { modelValue: '' } })
    const second = await mountKit(DataIteratorSearch, { props: { modelValue: '' } })
    await first.get('input').setValue('one')
    vi.advanceTimersByTime(100)
    await second.get('input').setValue('two')
    vi.advanceTimersByTime(200)
    expect(first.emitted('update:modelValue')).toEqual([['one']])
    expect(second.emitted('update:modelValue')).toBeUndefined()
    vi.advanceTimersByTime(100)
    expect(second.emitted('update:modelValue')).toEqual([['two']])
    first.unmount()
    second.unmount()
  })

  it('drops a pending emit and clears the field when resetKey changes, even if the model stays the same', async () => {
    vi.useFakeTimers()
    const wrapper = await mountKit(DataIteratorSearch, { props: { modelValue: '', resetKey: 'a' } })
    await wrapper.get('input').setValue('x')
    await wrapper.setProps({ resetKey: 'b' })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    vi.advanceTimersByTime(500)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('puts ariaLabel on the input', async () => {
    const wrapper = await mountKit(DataIteratorSearch, { props: { modelValue: '', ariaLabel: 'Find' } })
    expect(wrapper.get('input').attributes('aria-label')).toBe('Find')
    wrapper.unmount()
  })

  it('cancels a pending emit on unmount', async () => {
    vi.useFakeTimers()
    const wrapper = await mountKit(DataIteratorSearch, { props: { modelValue: '' } })
    await wrapper.get('input').setValue('x')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('collapses to an icon under smAndDown with fullWidthSearch and opens on click', async () => {
    window.innerWidth = 500
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(DataIteratorSearch, {
      props: { modelValue: '', fullWidthSearch: true },
      attachTo: host,
    })
    const field = wrapper.get('.v-input')
    expectLegacyClasses(field.element, ['full-width-input'])
    expect(field.classes()).not.toContain('full-width-input--open')
    await wrapper.get('.v-field').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.v-input').classes()).toContain('full-width-input--open')
    expect(document.activeElement).toBe(wrapper.get('input').element)
    wrapper.unmount()
    host.remove()
  })

  it('stays a plain field on a wide screen even with fullWidthSearch', async () => {
    // The condition is `smAndDown && fullWidthSearch`.
    const wrapper = await mountKit(DataIteratorSearch, { props: { modelValue: '', fullWidthSearch: true } })
    expect(wrapper.find('.full-width-input').exists()).toBe(false)
    wrapper.unmount()
  })
})
