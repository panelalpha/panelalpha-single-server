import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mountKit } from '@/test/mount-kit'
import WizardTextField from './WizardTextField.vue'

// The admin area wizard validates while the user types (`:rules` without `validate-on-blur`, V2 default): nothing at mount,
// then from the first input or the first blur on, also while the field has the focus.
const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))

async function mountField () {
  const model = ref('')
  const wrapper = await mountKit(defineComponent({
    render: () => h(WizardTextField, {
      'modelValue': model.value,
      'onUpdate:modelValue': (value: string) => {
        model.value = value
      },
      'rules': [(value: unknown) => String(value).length >= 3 || 'Too short'],
    }),
  }), { attachTo: document.body })
  const messages = () => wrapper.findAll('.v-messages__message').map(message => message.text())
  return { wrapper, messages }
}

describe('WizardTextField validation', () => {
  it('shows nothing before the first input or blur', async () => {
    const { wrapper, messages } = await mountField()
    await wait()
    expect(messages()).toEqual([])
    wrapper.unmount()
  })

  it('shows the message while typing in the focused field and clears it when the value is valid', async () => {
    const { wrapper, messages } = await mountField()
    const input = wrapper.find('input')
    ;(input.element as HTMLInputElement).focus()

    await input.setValue('a')
    await wait()
    expect(messages()).toEqual(['Too short'])
    expect(document.activeElement).toBe(input.element)

    await input.setValue('abc')
    await wait()
    expect(messages()).toEqual([])
    wrapper.unmount()
  })

  it('shows the message after blur of an empty field and keeps it at the next focus', async () => {
    const { wrapper, messages } = await mountField()
    const input = wrapper.find('input').element as HTMLInputElement
    input.focus()
    await wait()
    input.blur()
    await wait()
    expect(messages()).toEqual(['Too short'])

    input.focus()
    await wait()
    expect(messages()).toEqual(['Too short'])
    wrapper.unmount()
  })
})
