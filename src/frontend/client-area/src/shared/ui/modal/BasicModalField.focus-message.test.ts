import type { ModalField } from './basic-modal.types'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import BasicModalField from './BasicModalField.vue'

// Legacy V2 `validate-on-blur`: a message shows only while the field has no focus (modal fields).
const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const noSpaces = (value: string) => !/\s/.test(value) || 'No spaces'

const fields: Array<[string, ModalField]> = [
  ['text', { type: 'text', name: 'a', label: 'Name', required: true, rules: [noSpaces] }],
  ['password', { type: 'password', name: 'a', label: 'Password', required: true, rules: [noSpaces] }],
  ['generatePassword', { type: 'generatePassword', name: 'a', label: 'Password', required: true, rules: [noSpaces] }],
]

describe('BasicModalField message while focused', () => {
  it.each(fields)('%s: message after blur, hidden at the focus and while typing, the new one at the next blur', async (_type, field) => {
    const wrapper = await mountKit(BasicModalField, { props: { field, modelValue: '' }, attachTo: document.body })
    const messages = () => wrapper.findAll('.v-messages__message').map(message => message.text())
    const input = wrapper.get('input').element as HTMLInputElement

    input.focus()
    await wait()
    input.blur()
    await wait()
    expect(messages()).toHaveLength(1)

    input.focus()
    await wait()
    expect(messages()).toEqual([])
    expect(wrapper.find('.v-input--error').exists()).toBe(false)

    await wrapper.get('input').setValue('a b')
    await wait()
    expect(messages()).toEqual([])

    input.blur()
    await wait()
    expect(messages()).toEqual(['No spaces'])

    input.focus()
    await wait()
    expect(messages()).toEqual([])
    wrapper.unmount()
  })

  it('multiText: an input hides its own message while focused', async () => {
    const field = {
      type: 'multiText',
      name: 'a',
      label: 'Parts',
      required: true,
      inputs: [{ name: 'one' }, { name: 'two' }],
    } as ModalField
    const wrapper = await mountKit(BasicModalField, { props: { field, modelValue: {} }, attachTo: document.body })
    const input = wrapper.findAll('input')[0].element as HTMLInputElement

    input.focus()
    await wait()
    input.blur()
    await wait()
    expect(wrapper.findAll('.v-input')[0].findAll('.v-messages__message').length).toBeGreaterThan(0)

    input.focus()
    await wait()
    expect(wrapper.findAll('.v-input')[0].findAll('.v-messages__message')).toHaveLength(0)
    wrapper.unmount()
  })
})
