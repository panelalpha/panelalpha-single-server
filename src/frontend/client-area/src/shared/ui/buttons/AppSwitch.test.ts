import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { VSwitch } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import AppSwitch from './AppSwitch.vue'

// DOM of `AppSwitch` = DOM of the bare `v-switch` the consumers had. The generated input id depends on the test order.
const dom = (html: string) => normalizeHtml(html).replace(/ id="switch-v-\d+"/g, '')

async function render (node: () => ReturnType<typeof h>) {
  const wrapper = await mountKit(defineComponent({ render: node }))
  const html = dom(wrapper.html())
  wrapper.unmount()
  return html
}

describe('AppSwitch', () => {
  const thumb = () => h('span', { class: 'thumb-icon' }, 'T')

  const cases: Array<{
    name: string
    raw: Record<string, unknown>
    app: Record<string, unknown>
    kind?: 'toggle' | 'inset'
    slots?: Record<string, () => ReturnType<typeof h>>
  }> = [
    {
      name: 'toggle with the default white thumb (ButtonSwitch)',
      kind: 'toggle',
      raw: { 'color': 'primary', 'flat': true, 'hideDetails': true, 'thumbColor': 'var(--v-white-base)', 'modelValue': true, 'class': 'mt-0 pt-0', 'id': 'sw-1', 'aria-label': 'x' },
      app: { 'modelValue': true, 'class': 'mt-0 pt-0', 'id': 'sw-1', 'aria-label': 'x' },
    },
    {
      name: 'toggle without flat (Style Manager)',
      kind: 'toggle',
      raw: { 'color': 'primary', 'hideDetails': true, 'thumbColor': 'var(--v-white-base)', 'modelValue': true, 'class': 'my-0 py-0 mr-4', 'data-testid': 'sw' },
      app: { 'flat': false, 'modelValue': true, 'class': 'my-0 py-0 mr-4', 'data-testid': 'sw' },
    },
    {
      name: 'toggle with a thumb slot (DarkModeSwitch)',
      kind: 'toggle',
      raw: { color: 'primary', flat: true, hideDetails: true, thumbColor: 'var(--v-white-base)', modelValue: false, class: 'dark-mode-switch v-input--switch mt-0 pt-0 text-primary' },
      app: { modelValue: false, class: 'dark-mode-switch v-input--switch mt-0 pt-0 text-primary' },
      slots: { thumb },
    },
    {
      name: 'inset with color (Git)',
      kind: 'inset',
      raw: { color: 'primary', inset: true, hideDetails: true, thumbColor: 'var(--v-white-base)', disabled: true, loading: true, modelValue: true, class: 'ma-0 git-switch' },
      app: { color: 'primary', disabled: true, loading: true, modelValue: true, class: 'ma-0 git-switch' },
    },
    {
      name: 'inset with a label (Backup store)',
      kind: 'inset',
      raw: { color: 'primary', inset: true, hideDetails: true, thumbColor: 'var(--v-white-base)', label: 'Use path style', modelValue: false, class: 'mt-4 store-field' },
      app: { label: 'Use path style', modelValue: false, class: 'mt-4 store-field' },
    },
    {
      name: 'inset with density, hide-details auto and validate-on (BasicModalField)',
      kind: 'inset',
      raw: { color: 'primary', inset: true, thumbColor: 'var(--v-white-base)', density: 'compact', hideDetails: 'auto', validateOn: 'blur', modelValue: true, class: 'pa-0 ma-0' },
      app: { 'density': 'compact', 'hide-details': 'auto', 'validate-on': 'blur', 'modelValue': true, 'class': 'pa-0 ma-0' },
    },
    {
      name: 'no kind',
      raw: { hideDetails: true, modelValue: true },
      app: { 'hide-details': true, 'modelValue': true },
    },
  ]

  it.each(cases)('renders the DOM of a bare v-switch: $name', async ({ raw, app, kind, slots }) => {
    const expected = await render(() => h(VSwitch, raw, slots ?? {}))
    const actual = await render(() => h(AppSwitch, { kind, ...app }, slots ?? {}))
    expect(actual).toBe(expected)
    expect(actual).toContain('v-switch')
  })

  it('renders the thumb slot content', async () => {
    const html = await render(() => h(AppSwitch, { kind: 'toggle', modelValue: false }, { thumb }))
    expect(html).toContain('thumb-icon')
  })

  it('has the v-switch as its only root and lets class, data-testid, id and aria-label fall through', async () => {
    const wrapper = await mountKit(AppSwitch, { props: { kind: 'toggle' }, attrs: { 'class': 'mine', 'data-testid': 'sw', 'id': 'sw-id', 'aria-label': 'Label' } })
    expect(wrapper.element.classList.contains('v-switch')).toBe(true)
    expect(wrapper.element.classList.contains('mine')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('sw')
    expect(wrapper.find('input').attributes('id')).toBe('sw-id')
    expect(wrapper.find('input').attributes('aria-label')).toBe('Label')
    wrapper.unmount()
  })

  it('updates the model of the parent with v-model', async () => {
    const model = ref(false)
    const wrapper = await mountKit(defineComponent({
      render: () => h(AppSwitch, { 'kind': 'inset', 'modelValue': model.value, 'onUpdate:modelValue': (value: boolean | null) => {
        model.value = Boolean(value)
      } }),
    }))
    await wrapper.find('input').setValue(true)
    expect(model.value).toBe(true)
    wrapper.unmount()
  })

  it('behaves like a bare v-switch when :model-value has no update listener', async () => {
    const outcome = async (make: () => ReturnType<typeof h>) => {
      const wrapper = await mountKit(defineComponent({ render: make }))
      const input = wrapper.find('input')
      await input.setValue(true)
      const checked = (input.element as HTMLInputElement).checked
      wrapper.unmount()
      return checked
    }
    const raw = await outcome(() => h(VSwitch, { color: 'primary', flat: true, hideDetails: true, modelValue: false }))
    const app = await outcome(() => h(AppSwitch, { kind: 'toggle', modelValue: false }))
    expect(app).toBe(raw)
  })

  it('renders no slot wrappers when the consumer passes no slots', async () => {
    const html = await render(() => h(AppSwitch, { kind: 'toggle', modelValue: true }))
    expect(html).not.toContain('v-label')
  })
})
