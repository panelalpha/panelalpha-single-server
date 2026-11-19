import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import DomainNameInput from './DomainNameInput.vue'

// Legacy V2 `validate-on-blur`: a message shows only while the field has no focus.
const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const required = (value: string) => !!value || 'required'

describe('DomainNameInput message while focused', () => {
  it('shows the message after blur, hides it at the focus (the red frame stays like V2), shows it again at the next blur', async () => {
    const wrapper = await mountKit(DomainNameInput, { props: { text: '', rules: [required] }, attachTo: document.body })
    const input = wrapper.get('input').element as HTMLInputElement
    const messages = () => wrapper.findAll('.v-messages__message').map(message => message.text())

    input.focus()
    await wait()
    input.blur()
    await wait()
    expect(messages()).toEqual(['required'])
    expect(wrapper.classes()).toContain('text-select-input--error')

    input.focus()
    await wait()
    expect(messages()).toEqual([])
    expect(wrapper.classes()).toContain('text-select-input--error')

    await wrapper.get('input').setValue('ok')
    await wait()
    expect(wrapper.classes()).toContain('text-select-input--error')

    input.blur()
    await wait()
    expect(messages()).toEqual([])
    expect(wrapper.classes()).not.toContain('text-select-input--error')

    input.focus()
    await wrapper.get('input').setValue('')
    input.blur()
    await wait()
    expect(messages()).toEqual(['required'])
    wrapper.unmount()
  })
})
