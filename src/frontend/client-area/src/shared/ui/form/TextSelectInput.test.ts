import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import TextSelectInput from './TextSelectInput.vue'

const options = [
  { label: 'example.com', value: 'example.com' },
  { label: 'example.org', value: 'example.org' },
]

type Wrapper = Awaited<ReturnType<typeof mountKit>>

async function expectClass (wrapper: Wrapper, name: string, present: boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(wrapper.classes().includes(name)).toBe(present)
  })
}

describe('TextSelectInput', () => {
  it('renders the text field, the optional suffix and the select', async () => {
    const wrapper = await mountKit(TextSelectInput, {
      props: { text: 'blog', suffix: '.', select: 'example.com', availableSelectOptions: options, placeholder: 'name' },
    })
    expectLegacyClasses(wrapper.element, ['text-select-input'])
    expectLegacyClasses(wrapper.get('.v-text-field.text-select-input__text-input').element, ['v-input--md'])
    expect(wrapper.get('.text-select-input__suffix span.p-2').text()).toBe('.')
    expectLegacyClasses(wrapper.get('.v-select').element, ['text-select-input__select-input'])
    expect(wrapper.get('input').attributes('placeholder')).toBe('name')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('blog')
    expect(wrapper.get('.v-select .v-select__selection').text()).toBe('example.com')
    wrapper.unmount()

    const noSuffix = await mountKit(TextSelectInput, { props: { text: '', availableSelectOptions: options } })
    expect(noSuffix.find('.text-select-input__suffix').exists()).toBe(false)
    noSuffix.unmount()
  })

  it('emits update:text and the combined update:value when typing', async () => {
    // The staging modal listens to update:value
    const wrapper = await mountKit(TextSelectInput, {
      props: { text: '', suffix: '.', select: 'example.com', availableSelectOptions: options },
    })
    await wrapper.get('input').setValue('blog')
    expect(wrapper.emitted('update:text')?.[0]).toEqual(['blog'])
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['blog.example.com'])
    wrapper.unmount()
  })

  it('emits update:select and update:value when an option is chosen', async () => {
    const wrapper = await mountKit(TextSelectInput, {
      props: { text: 'blog', suffix: '.', select: 'example.com', availableSelectOptions: options },
      attachTo: document.body,
    })
    wrapper.getComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'example.org')
    await nextTick()
    expect(wrapper.emitted('update:select')?.[0]).toEqual(['example.org'])
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['blog.example.org'])
    wrapper.unmount()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('makes the select readonly without the dropdown icon', async () => {
    const editable = await mountKit(TextSelectInput, { props: { select: 'example.com', availableSelectOptions: options } })
    expect(editable.find('.v-select .v-field__append-inner .v-icon').exists()).toBe(true)
    editable.unmount()
    const readonly = await mountKit(TextSelectInput, { props: { select: 'example.com', availableSelectOptions: options, readonly: true } })
    expect(readonly.find('.v-select--readonly, .v-input--readonly').exists()).toBe(true)
    expect(readonly.find('.v-select .v-field__append-inner .v-icon').exists()).toBe(false)
    readonly.unmount()
  })

  it('validates the combined value by hand on blur, outside v-form', async () => {
    // The rule gets text + suffix + select value
    const rule = vi.fn((value: string) => value === 'blog.example.com' || 'bad domain')
    const wrapper = await mountKit(TextSelectInput, {
      props: { text: 'x', suffix: '.', select: 'example.com', availableSelectOptions: options, rules: [rule] },
      attachTo: document.body,
    })
    wrapper.getComponent({ name: 'VTextField' }).vm.$emit('update:focused', true)
    await nextTick()
    expect(wrapper.classes()).toContain('text-select-input--focus')
    wrapper.getComponent({ name: 'VTextField' }).vm.$emit('update:focused', false)
    await nextTick()
    expect(rule).toHaveBeenCalledWith('x.example.com')
    expectLegacyClasses(wrapper.element, ['text-select-input--error'])
    expect(wrapper.classes()).not.toContain('text-select-input--focus')
    await expectClass(wrapper, 'text-select-input--error', true)
    expect(wrapper.text()).toContain('bad domain')

    await wrapper.setProps({ text: 'blog' })
    expect((wrapper.vm as unknown as { validate: () => string[] }).validate()).toEqual([])
    await expectClass(wrapper, 'text-select-input--error', true)
    wrapper.getComponent({ name: 'VTextField' }).vm.$emit('update:focused', false)
    await expectClass(wrapper, 'text-select-input--error', false)
    wrapper.unmount()
  })

  it('falls back to the first option when no select is given', async () => {
    const wrapper = await mountKit(TextSelectInput, {
      props: { text: 'blog', suffix: '.', select: null, availableSelectOptions: options },
    })
    await wrapper.get('input').setValue('blog2')
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['blog2.[object Object]'])
    expect((wrapper.vm as unknown as { validate: () => string[] }).validate()).toEqual([])
    wrapper.unmount()
  })
})
