import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import Checkbox from './Checkbox.vue'

describe('Checkbox', () => {
  it('renders the unchecked class contract', async () => {
    // Root .checkbox, v-checkbox without active
    const wrapper = await mountKit(Checkbox, { props: { modelValue: false, label: 'Accept' } })
    expectLegacyClasses(wrapper.element, ['checkbox'])
    const input = wrapper.get('.v-input.v-checkbox')
    expect(input.classes()).not.toContain('active')
    expect(input.classes()).not.toContain('labellg')
    // [class~='checkbox'] (_data-iterator.scss) reaches the V4 selection control
    expectLegacyClasses(wrapper.get('.checkbox .v-selection-control').element, ['v-selection-control'])
    expect(wrapper.find('.v-selection-control__wrapper').exists()).toBe(true)
    expect(wrapper.get('.v-label').text()).toBe('Accept')
    wrapper.unmount()
  })

  it('adds the dark-surface class only when dark is set', async () => {
    const plain = await mountKit(Checkbox, { props: { modelValue: false } })
    expect(plain.get('.checkbox').classes()).not.toContain('checkbox--dark')
    plain.unmount()

    const dark = await mountKit(Checkbox, { props: { modelValue: false, dark: true } })
    expect(dark.get('.checkbox').classes()).toContain('checkbox--dark')
    dark.unmount()
  })

  it('adds active and labellg when checked', async () => {
    const wrapper = await mountKit(Checkbox, { props: { modelValue: true, labellg: true } })
    expectLegacyClasses(wrapper.get('.v-input.v-checkbox').element, ['active', 'labellg'])
    expectLegacyClasses(wrapper.get('.v-selection-control').element, ['v-selection-control--dirty'])
    wrapper.unmount()
  })

  // A box without a visible label (the card and row selection boxes) takes its name from `aria-label`, which the
  // selection control puts on the `<input>` a screen reader reads (a11y).
  it('puts the ariaLabel on the input, and nothing when it is not set', async () => {
    const labelled = await mountKit(Checkbox, { props: { modelValue: false, ariaLabel: 'Select fx25a' } })
    expect(labelled.get('input').attributes('aria-label')).toBe('Select fx25a')
    labelled.unmount()

    const plain = await mountKit(Checkbox, { props: { modelValue: false } })
    expect(plain.get('input').attributes('aria-label')).toBeUndefined()
    plain.unmount()
  })

  it('emits update:modelValue when the input is toggled', async () => {
    const wrapper = await mountKit(Checkbox, { props: { modelValue: false } })
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    wrapper.unmount()
  })

  it('shows the indeterminate check preview on hover only', async () => {
    // hover || indeterminate
    const wrapper = await mountKit(Checkbox, { props: { modelValue: false } })
    expect(wrapper.find('.v-selection-control--indeterminate').exists()).toBe(false)
    await wrapper.trigger('mouseover')
    expect(wrapper.find('.v-selection-control--indeterminate').exists()).toBe(true)
    await wrapper.trigger('mouseleave')
    expect(wrapper.find('.v-selection-control--indeterminate').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is indeterminate with the prop regardless of hover', async () => {
    const wrapper = await mountKit(Checkbox, { props: { modelValue: false, indeterminate: true } })
    expect(wrapper.find('.v-selection-control--indeterminate').exists()).toBe(true)
    wrapper.unmount()
  })

  it('marks the control disabled', async () => {
    const wrapper = await mountKit(Checkbox, { props: { modelValue: false, disabled: true } })
    expectLegacyClasses(wrapper.get('.v-selection-control').element, ['v-selection-control--disabled'])
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('adds v-input--checkbox-error for color="error"', async () => {
    const wrapper = await mountKit(Checkbox, { props: { modelValue: true, color: 'error' } })
    expectLegacyClasses(wrapper.get('.v-input.v-checkbox').element, ['active', 'v-input--checkbox-error'])
    wrapper.unmount()
  })

  it('renders the FormHelpIcon next to the label only with a tooltip', async () => {
    const without = await mountKit(Checkbox, { props: { modelValue: false, label: 'A' } })
    expect(without.find('.v-icon[class*="text-gray-darken-1"]').exists()).toBe(false)
    without.unmount()
    const withTip = await mountKit(Checkbox, { props: { modelValue: false, label: 'A', tooltip: 'Help' } })
    expect(withTip.find('.v-label .ms-2.d-inline-flex.align-center .v-icon').exists()).toBe(true)
    withTip.unmount()
  })

  it('forwards rules to the V4 checkbox validation', async () => {
    // :rules on v-checkbox
    const rules = [(v: unknown) => !!v || 'required']
    const wrapper = await mountKit(Checkbox, { props: { modelValue: false, rules } })
    const checkbox = wrapper.findComponent({ name: 'VCheckbox' }).vm as unknown as {
      validate: () => Promise<string[]>
    }
    expect(await checkbox.validate()).toEqual(['required'])
    await wrapper.setProps({ modelValue: true })
    expect(await checkbox.validate()).toEqual([])
    wrapper.unmount()
  })
})
