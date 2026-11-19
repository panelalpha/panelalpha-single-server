import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import NewItemSearchCard from './NewItemSearchCard.vue'

const tags = [
  { label: 'blog', value: 'blog' },
  { label: 'news', value: 'news' },
]

describe('NewItemSearchCard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the search field with its placeholder and the tag chips after the tags label', async () => {
    const wrapper = await mountKit(NewItemSearchCard, {
      props: { modelValue: '', tags, placeholder: 'form.placeholder.search', tagsLabel: 'heading.instance.plugin.add.tags' },
    })

    expect(wrapper.get('input').attributes('placeholder')).toBe('form.placeholder.search')
    expect(wrapper.text()).toContain('heading.instance.plugin.add.tags')
    expect(wrapper.findAll('.new-item-search-tag')).toHaveLength(2)
    wrapper.unmount()
  })

  it('emits the typed term only after a 300 ms debounce', async () => {
    // Legacy debounced with `_.debounce(..., 300)`.
    vi.useFakeTimers()
    const wrapper = await mountKit(NewItemSearchCard, { props: { modelValue: '', tags } })
    const input = wrapper.get('input')

    await input.setValue('a')
    await input.setValue('ab')
    vi.advanceTimersByTime(299)
    expect(wrapper.emitted('update:model-value')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('update:model-value')).toEqual([['ab']])
    wrapper.unmount()
  })

  it('emits a tag at once, without the debounce, and drops a pending typed term', async () => {
    // The chip emits straight away.
    vi.useFakeTimers()
    const wrapper = await mountKit(NewItemSearchCard, { props: { modelValue: '', tags } })

    await wrapper.get('input').setValue('typed')
    await wrapper.get('.new-item-search-tag').trigger('click')

    expect(wrapper.emitted('search')).toEqual([['blog']])
    vi.advanceTimersByTime(300)
    expect(wrapper.emitted('update:model-value')).toBeUndefined()
    wrapper.unmount()
  })

  it('takes focus 200 ms after mount through the template ref', async () => {
    // A ref replaces the global querySelector.
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(NewItemSearchCard, { props: { modelValue: '', tags }, attachTo: host })
    const input = wrapper.get('input').element

    vi.advanceTimersByTime(199)
    expect(document.activeElement).not.toBe(input)
    vi.advanceTimersByTime(1)
    expect(document.activeElement).toBe(input)

    wrapper.unmount()
    host.remove()
  })

  it('follows the host term when it changes from outside (a cleared filter)', async () => {
    const wrapper = await mountKit(NewItemSearchCard, { props: { modelValue: 'seo', tags } })
    expect(wrapper.get('input').element).toHaveProperty('value', 'seo')

    await wrapper.setProps({ modelValue: '' })

    expect(wrapper.get('input').element).toHaveProperty('value', '')
    wrapper.unmount()
  })
})
