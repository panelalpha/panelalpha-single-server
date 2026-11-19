import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { VTextField } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import PasswordField from './PasswordField.vue'

// DOM of `PasswordField` = DOM of the bare `v-text-field` the session screens had. Generated ids depend on the test order.
const dom = (html: string) => normalizeHtml(html).replace(/ (id|for|aria-describedby|aria-labelledby)="input-[^"]*"/g, '')

async function render (node: () => ReturnType<typeof h>) {
  const wrapper = await mountKit(defineComponent({ render: node }))
  const html = dom(wrapper.html())
  wrapper.unmount()
  return html
}

const RAW = { flat: true, hideDetails: 'auto', prependInnerIcon: '$lockoutline', singleLine: true, type: 'password', validateOn: 'blur', variant: 'outlined' }

const cases: Array<{ name: string, raw: Record<string, unknown>, app: Record<string, unknown> }> = [
  {
    name: 'login password',
    raw: { ...RAW, 'modelValue': 'x', 'autocomplete': 'current-password', 'name': 'password', 'label': 'Password', 'data-testid': 'auth-field-password' },
    app: { 'modelValue': 'x', 'autocomplete': 'current-password', 'name': 'password', 'label': 'Password', 'data-testid': 'auth-field-password' },
  },
  {
    name: 'reset password without name',
    raw: { ...RAW, 'modelValue': '', 'label': 'New password', 'data-testid': 'auth-field-password' },
    app: { 'modelValue': '', 'label': 'New password', 'data-testid': 'auth-field-password' },
  },
  {
    name: 'consumer hide-details wins',
    raw: { ...RAW, hideDetails: false, modelValue: '' },
    app: { 'hide-details': false, 'modelValue': '' },
  },
]

describe('PasswordField', () => {
  it.each(cases)('renders the DOM of a bare v-text-field: $name', async ({ raw, app }) => {
    const expected = await render(() => h(VTextField, raw))
    const actual = await render(() => h(PasswordField, app))
    expect(actual).toBe(expected)
    expect(actual).toContain('v-text-field')
  })

  it('updates the model of the parent with v-model', async () => {
    const model = ref('')
    const wrapper = await mountKit(defineComponent({
      render: () => h(PasswordField, { 'modelValue': model.value, 'onUpdate:modelValue': (value: string) => {
        model.value = value
      } }),
    }))
    await wrapper.find('input').setValue('secret')
    expect(model.value).toBe('secret')
    wrapper.unmount()
  })

  it('lets class, data-testid and listeners fall through', async () => {
    const onKeydown = vi.fn()
    const wrapper = await mountKit(PasswordField, { attrs: { 'class': 'mine', 'data-testid': 'pw', onKeydown } })
    expect(wrapper.element.classList.contains('v-text-field')).toBe(true)
    expect(wrapper.element.classList.contains('mine')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('pw')
    await wrapper.find('input').trigger('keydown.enter')
    expect(onKeydown).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('passes a slot through', async () => {
    const html = await render(() => h(PasswordField, {}, { 'append-inner': () => h('span', { class: 'eye' }, 'E') }))
    expect(html).toContain('eye')
  })
})
