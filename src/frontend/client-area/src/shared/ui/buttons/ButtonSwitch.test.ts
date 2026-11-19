import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import ButtonSwitch from './ButtonSwitch.vue'

describe('ButtonSwitch', () => {
  it('renders the legacy switch-container class contract', async () => {
    const wrapper = await mountKit(ButtonSwitch, {
      props: { modelValue: true, attachId: 'sw-1' },
    })
    expectLegacyClasses(wrapper.element, ['switch-container', 'pl-1', 'd-flex', 'justify-center', 'ml-2'])
    expect(wrapper.find('.v-switch').exists()).toBe(true)
    wrapper.unmount()
  })

  it('uses justify-start when start is set', async () => {
    const wrapper = await mountKit(ButtonSwitch, { props: { start: true } })
    expectLegacyClasses(wrapper.element, ['justify-start'])
    wrapper.unmount()
  })

  // Characterization of the DOM: written on the code before `ButtonSwitch` became a preset of `AppSwitch`, kept unchanged after.
  // The generated input id (`switch-v-N`) depends on the test order, so it is stripped.
  const dom = (html: string) => normalizeHtml(html).replace(/ id="switch-v-\d+"/g, '')

  it('keeps its DOM with a model, an attach id and an aria label', async () => {
    const wrapper = await mountKit(ButtonSwitch, { props: { modelValue: true, attachId: 'sw-1', ariaLabel: 'Under attack' } })
    expect(dom(wrapper.html())).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input checked="" id="sw-1" aria-disabled="false" aria-label="Under attack" type="checkbox" value="true"><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })

  it('keeps its DOM when disabled, loading and aligned to the start', async () => {
    const wrapper = await mountKit(ButtonSwitch, { props: { start: true, disabled: true, loading: true } })
    expect(dom(wrapper.html())).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-start"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-input--disabled v-switch v-switch--flat v-switch--size-default v-switch--loading mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--disabled v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input disabled="" aria-disabled="true" type="checkbox" value="true"><div class="v-switch__thumb v-switch__thumb--filled"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"><div class="v-switch__loader"><div class="v-progress-circular v-progress-circular--indeterminate v-theme--light text-primary" style="width: 16px; height: 16px; --v-progress-reveal-duration: 900ms;" role="progressbar" aria-valuemin="0" aria-valuemax="100" active="true"><svg></svg></div></div></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })

  it('keeps its DOM without a model', async () => {
    const wrapper = await mountKit(ButtonSwitch, { props: { modelValue: false } })
    expect(dom(wrapper.html())).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })

  it('emits click on the container and leaves the input to the prop', async () => {
    const wrapper = await mountKit(ButtonSwitch, { props: { modelValue: false } })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).checked).toBe(false)
    await wrapper.find('.switch-container').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect((input.element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })

  // One look for every consumer: no per-screen margin or disabled look classes.
  it('renders the same container classes for every consumer', async () => {
    const plain = await mountKit(ButtonSwitch, { props: {} })
    expect(plain.attributes('class')).toBe('switch-container pl-1 d-flex justify-center ml-2')
    plain.unmount()
    const disabled = await mountKit(ButtonSwitch, { props: { disabled: true, loading: true } })
    expect(disabled.attributes('class')).toBe('switch-container pl-1 d-flex justify-center ml-2')
    disabled.unmount()
  })
})
