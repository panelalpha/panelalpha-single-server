import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { VForm } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import EmailField from './EmailField.vue'
import PasswordField from './PasswordField.vue'

// Legacy V2 `validate-on-blur`: a message shows only while the field has no focus.
const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const rules = [
  (value: string) => !!value || 'Required',
  (value: string) => value.length >= 3 || 'Too short',
]

async function mountField (component: typeof EmailField | typeof PasswordField) {
  const model = ref('')
  const wrapper = await mountKit(defineComponent({
    render: () => h(VForm, null, () => h(component, {
      'modelValue': model.value,
      'onUpdate:modelValue': (value: string) => {
        model.value = value
      },
      rules,
    })),
  }), { attachTo: document.body })
  const input = wrapper.find('input').element as HTMLInputElement
  const messages = () => wrapper.findAll('.v-messages__message').map(message => message.text())
  return { wrapper, input, messages }
}

describe.each([['EmailField', EmailField], ['PasswordField', PasswordField]])('%s message while focused', (_name, component) => {
  it('shows the message after blur, hides it at the focus and while typing, shows the new one at the next blur', async () => {
    const { wrapper, input, messages } = await mountField(component)

    input.focus()
    await wait()
    input.blur()
    await wait()
    expect(messages()).toEqual(['Required'])

    input.focus()
    await wait()
    expect(messages()).toEqual([])
    expect(wrapper.find('.v-input').classes()).not.toContain('v-input--error')

    await wrapper.find('input').setValue('ab')
    await wait()
    expect(messages()).toEqual([])

    input.blur()
    await wait()
    expect(messages()).toEqual(['Too short'])

    input.focus()
    await wait()
    expect(messages()).toEqual([])

    await wrapper.find('input').setValue('abc')
    input.blur()
    await wait()
    expect(messages()).toEqual([])
    expect(wrapper.find('.v-input').classes()).not.toContain('v-input--error')
    wrapper.unmount()
  })

  it('shows no message when the form is submitted with Enter in the focused field', async () => {
    const { wrapper, input, messages } = await mountField(component)

    input.focus()
    await wait()
    await wrapper.find('form').trigger('submit')
    await wait()
    expect(messages()).toEqual([])

    input.blur()
    await wait()
    expect(messages()).toEqual(['Required'])
    wrapper.unmount()
  })

  it('shows the message when the form is validated while the field has no focus', async () => {
    const { wrapper, messages } = await mountField(component)

    await wrapper.find('form').trigger('submit')
    await wait()
    expect(messages()).toEqual(['Required'])
    wrapper.unmount()
  })
})
