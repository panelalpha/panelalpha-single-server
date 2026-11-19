import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountKit } from '@/test/mount-kit'
import LabeledField from './LabeledField.vue'

describe('LabeledField', () => {
  it('renders the label above the slot', async () => {
    const wrapper = await mountKit(defineComponent({
      render: () => h(LabeledField, { label: 'Name' }, { default: () => h('input', { class: 'ctl' }) }),
    }))
    const label = wrapper.find('label.labeled-field__label')
    expect(label.text()).toBe('Name')
    expect(label.classes()).toEqual(expect.arrayContaining(['base--text', 'p-3']))
    expect(label.element.nextElementSibling?.classList.contains('ctl')).toBe(true)
    expect(wrapper.element.classList.contains('labeled-field')).toBe(true)
    expect(label.attributes('for')).toBeUndefined()
    wrapper.unmount()
  })

  it('puts the label test id on the label only when given', async () => {
    const withId = await mountKit(LabeledField, { props: { label: 'X', labelTestid: 'lbl' } })
    expect(withId.find('label').attributes('data-testid')).toBe('lbl')
    withId.unmount()

    const withoutId = await mountKit(LabeledField, { props: { label: 'X' } })
    expect(withoutId.find('label').attributes('data-testid')).toBeUndefined()
    withoutId.unmount()
  })

  it('appends the label-append slot after the text', async () => {
    const wrapper = await mountKit(defineComponent({
      render: () => h(LabeledField, { label: 'Name' }, {
        'default': () => h('input'),
        'label-append': () => h('span', { class: 'help' }, '?'),
      }),
    }))
    const label = wrapper.find('label.labeled-field__label')
    expect(label.find('.help').exists()).toBe(true)
    expect(label.element.textContent ?? '').toMatch(/^Name\s+\?$/)
    wrapper.unmount()
  })

  it('lets class fall through to the root', async () => {
    const wrapper = await mountKit(LabeledField, { props: { label: 'X' }, attrs: { class: 'mt-4' } })
    expect(wrapper.element.classList.contains('labeled-field')).toBe(true)
    expect(wrapper.element.classList.contains('mt-4')).toBe(true)
    wrapper.unmount()
  })
})
