import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { VSelect } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import SettingsSelect from './SettingsSelect.vue'

// DOM of `SettingsSelect` = DOM of the bare `v-select` the settings forms had. Generated ids depend on the test order.
const dom = (html: string) => normalizeHtml(html).replace(/ (id|for|aria-describedby|aria-labelledby)="input-[^"]*"/g, '')

async function render (node: () => ReturnType<typeof h>) {
  const wrapper = await mountKit(defineComponent({ render: node }))
  const html = dom(wrapper.html())
  wrapper.unmount()
  return html
}

const RAW = { density: 'compact', singleLine: true, variant: 'outlined' }

describe('SettingsSelect', () => {
  it('renders the DOM of a bare v-select: settings language', async () => {
    const raw = { ...RAW, 'class': 'v-input--md settings-language', 'items': ['en', 'pl'], 'modelValue': 'en', 'data-testid': 'settings-field-language' }
    const app = { 'class': 'settings-language', 'items': ['en', 'pl'], 'modelValue': 'en', 'data-testid': 'settings-field-language' }
    const expected = await render(() => h(VSelect, raw))
    const actual = await render(() => h(SettingsSelect, app))
    expect(actual).toBe(expected)
    expect(actual).toContain('v-select')
  })

  it('renders the DOM of a bare v-select: backup select with hide-details and rules', async () => {
    const raw = { ...RAW, class: 'v-input--md backup-day-of-month', hideDetails: 'auto', validateOn: 'eager', items: [1, 2], modelValue: 1 }
    const app = { 'class': 'backup-day-of-month', 'hide-details': 'auto', 'validate-on': 'eager', 'items': [1, 2], 'modelValue': 1 }
    const expected = await render(() => h(VSelect, raw))
    const actual = await render(() => h(SettingsSelect, app))
    expect(actual).toBe(expected)
  })

  it('renders the DOM of a bare v-select: selection slot', async () => {
    const selection = ({ item }: { item: { title: string } }) => h('span', { class: 'sel' }, item.title)
    const base = { items: [{ title: 'English', value: 'en' }], modelValue: 'en' }
    const expected = await render(() => h(VSelect, { ...RAW, class: 'v-input--md', ...base }, { selection }))
    const actual = await render(() => h(SettingsSelect, base, { selection }))
    expect(actual).toBe(expected)
    expect(actual).toContain('sel')
  })

  it('updates the model of the parent with v-model', async () => {
    const model = ref('en')
    const wrapper = await mountKit(defineComponent({
      render: () => h(SettingsSelect, {
        'items': ['en', 'pl'],
        'modelValue': model.value,
        'onUpdate:modelValue': (value: string) => {
          model.value = value
        },
      }),
    }))
    wrapper.findComponent(VSelect).vm.$emit('update:modelValue', 'pl')
    expect(model.value).toBe('pl')
    wrapper.unmount()
  })
})
