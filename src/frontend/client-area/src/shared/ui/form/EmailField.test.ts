import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { VTextField } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import EmailField from './EmailField.vue'

// DOM of `EmailField` = DOM of the bare `v-text-field` the session screens had. Generated ids depend on the test order.
const dom = (html: string) => normalizeHtml(html).replace(/ (id|for|aria-describedby|aria-labelledby)="input-[^"]*"/g, '')

async function render (node: () => ReturnType<typeof h>) {
  const wrapper = await mountKit(defineComponent({ render: node }))
  const html = dom(wrapper.html())
  wrapper.unmount()
  return html
}

const RAW = { flat: true, hideDetails: 'auto', prependInnerIcon: '$email', singleLine: true, validateOn: 'blur', variant: 'outlined' }

const cases: Array<{ name: string, raw: Record<string, unknown>, app: Record<string, unknown> }> = [
  {
    name: 'login email',
    raw: { ...RAW, 'modelValue': '', 'autocomplete': 'username', 'name': 'email', 'label': 'Email', 'data-testid': 'auth-field-email' },
    app: { 'modelValue': '', 'autocomplete': 'username', 'name': 'email', 'label': 'Email', 'data-testid': 'auth-field-email' },
  },
  {
    name: 'register email with type',
    raw: { ...RAW, 'modelValue': '', 'autocomplete': 'email', 'name': 'email', 'type': 'email', 'label': 'Email', 'data-testid': 'auth-field-email' },
    app: { 'modelValue': '', 'autocomplete': 'email', 'name': 'email', 'type': 'email', 'label': 'Email', 'data-testid': 'auth-field-email' },
  },
  {
    name: 'consumer icon wins',
    raw: { ...RAW, prependInnerIcon: '$plus', modelValue: '' },
    app: { 'prepend-inner-icon': '$plus', 'modelValue': '' },
  },
]

describe('EmailField', () => {
  it.each(cases)('renders the DOM of a bare v-text-field: $name', async ({ raw, app }) => {
    const expected = await render(() => h(VTextField, raw))
    const actual = await render(() => h(EmailField, app))
    expect(actual).toBe(expected)
    expect(actual).toContain('v-text-field')
  })

  it('updates the model of the parent with v-model', async () => {
    const model = ref('')
    const wrapper = await mountKit(defineComponent({
      render: () => h(EmailField, { 'modelValue': model.value, 'onUpdate:modelValue': (value: string) => {
        model.value = value
      } }),
    }))
    await wrapper.find('input').setValue('a@b.pl')
    expect(model.value).toBe('a@b.pl')
    wrapper.unmount()
  })

  it('lets class, data-testid and listeners fall through', async () => {
    const onKeydown = vi.fn()
    const wrapper = await mountKit(EmailField, { attrs: { 'class': 'mine', 'data-testid': 'em', onKeydown } })
    expect(wrapper.element.classList.contains('v-text-field')).toBe(true)
    expect(wrapper.element.classList.contains('mine')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('em')
    await wrapper.find('input').trigger('keydown.enter')
    expect(onKeydown).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
