import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import DarkModeSwitch from './DarkModeSwitch.vue'

describe('DarkModeSwitch', () => {
  it('shows the sun icon in light mode and the moon icon in dark mode', async () => {
    const light = await mountKit(DarkModeSwitch, { props: { modelValue: false } })
    expect(light.find('.dark-mode-icon--sun').isVisible()).toBe(true)
    expect(light.find('.dark-mode-icon--moon').isVisible()).toBe(false)
    light.unmount()

    const dark = await mountKit(DarkModeSwitch, { props: { modelValue: true } })
    expect(dark.find('.dark-mode-icon--sun').isVisible()).toBe(false)
    expect(dark.find('.dark-mode-icon--moon').isVisible()).toBe(true)
    dark.unmount()
  })

  it('emits update:modelValue with the new value when toggled', async () => {
    const wrapper = await mountKit(DarkModeSwitch, { props: { modelValue: false } })
    const input = wrapper.find('input')
    const checkbox = input.element as HTMLInputElement
    checkbox.checked = true
    await input.trigger('input')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    wrapper.unmount()
  })

  it('passes host attributes to its single root element', async () => {
    const wrapper = await mountKit(DarkModeSwitch, {
      props: { modelValue: false },
      attrs: { 'data-testid': 'host-switch', 'class': 'mr-3' },
    })
    const root = wrapper.element as HTMLElement
    expect(root.dataset.testid).toBe('host-switch')
    expect(root.classList.contains('mr-3')).toBe(true)
    expect(root.classList.contains('dark-mode-switch')).toBe(true)
    wrapper.unmount()
  })
})

// Characterization of the DOM: written on the code with a raw `v-switch`, kept unchanged after it moved to `AppSwitch`.
describe('DarkModeSwitch DOM', () => {
  const dom = (html: string) => normalizeHtml(html).replace(/ id="switch-v-\d+"/g, '')
  const hasScopeId = (el: Element) => el.getAttributeNames().some(name => name.startsWith('data-v-'))

  it('keeps its DOM in light mode', async () => {
    const wrapper = await mountKit(DarkModeSwitch, { props: { modelValue: false } })
    expect(dom(wrapper.html())).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default dark-mode-switch v-input--switch mt-0 pt-0 text-primary"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb"><i class="v-icon notranslate v-theme--light text-gray-darken-1 dark-mode-icon--sun" style="font-size: 13px; height: 13px; width: 13px;" aria-hidden="true"><svg></svg></i><i class="v-icon notranslate v-theme--light text-primary dark-mode-icon--moon" style="font-size: 13px; height: 13px; width: 13px; display: none;" aria-hidden="true"><svg></svg></i></div></div></div></div></div></div>"`)
    expect(hasScopeId(wrapper.element)).toBe(true)
    wrapper.unmount()
  })

  it('keeps its DOM in dark mode', async () => {
    const wrapper = await mountKit(DarkModeSwitch, { props: { modelValue: true } })
    expect(dom(wrapper.html())).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default dark-mode-switch v-input--switch mt-0 pt-0 text-primary"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input checked="" aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><i class="v-icon notranslate v-theme--light text-gray-darken-1 dark-mode-icon--sun" style="font-size: 13px; height: 13px; width: 13px; display: none;" aria-hidden="true"><svg></svg></i><i class="v-icon notranslate v-theme--light text-primary dark-mode-icon--moon" style="font-size: 13px; height: 13px; width: 13px;" aria-hidden="true"><svg></svg></i></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })
})
