import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VTooltip } from 'vuetify/components'
import { COPY_RESET_DELAY } from '@/shared/ui/buttons/use-copy-text'
import { mountKit } from '@/test/mount-kit'
import CopyRecordItem from './CopyRecordItem.vue'

describe('CopyRecordItem', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    // Only the clipboard: Vuetify reads the rest of `navigator` when it is created.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('renders the label and the value', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { label: 'Name', value: 'example.com' } })
    expect(wrapper.get('li.record-box-list-item').text()).toContain('Name: ')
    expect(wrapper.get('.record-box-copy-element').text()).toBe('example.com')
    wrapper.unmount()
  })

  it('renders no label without a label prop', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'example.com' } })
    expect(wrapper.get('li').text()).toBe('example.com')
    expect(wrapper.get('li').text()).not.toContain(':')
    wrapper.unmount()
  })

  it('opens the tooltip only on hover and passes the location', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'v', location: 'top' } })
    const tooltip = wrapper.getComponent(VTooltip)
    expect(tooltip.props('modelValue')).toBe(false)
    expect(tooltip.props('location')).toBe('top')

    await wrapper.get('li').trigger('mouseover')
    expect(tooltip.props('modelValue')).toBe(true)

    await wrapper.get('li').trigger('mouseleave')
    expect(tooltip.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('keeps the tooltip open when it asks to close (a click on the row), as V2 `:value`; only mouseleave closes it', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'v' } })
    const tooltip = wrapper.getComponent(VTooltip)
    await wrapper.get('li').trigger('mouseover')
    expect(tooltip.props('modelValue')).toBe(true)

    tooltip.vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()
    expect(tooltip.props('modelValue')).toBe(true)

    await wrapper.get('li').trigger('mouseleave')
    expect(tooltip.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('defaults the tooltip location to bottom', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'v' } })
    expect(wrapper.getComponent(VTooltip).props('location')).toBe('bottom')
    wrapper.unmount()
  })

  it('copies the value on click and returns to the copy label after mouseleave', async () => {
    vi.useFakeTimers()
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'v=spf1 -all' } })
    await wrapper.get('li').trigger('click')
    await vi.advanceTimersByTimeAsync(0)

    expect(writeText).toHaveBeenCalledWith('v=spf1 -all')
    // The overlay content is teleported out of the wrapper.
    expect(document.body.textContent).toContain('tooltip.copied')

    // Hover again before the reset delay ends: the row still reads `copied`, then turns back to `copy` once it ends.
    await wrapper.get('li').trigger('mouseleave')
    await wrapper.get('li').trigger('mouseover')
    await vi.advanceTimersByTimeAsync(COPY_RESET_DELAY - 1)
    expect(document.body.textContent).toContain('tooltip.copied')

    await vi.advanceTimersByTimeAsync(1)
    expect(document.body.textContent).toContain('tooltip.copy')
    expect(document.body.textContent).not.toContain('tooltip.copied')
    wrapper.unmount()
  })

  it('makes the value a focusable button with an accessible name', async () => {
    const withLabel = await mountKit(CopyRecordItem, { props: { label: 'Name', value: 'example.com' } })
    const element = withLabel.get('.record-box-copy-element')
    expect(element.attributes('role')).toBe('button')
    expect(element.attributes('tabindex')).toBe('0')
    expect(element.attributes('aria-label')).toBe('tooltip.copy Name: example.com')
    expect(withLabel.get('li').attributes('role')).toBeUndefined()
    withLabel.unmount()

    const withoutLabel = await mountKit(CopyRecordItem, { props: { value: 'example.com' } })
    expect(withoutLabel.get('.record-box-copy-element').attributes('aria-label')).toBe('tooltip.copy: example.com')
    withoutLabel.unmount()
  })

  it('copies the value with Enter and with Space', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'example.com' } })
    const tooltip = wrapper.getComponent(VTooltip)
    const element = wrapper.get('.record-box-copy-element')

    await element.trigger('keydown', { key: 'Enter' })
    expect(writeText).toHaveBeenCalledWith('example.com')
    expect(tooltip.props('modelValue')).toBe(true)
    await element.trigger('blur')

    writeText.mockClear()
    await element.trigger('keydown', { key: ' ' })
    expect(writeText).toHaveBeenCalledWith('example.com')
    expect(tooltip.props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('ignores the repeats of a held key', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'example.com' } })
    const element = wrapper.get('.record-box-copy-element')

    await element.trigger('keydown', { key: 'Enter' })
    await element.trigger('keydown', { key: 'Enter', repeat: true })
    await element.trigger('keydown', { key: 'Enter', repeat: true })
    expect(writeText).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('closes the tooltip and resets on blur', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'example.com' } })
    const tooltip = wrapper.getComponent(VTooltip)
    const element = wrapper.get('.record-box-copy-element')

    await element.trigger('keydown', { key: 'Enter' })
    expect(tooltip.props('modelValue')).toBe(true)

    await element.trigger('blur')
    expect(tooltip.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('keeps a single copy per mouse click', async () => {
    const wrapper = await mountKit(CopyRecordItem, { props: { value: 'example.com' } })
    await wrapper.get('li').trigger('click')
    expect(writeText).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
