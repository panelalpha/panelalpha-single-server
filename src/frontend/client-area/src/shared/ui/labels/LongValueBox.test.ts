import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import LongValueBox from './LongValueBox.vue'

describe('LongValueBox', () => {
  it('shows the value with copy and more by default', async () => {
    const wrapper = await mountKit(LongValueBox, { props: { value: 'abc123' } })
    expect(wrapper.get('.value').text()).toBe('abc123')
    expect(wrapper.find('.copyButton').exists()).toBe(true)
    expect(wrapper.text()).toContain('button.more')
    wrapper.unmount()
  })

  it('hides copy and more when asked', async () => {
    const wrapper = await mountKit(LongValueBox, { props: { value: 'abc', canCopy: false, canExpand: false } })
    expect(wrapper.find('.copyButton').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('button.more')
    wrapper.unmount()
  })

  it('expands into a read-only textarea and collapses with close', async () => {
    const wrapper = await mountKit(LongValueBox, { props: { value: 'abc' } })
    await wrapper.findAll('button').find(button => button.text() === 'button.more')!.trigger('click')
    const textarea = wrapper.get('textarea')
    expect(textarea.element.value).toBe('abc')
    expect(textarea.attributes('readonly')).toBeDefined()
    await wrapper.findAll('button').find(button => button.text() === 'button.close')!.trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)
    wrapper.unmount()
  })

  it('collapses when the value changes', async () => {
    const wrapper = await mountKit(LongValueBox, { props: { value: 'abc' } })
    await wrapper.findAll('button').find(button => button.text() === 'button.more')!.trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(true)
    await wrapper.setProps({ value: 'def' })
    expect(wrapper.find('textarea').exists()).toBe(false)
    wrapper.unmount()
  })
})
