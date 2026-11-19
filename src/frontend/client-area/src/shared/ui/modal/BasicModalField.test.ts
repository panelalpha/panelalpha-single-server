import type { ModalField } from './basic-modal.types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import BasicModalField from './BasicModalField.vue'

type Wrapper = Awaited<ReturnType<typeof mountKit>>

const options = [
  { label: 'One', value: 'one' },
  { label: 'Two', value: 'two' },
]

async function mountField (field: ModalField, props: Record<string, unknown> = {}): Promise<Wrapper> {
  return mountKit(BasicModalField, { props: { field, ...props }, attachTo: document.body })
}

async function validateFirst (wrapper: Wrapper, name: string): Promise<string[]> {
  const input = wrapper.getComponent({ name }).vm as unknown as { validate: () => Promise<string[]> }
  return input.validate()
}

describe('BasicModalField', () => {
  afterEach(() => {
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  describe('label, tooltip, description and chrome', () => {
    it('renders the base--text label with a translated tooltip help icon and the description', async () => {
      const wrapper = await mountField({
        type: 'text', name: 'a', label: 'Name', tooltip: 'tooltip.name', description: 'Note',
      })
      expectLegacyClasses(wrapper.element, ['d-flex', 'flex-column'])
      const label = wrapper.get('label')
      expectLegacyClasses(label.element, ['base--text', 'mb-2'])
      expect(label.text()).toContain('Name')
      expect(label.find('.v-icon').exists()).toBe(true)
      const description = wrapper.get('span.mb-3')
      expect(description.get('strong').text()).toBe('Note')
      wrapper.unmount()
    })

    it('renders no label without label and tooltip', async () => {
      const wrapper = await mountField({ type: 'text', name: 'a' })
      expect(wrapper.find('label').exists()).toBe(false)
      expect(wrapper.find('span.mb-3').exists()).toBe(false)
      wrapper.unmount()
    })

    it('hides a hidden field with v-show and gives it no rules', async () => {
      const wrapper = await mountField({ type: 'text', name: 'a', label: 'Name', required: true, hidden: true })
      expect(wrapper.get('label').attributes('style')).toContain('display: none')
      expect(wrapper.get('.v-text-field').element.parentElement!.getAttribute('style')).toContain('display: none')
      expect(await validateFirst(wrapper, 'VTextField')).toEqual([])
      wrapper.unmount()
    })

    it('adds last-child on the wrapper of the last field', async () => {
      const last = await mountField({ type: 'text', name: 'a' }, { last: true })
      expect(last.get('.v-text-field').element.parentElement!.classList).toContain('last-child')
      last.unmount()
      const notLast = await mountField({ type: 'text', name: 'a' })
      expect(notLast.get('.v-text-field').element.parentElement!.classList).not.toContain('last-child')
      notLast.unmount()
    })

    it('swaps the control for a skeleton while loading', async () => {
      for (const type of ['text', 'select', 'combobox', 'textarea', 'checkbox', 'text-select', 'domain-input'] as const) {
        const field = {
          type, name: 'a', textName: 'a', selectName: 'b', options, loading: true,
        } as ModalField
        const wrapper = await mountField(field)
        expect([type, wrapper.find('.v-skeleton-loader').exists()]).toEqual([type, true])
        expect([type, wrapper.find('input, textarea').exists()]).toEqual([type, false])
        wrapper.unmount()
      }
    })
  })

  describe('text', () => {
    it('renders the outlined md field and v-models the value', async () => {
      const wrapper = await mountField(
        { type: 'text', name: 'a', placeholder: 'type', prefix: 'https://', suffix: '.com', readonly: true },
        { modelValue: 'abc' },
      )
      const field = wrapper.get('.v-text-field')
      expectLegacyClasses(field.element, ['v-input--md', 'v-input--density-compact'])
      expect(wrapper.find('.v-field--variant-outlined').exists()).toBe(true)
      const input = wrapper.get('input')
      expect(input.attributes('placeholder')).toBe('type')
      expect(input.attributes('readonly')).toBeDefined()
      expect((input.element as HTMLInputElement).value).toBe('abc')
      expect(wrapper.get('.v-text-field__prefix').text()).toBe('https://')
      expect(wrapper.get('.v-text-field__suffix').text()).toBe('.com')
      wrapper.unmount()

      const editable = await mountField({ type: 'text', name: 'a' }, { modelValue: '' })
      await editable.get('input').setValue('next')
      expect(editable.emitted('update:modelValue')?.[0]).toEqual(['next'])
      editable.unmount()
    })

    it('draws a prefix as plain text inside the field, not as a block before it (issue #5)', async () => {
      // Legacy passes `prefix` to the text field, also for the SFTP username (`example_`)
      const wrapper = await mountField({ type: 'text', name: 'username', prefix: 'example_' }, { modelValue: '' })
      expect(wrapper.get('.v-field .v-text-field__prefix').text()).toBe('example_')
      expect(wrapper.find('.prefix-block-input').exists()).toBe(false)
      wrapper.unmount()
    })

    it('emits blur where legacy called onBlur', async () => {
      const wrapper = await mountField({ type: 'text', name: 'a' }, { modelValue: '' })
      await wrapper.get('input').trigger('blur')
      expect(wrapper.emitted('blur')).toHaveLength(1)
      wrapper.unmount()
    })

    it('adds the required rule with the field label, then the custom rules', async () => {
      const custom = (value: unknown) => value === 'ok' || 'custom error'
      const wrapper = await mountField(
        { type: 'text', name: 'a', label: 'Name', required: true, rules: [custom] },
        { modelValue: '' },
      )
      expect(await validateFirst(wrapper, 'VTextField')).toEqual(['form.validation.required'])
      await wrapper.setProps({ modelValue: 'no' })
      expect(await validateFirst(wrapper, 'VTextField')).toEqual(['custom error'])
      await wrapper.setProps({ modelValue: 'ok' })
      expect(await validateFirst(wrapper, 'VTextField')).toEqual([])
      wrapper.unmount()
    })

    it('ignores custom rules unless every one is a function', async () => {
      // spreadRules
      const bad = (() => 'bad') as (value: unknown) => string
      const wrapper = await mountField(
        { type: 'text', name: 'a', rules: [bad, 'nope' as unknown as typeof bad] },
        { modelValue: '' },
      )
      expect(await validateFirst(wrapper, 'VTextField')).toEqual([])
      wrapper.unmount()
    })
  })

  describe('multiText', () => {
    it('renders one field per input in an input-group, keyed by the input name', async () => {
      const field: ModalField = {
        type: 'multiText',
        inputs: [{ name: 'min', placeholder: 'Min' }, { name: 'max', placeholder: 'Max', suffix: 's' }],
      }
      const wrapper = await mountField(field, { modelValue: { min: '1', max: '2' } })
      expectLegacyClasses(wrapper.get('.input-group').element, ['d-flex'])
      const inputs = wrapper.findAll('input')
      expect(inputs.map(input => (input.element as HTMLInputElement).value)).toEqual(['1', '2'])
      expect(inputs.map(input => input.attributes('placeholder'))).toEqual(['Min', 'Max'])
      expect(wrapper.get('.v-text-field__suffix').text()).toBe('s')

      await inputs[1]!.setValue('9')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ min: '1', max: '9' }])
      expect(wrapper.emitted('input')).toHaveLength(1)
      wrapper.unmount()
    })
  })

  describe('combobox', () => {
    // The Branch dialog of the Git page: the user may type a name the list does not offer, and that name must reach the request.
    it('renders the outlined combobox with label/value items and sends a typed value that is not in the list', async () => {
      const wrapper = await mountField(
        { type: 'combobox', name: 'a', options, customClass: 'branch-field' },
        { modelValue: 'one' },
      )
      const combobox = wrapper.get('.v-combobox')
      expectLegacyClasses(combobox.element, ['branch-field'])
      expect(wrapper.find('.v-field--variant-outlined').exists()).toBe(true)
      expect(wrapper.find('.v-field__append-inner .v-icon').exists()).toBe(true)

      wrapper.getComponent({ name: 'VCombobox' }).vm.$emit('update:modelValue', 'workflow-permissions')
      await nextTick()
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['workflow-permissions'])
      expect(wrapper.emitted('change')?.[0]).toEqual(['workflow-permissions'])
      wrapper.unmount()
    })

    it('sends the name of the item picked from the list, so the form can submit it', async () => {
      // A pick used to hand the whole item to the modal: the field emptied and the required rule refused the change.
      const field: ModalField = { type: 'combobox', name: 'branch', options, label: 'Branch', required: true }
      const wrapper = await mountKit(defineComponent({
        setup () {
          const value = ref<unknown>('one')
          return () => h(BasicModalField, {
            field,
            'modelValue': value.value,
            'onUpdate:modelValue': (next: unknown) => {
              value.value = next
            },
          })
        },
      }), { attachTo: document.body })

      await wrapper.get('.v-field').trigger('mousedown')
      await vi.waitFor(() => {
        const items = document.body.querySelectorAll('.v-overlay__content .v-list-item')
        expect([...items].map(item => item.textContent?.trim())).toEqual(['One', 'Two'])
      })
      const items = document.body.querySelectorAll('.v-overlay__content .v-list-item')
      ;(items[1] as HTMLElement).click()

      await vi.waitFor(() => {
        expect((wrapper.get('input[type=text]').element as HTMLInputElement).value).toBe('Two')
      })
      expect(wrapper.findComponent(BasicModalField).emitted('update:modelValue')?.at(-1)).toEqual(['two'])
      expect(wrapper.findComponent(BasicModalField).emitted('change')?.at(-1)).toEqual(['two'])
      expect(await validateFirst(wrapper, 'VCombobox')).toEqual([])
      wrapper.unmount()
    })

    it('applies the required rule', async () => {
      const wrapper = await mountField({ type: 'combobox', name: 'a', options, label: 'Branch', required: true }, { modelValue: '' })
      expect(await validateFirst(wrapper, 'VCombobox')).toEqual(['form.validation.required'])
      wrapper.unmount()
    })

    it('is readonly without the dropdown icon', async () => {
      const wrapper = await mountField({ type: 'combobox', name: 'a', options, readonly: true }, { modelValue: 'one' })
      expect(wrapper.find('.v-field__append-inner .v-icon').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('text-select', () => {
    const field: ModalField = {
      type: 'text-select', textName: 'sub', selectName: 'parent', options, suffix: '.', placeholder: 'name',
    }

    it('renders TextSelectInput and v-models both parts as an object', async () => {
      const wrapper = await mountField(field, { modelValue: { sub: 'blog', parent: 'one' } })
      expect(wrapper.find('.text-select-input').exists()).toBe(true)
      expect((wrapper.get('.text-select-input input').element as HTMLInputElement).value).toBe('blog')
      expect(wrapper.get('.text-select-input__suffix').text()).toBe('.')
      await wrapper.get('.text-select-input input').setValue('news')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ sub: 'news', parent: 'one' }])
      wrapper.unmount()
    })

    it('keeps the select blank when the select part is unset', async () => {
      // Only `field.name` is initialised
      const wrapper = await mountField(field, { modelValue: { sub: 'blog' } })
      expect(wrapper.getComponent({ name: 'VSelect' }).props('modelValue')).toEqual({ label: '', value: '' })
      wrapper.unmount()
    })

    it('is readonly with fewer than two options and never emits change', async () => {
      const single = await mountField({ ...field, options: [options[0]!] } as ModalField, { modelValue: { sub: '', parent: 'one' } })
      expect(single.find('.v-select--readonly, .v-input--readonly').exists()).toBe(true)
      single.unmount()
      const many = await mountField(field, { modelValue: { sub: '', parent: 'one' } })
      expect(many.find('.v-select--readonly, .v-input--readonly').exists()).toBe(false)
      many.getComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'two')
      await nextTick()
      expect(many.emitted('update:modelValue')?.[0]).toEqual([{ sub: '', parent: 'two' }])
      expect(many.emitted('change')).toBeUndefined()
      many.unmount()
    })

    it('passes the custom rules, none when hidden', async () => {
      const rule = vi.fn((value: unknown) => value === 'blog.one' || 'taken')
      const wrapper = await mountField({ ...field, rules: [rule] } as ModalField, { modelValue: { sub: 'x', parent: 'one' } })
      const input = wrapper.getComponent({ name: 'TextSelectInput' }).vm as unknown as { validate: () => string[] }
      expect(input.validate()).toEqual(['taken'])
      wrapper.unmount()

      const hidden = await mountField({ ...field, rules: [rule], hidden: true } as ModalField, { modelValue: { sub: 'x', parent: 'one' } })
      const hiddenInput = hidden.getComponent({ name: 'TextSelectInput' }).vm as unknown as { validate: () => string[] }
      expect(hiddenInput.validate()).toEqual([])
      hidden.unmount()
    })
  })

  describe('domain-input', () => {
    it('renders DomainNameInput and v-models the text part', async () => {
      const wrapper = await mountField(
        { type: 'domain-input', textName: 'domain', placeholder: 'example.com' },
        { modelValue: { domain: 'a.com' } },
      )
      expect(wrapper.get('.text-select-input__suffix').text()).toBe('www.')
      expect((wrapper.get('input').element as HTMLInputElement).value).toBe('a.com')
      expect(wrapper.get('input').attributes('placeholder')).toBe('example.com')
      await wrapper.get('input').setValue('b.com')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ domain: 'b.com' }])
      wrapper.unmount()
    })

    it('passes the custom rules, none when hidden', async () => {
      const rule = (value: unknown) => !!value || 'domain required'
      const wrapper = await mountField(
        { type: 'domain-input', textName: 'domain', rules: [rule] },
        { modelValue: { domain: '' } },
      )
      const input = wrapper.getComponent({ name: 'DomainNameInput' }).vm as unknown as { validate: () => Promise<boolean> }
      expect(await input.validate()).toBe(false)
      wrapper.unmount()

      const hidden = await mountField(
        { type: 'domain-input', textName: 'domain', rules: [rule], hidden: true },
        { modelValue: { domain: '' } },
      )
      const hiddenInput = hidden.getComponent({ name: 'DomainNameInput' }).vm as unknown as { validate: () => Promise<boolean> }
      expect(await hiddenInput.validate()).toBe(true)
      hidden.unmount()
    })
  })

  describe('select', () => {
    it('renders the outlined select with label/value items and emits change', async () => {
      const wrapper = await mountField(
        { type: 'select', name: 'a', options, customClass: 'select-truncate-100' },
        { modelValue: 'two' },
      )
      const select = wrapper.get('.v-select')
      expectLegacyClasses(select.element, ['select-truncate-100'])
      expect(wrapper.find('.v-field--variant-outlined').exists()).toBe(true)
      expect(wrapper.get('.v-select__selection').text()).toBe('Two')
      expect(wrapper.find('.v-field__append-inner .v-icon').exists()).toBe(true)

      wrapper.getComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'one')
      await nextTick()
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['one'])
      expect(wrapper.emitted('change')?.[0]).toEqual(['one'])
      wrapper.unmount()
    })

    it('is readonly without the dropdown icon', async () => {
      const wrapper = await mountField({ type: 'select', name: 'a', options, readonly: true }, { modelValue: 'one' })
      expect(wrapper.find('.v-field__append-inner .v-icon').exists()).toBe(false)
      wrapper.unmount()
    })

    it('supports multiple selection', async () => {
      const wrapper = await mountField({ type: 'select', name: 'a', options, multiple: true }, { modelValue: ['one', 'two'] })
      expect(wrapper.findAll('.v-select__selection').map(item => item.text().replace(',', ''))).toEqual(['One', 'Two'])
      wrapper.unmount()
    })

    it('applies the required rule', async () => {
      const wrapper = await mountField({ type: 'select', name: 'a', options, label: 'Kind', required: true }, { modelValue: null })
      expect(await validateFirst(wrapper, 'VSelect')).toEqual(['form.validation.required'])
      wrapper.unmount()
    })

    it('renders UserRoleLabel for item and selection when named role', async () => {
      // App behaviour; lite comments the slots out
      const roleOptions = [{ label: 'Admin', value: 'administrator' }, { label: 'Editor', value: 'editor' }]
      const wrapper = await mountField({ type: 'select', name: 'role', options: roleOptions }, { modelValue: 'editor' })
      expect(wrapper.get('.v-select__selection .user-role-label').text()).toBe('editor')
      await wrapper.get('.v-field').trigger('mousedown')
      await vi.waitFor(() => {
        const items = document.body.querySelectorAll('.v-overlay__content .v-list-item .user-role-label')
        expect([...items].map(item => item.textContent?.trim())).toEqual(['administrator', 'editor'])
      })
      wrapper.unmount()

      const plain = await mountField({ type: 'select', name: 'other', options: roleOptions }, { modelValue: 'editor' })
      expect(plain.find('.user-role-label').exists()).toBe(false)
      plain.unmount()
    })

    it('shows the role select as plain text with plainOptions, as lite does', async () => {
      // Legacy lite: the role slots are commented out
      const roleOptions = [{ label: 'Admin', value: 'administrator' }, { label: 'Editor', value: 'editor' }]
      const wrapper = await mountField(
        { type: 'select', name: 'role', options: roleOptions, plainOptions: true },
        { modelValue: 'editor' },
      )
      expect(wrapper.get('.v-select__selection').text()).toBe('Editor')
      expect(wrapper.find('.user-role-label').exists()).toBe(false)
      await wrapper.get('.v-field').trigger('mousedown')
      await vi.waitFor(() => {
        const items = document.body.querySelectorAll('.v-overlay__content .v-list-item')
        expect([...items].map(item => item.textContent?.trim())).toEqual(['Admin', 'Editor'])
      })
      expect(document.body.querySelector('.v-overlay__content .user-role-label')).toBeNull()
      wrapper.unmount()
    })
  })

  describe('checkbox', () => {
    it('renders the html message and the Checkbox in the legacy label chrome', async () => {
      const wrapper = await mountField(
        {
          type: 'checkbox', name: 'confirm', label: 'I agree', tooltip: 'tooltip.agree', message: 'Read <b>this</b>', messageClass: 'extra',
        },
        { modelValue: false, last: true },
      )
      const container = wrapper.get('.checkbox').element.closest('.d-flex.flex-column.align-start')!
      expectLegacyClasses(container, ['w-100', 'pb-4', 'last-child'])
      expect(wrapper.find('label.base--text.mb-2').exists()).toBe(false)
      const message = wrapper.get('p.p-2')
      expectLegacyClasses(message.element, ['extra'])
      expect(message.html()).toContain('<b>this</b>')
      const label = wrapper.get('label.checkbox-label')
      expectLegacyClasses(label.element, ['base--text', 'd-flex', 'align-center', 'p-2'])
      expect(label.get('.v-label').text()).toBe('I agree')
      expect(label.find('.v-label .v-icon').exists()).toBe(true)
      wrapper.unmount()
    })

    it('toggles the model and emits change', async () => {
      const wrapper = await mountField({ type: 'checkbox', name: 'confirm', label: 'I agree' }, { modelValue: false })
      await wrapper.get('input').setValue(true)
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
      expect(wrapper.emitted('change')?.[0]).toEqual([true])
      wrapper.unmount()
    })

    it('applies the required rule on the checkbox', async () => {
      const wrapper = await mountField({ type: 'checkbox', name: 'confirm', label: 'I agree', required: true }, { modelValue: false })
      expect(await validateFirst(wrapper, 'VCheckbox')).toEqual(['form.validation.required'])
      await wrapper.setProps({ modelValue: true })
      expect(await validateFirst(wrapper, 'VCheckbox')).toEqual([])
      wrapper.unmount()
    })

    it('renders only the wrapper while hidden', async () => {
      const wrapper = await mountField({ type: 'checkbox', name: 'confirm', label: 'I agree', hidden: true })
      expect(wrapper.find('.checkbox').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('textarea', () => {
    it('renders the html message and an auto-growing outlined textarea', async () => {
      const wrapper = await mountField(
        {
          type: 'textarea', name: 'a', placeholder: 'notes', message: 'Say <i>more</i>', messageClass: 'extra', height: '112px',
        },
        { modelValue: 'hello' },
      )
      const message = wrapper.get('p.p-2')
      expectLegacyClasses(message.element, ['extra'])
      expect(message.html()).toContain('<i>more</i>')
      const textarea = wrapper.get('textarea')
      expect(textarea.attributes('placeholder')).toBe('notes')
      expect((textarea.element as HTMLTextAreaElement).value).toBe('hello')
      expectLegacyClasses(wrapper.get('.v-textarea').element, ['v-textarea--auto-grow'])
      expect(wrapper.get('.v-textarea').attributes('style')).toContain('--modal-textarea-height: 112px')
      await textarea.setValue('bye')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['bye'])
      wrapper.unmount()
    })

    it('applies the required rule', async () => {
      const wrapper = await mountField({ type: 'textarea', name: 'a', label: 'Notes', required: true }, { modelValue: '' })
      expect(await validateFirst(wrapper, 'VTextarea')).toEqual(['form.validation.required'])
      wrapper.unmount()
    })
  })

  describe('generatePassword', () => {
    it('renders a password input, the eye toggle and the generate button', async () => {
      const wrapper = await mountField({ type: 'generatePassword', name: 'password' }, { modelValue: 'secret' })
      expectLegacyClasses(wrapper.get('.input-group').element, ['d-flex'])
      const input = wrapper.get('input')
      expect(input.attributes('type')).toBe('password')
      expect(input.attributes('autocomplete')).toBe('new-password')
      const [toggle, generate] = wrapper.findAll('.v-btn')
      expectLegacyClasses(toggle!.element, ['v-btn--icon', 'mr-4', 'ml-4'])
      expect(generate!.text()).toBe('button.password.generate')

      await toggle!.trigger('click')
      expect(wrapper.get('input').attributes('type')).toBe('text')
      await toggle!.trigger('click')
      expect(wrapper.get('input').attributes('type')).toBe('password')
      wrapper.unmount()
    })

    it('writes a generated password into the model', async () => {
      const wrapper = await mountField({ type: 'generatePassword', name: 'password' }, { modelValue: '' })
      await wrapper.findAll('.v-btn')[1]!.trigger('click')
      const [generated] = wrapper.emitted('update:modelValue')![0] as [string]
      expect(generated).toHaveLength(10)
      expect(generated).toMatch(/[a-z]/)
      expect(generated).toMatch(/[A-Z]/)
      expect(generated).toMatch(/\d/)
      expect(generated).toMatch(/[!@#$%^&*()]/)
      wrapper.unmount()
    })

    it('applies the translated required rule', async () => {
      const wrapper = await mountField({ type: 'generatePassword', name: 'password', label: 'Password', required: true }, { modelValue: '' })
      expect(await validateFirst(wrapper, 'VTextField')).toEqual(['form.validation.required'])
      wrapper.unmount()
    })

    it('shows a message the screen holds for the field, like the text field', async () => {
      const wrapper = await mountField(
        { type: 'generatePassword', name: 'password', errorMessages: ['The password field is too weak.'] },
        { modelValue: 'x' },
      )
      expect(wrapper.get('.v-messages__message').text()).toBe('The password field is too weak.')
      wrapper.unmount()
    })
  })

  describe('password', () => {
    it('renders a password input with the eye toggle', async () => {
      const wrapper = await mountField({ type: 'password', name: 'password' }, { modelValue: '' })
      expect(wrapper.get('input').attributes('type')).toBe('password')
      const toggle = wrapper.get('.v-btn')
      expectLegacyClasses(toggle.element, ['v-btn--icon', 'mr-0', 'ml-4'])
      await toggle.trigger('click')
      expect(wrapper.get('input').attributes('type')).toBe('text')
      await wrapper.get('input').setValue('pw')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['pw'])
      wrapper.unmount()
    })

    it('keeps the legacy English required message', async () => {
      const wrapper = await mountField({ type: 'password', name: 'password', label: 'Password', required: true }, { modelValue: '' })
      expect(await validateFirst(wrapper, 'VTextField')).toEqual(['Password Required.'])
      wrapper.unmount()
    })

    it('shows a message the screen holds for the field', async () => {
      const wrapper = await mountField(
        { type: 'password', name: 'password', errorMessages: ['The password field is too weak.'] },
        { modelValue: 'x' },
      )
      expect(wrapper.get('.v-messages__message').text()).toBe('The password field is too weak.')
      wrapper.unmount()
    })
  })

  describe('hiddenPassword', () => {
    it('renders a disabled masked input and emits button-click from the set-new button', async () => {
      const wrapper = await mountField({ type: 'hiddenPassword' })
      const input = wrapper.get('input')
      expect(input.attributes('type')).toBe('password')
      expect(input.attributes('disabled')).toBeDefined()
      expect((input.element as HTMLInputElement).value).toBe('************')
      const button = wrapper.get('.v-btn')
      expectLegacyClasses(button.element, ['ml-4'])
      expect(button.text()).toBe('button.password.setNew')
      await button.trigger('click')
      expect(wrapper.emitted('button-click')).toHaveLength(1)
      wrapper.unmount()
    })
  })

  describe('switch', () => {
    it('renders an inset switch, v-models a boolean and has no rules', async () => {
      const wrapper = await mountField(
        { type: 'switch', name: 'enabled', required: true, rules: [() => 'never'] },
        { modelValue: false },
      )
      expectLegacyClasses(wrapper.get('.input-group').element, ['d-flex'])
      const root = wrapper.get('.v-switch')
      expectLegacyClasses(root.element, ['pa-0', 'ma-0', 'v-switch--inset'])
      await wrapper.get('input').setValue(true)
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
      expect(await validateFirst(wrapper, 'VSwitch')).toEqual([])
      wrapper.unmount()
    })
  })

  describe('select menu (V2 `dense`)', () => {
    // Legacy selects are `dense`: 40px list items, the menu as wide as the field (`.basic-modal-select-menu`).
    it('gives the menu compact list items and the basic-modal-select-menu content class', async () => {
      const wrapper = await mountField({ type: 'select', name: 'a', options }, { modelValue: 'one' })
      const select = wrapper.getComponent({ name: 'VSelect' })
      expect(select.props('listProps')).toEqual({ density: 'compact' })
      expect(select.props('menuProps')).toEqual({ contentClass: 'basic-modal-select-menu', maxHeight: 304 })
      wrapper.unmount()
    })
  })
})

// Characterization of the DOM: written on the code with a raw `v-switch`, kept unchanged after it moved to `AppSwitch`.
describe('BasicModalField switch DOM', () => {
  const dom = (wrapper: Wrapper) => normalizeHtml(wrapper.get('.input-group').html()).replace(/ id="switch-v-\d+"/g, '')

  it('keeps the DOM of the switch field', async () => {
    const wrapper = await mountField({ type: 'switch', name: 'enabled' }, { modelValue: true })
    expect(dom(wrapper)).toMatchInlineSnapshot(`"<div class="d-flex input-group"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--inset v-switch--size-default pa-0 ma-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input checked="" aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div><div class="v-input__details v-input__details--hidden" role="alert" aria-live="polite"><transition-group-stub name="slide-y-transition" tag="div" appear="false" persisted="false" css="true" class="v-messages"></transition-group-stub></div></div></div>"`)
    wrapper.unmount()
  })

  it('keeps the DOM of a hidden switch field', async () => {
    const wrapper = await mountField({ type: 'switch', name: 'enabled', hidden: true }, { modelValue: false })
    expect(dom(wrapper)).toMatchInlineSnapshot(`"<div class="d-flex input-group" style="display: none;"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--inset v-switch--size-default pa-0 ma-0" style="display: none;"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div><div class="v-input__details v-input__details--hidden" role="alert" aria-live="polite"><transition-group-stub name="slide-y-transition" tag="div" appear="false" persisted="false" css="true" class="v-messages"></transition-group-stub></div></div></div>"`)
    wrapper.unmount()
  })
})
