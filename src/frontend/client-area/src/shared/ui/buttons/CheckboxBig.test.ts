import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import CheckboxBig from './CheckboxBig.vue'

describe('CheckboxBig', () => {
  it('renders the title and the checked modifier', async () => {
    const wrapper = await mountKit(CheckboxBig, { props: { checked: true, name: 'group', title: 'Daily' } })
    expect(wrapper.get('.checkbox-big__title').text()).toBe('Daily')
    expect(wrapper.get('.checkbox-big').classes()).toContain('checkbox-big--checked')
    wrapper.unmount()
  })

  it('is a radio button of its named group, checked from the prop', async () => {
    const wrapper = await mountKit(CheckboxBig, { props: { checked: true, name: 'frequency', title: 'Daily', value: 'daily' } })
    const input = wrapper.get('input[type=radio]')
    expect(input.attributes('name')).toBe('frequency')
    expect(input.attributes('value')).toBe('daily')
    expect((input.element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('keeps the radio focusable through the keyboard instead of dropping it from the tab order', async () => {
    const wrapper = await mountKit(CheckboxBig, { props: { name: 'group', title: 'Weekly' } })
    const input = wrapper.get('input[type=radio]').element as HTMLInputElement
    expect(input.tabIndex).toBe(0)
    expect(input.disabled).toBe(false)
    expect(input.getAttribute('tabindex')).toBeNull()
    wrapper.unmount()
  })

  it('names the radio after the card (the label wraps the control)', async () => {
    const wrapper = await mountKit(CheckboxBig, { props: { name: 'group', title: 'Monthly' } })
    expect(wrapper.element.tagName).toBe('LABEL')
    expect(wrapper.element.contains(wrapper.get('input[type=radio]').element)).toBe(true)
    wrapper.unmount()
  })

  it('emits check once with the inverted state when the card is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(CheckboxBig, { props: { checked: false, name: 'group', title: 'Weekly' }, attachTo: host })
    ;(wrapper.get('.checkbox-big').element as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('check')).toEqual([[true]])
    wrapper.unmount()
    host.remove()
  })

  it('emits check once when the radio itself is activated (keyboard Space)', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(CheckboxBig, { props: { checked: false, name: 'group', title: 'Weekly' }, attachTo: host })
    ;(wrapper.get('input[type=radio]').element as HTMLInputElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('check')).toEqual([[true]])
    wrapper.unmount()
    host.remove()
  })

  it('renders the default slot as the icon area', async () => {
    const wrapper = await mountKit(CheckboxBig, {
      props: { name: 'group', title: 'Monthly' },
      slots: { default: '<span class="probe-icon">icon</span>' },
    })
    expect(wrapper.get('.checkbox-big__icon .probe-icon').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the click handler of a parent listener on the root, once (backups usage before the radio)', async () => {
    let clicks = 0
    const wrapper = await mountKit(CheckboxBig, {
      props: { name: 'group', title: 'Mon', onClick: () => {
        clicks += 1
      } },
    })
    await wrapper.get('.checkbox-big').trigger('click')
    expect(clicks).toBe(1)
    wrapper.unmount()
  })
})
