import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DomainNameInput from './DomainNameInput.vue'

const required = (value: string) => !!value || 'required'

describe('DomainNameInput', () => {
  it('renders the www. block and the text field class contract', async () => {
    const wrapper = await mountKit(DomainNameInput, { props: { text: '', placeholder: 'example.com' } })
    expectLegacyClasses(wrapper.element, ['text-select-input'])
    expect(wrapper.classes()).not.toContain('text-select-input--error')
    expect(wrapper.classes()).not.toContain('text-select-input--focus')
    expect(wrapper.get('.text-select-input__suffix span.p-2').text()).toBe('www.')
    expectLegacyClasses(wrapper.get('.v-text-field').element, ['v-input--md', 'text-select-input__text-input'])
    expect(wrapper.get('input').attributes('placeholder')).toBe('example.com')
    wrapper.unmount()
  })

  it('emits update:text as the user types', async () => {
    // A garbage update:value is ignored
    const wrapper = await mountKit(DomainNameInput, { props: { text: '' } })
    await wrapper.get('input').setValue('example.com')
    expect(wrapper.emitted('update:text')?.[0]).toEqual(['example.com'])
    expect(wrapper.emitted('update:value')).toBeUndefined()
    wrapper.unmount()
  })

  it('adds the focus class while focused', async () => {
    const wrapper = await mountKit(DomainNameInput, { props: { text: '' }, attachTo: document.body })
    await wrapper.get('input').trigger('focus')
    await nextTick()
    expect(wrapper.classes()).toContain('text-select-input--focus')
    await wrapper.get('input').trigger('blur')
    await nextTick()
    expect(wrapper.classes()).not.toContain('text-select-input--focus')
    wrapper.unmount()
  })

  it('validates with the given rules and shows the error class after blur', async () => {
    const wrapper = await mountKit(DomainNameInput, {
      props: { text: '', rules: [required] },
      attachTo: document.body,
    })
    const vm = wrapper.vm as unknown as { validate: () => Promise<boolean>, reset: () => void, resetValidation: () => void }
    expect(await vm.validate()).toBe(false)
    await expectClass(wrapper, 'text-select-input--error', true)
    vm.resetValidation()
    await expectClass(wrapper, 'text-select-input--error', false)
    expect(await vm.validate()).toBe(false)
    vm.reset()
    await expectClass(wrapper, 'text-select-input--error', false)
    await wrapper.setProps({ text: 'example.com' })
    expect(await vm.validate()).toBe(true)
    wrapper.unmount()
  })

  it('is valid without rules', async () => {
    const wrapper = await mountKit(DomainNameInput, { props: { text: '' } })
    expect(await (wrapper.vm as unknown as { validate: () => Promise<boolean> }).validate()).toBe(true)
    wrapper.unmount()
  })

  it('shows a message the screen holds for the field, and frames it as invalid', async () => {
    const wrapper = await mountKit(DomainNameInput, { props: { text: 'fx27nodot', errorMessages: ['The domain field format is invalid.'] } })
    expect(wrapper.findAll('.v-messages__message').map(message => message.text())).toEqual(['The domain field format is invalid.'])
    expect(wrapper.classes()).toContain('text-select-input--error')
    wrapper.unmount()
  })

  it('drops the screen message when the screen drops it', async () => {
    const wrapper = await mountKit(DomainNameInput, { props: { text: 'fx27nodot', errorMessages: ['The domain field format is invalid.'] } })
    await wrapper.setProps({ errorMessages: [] })
    expect(wrapper.findAll('.v-messages__message')).toHaveLength(0)
    expect(wrapper.classes()).not.toContain('text-select-input--error')
    wrapper.unmount()
  })
})

async function expectClass (wrapper: Awaited<ReturnType<typeof mountKit>>, name: string, present: boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(wrapper.classes().includes(name)).toBe(present)
  })
}
