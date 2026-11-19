import type { FormRule } from '@/shared/ui/form/use-form-rules'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import EditableHeader from './EditableHeader.vue'

// The same rules as `useFormRules().siteNameRules` (required, at most 25 characters), inline so the test needs no i18n scope.
const rules: FormRule[] = [
  value => !!value || 'required',
  value => (typeof value === 'string' && value.length <= 25) || 'maxLength',
]

function fakeInstance (canUpdate: boolean): InstanceResource {
  return { id: 1, title: 'Blog', hasUpdateSiteNamePrivilege: () => canUpdate } as unknown as InstanceResource
}

async function mountHeader (canUpdate: boolean, loading = false) {
  return mountKit(EditableHeader, {
    props: { instance: fakeInstance(canUpdate), inputValue: 'Blog', loading, rules },
    global: { plugins: [createPinia()] },
  })
}

describe('EditableHeader', () => {
  it('shows the edit icon to a user with the privilege, and clicking the name opens the form', async () => {
    const wrapper = await mountHeader(true)

    expect(wrapper.find('.edit-icon--edit').exists()).toBe(true)
    await wrapper.get('.info-panel__data').trigger('click')
    expect(wrapper.find('.v-form').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows plain text to a user without the privilege, and clicking the name does nothing', async () => {
    const wrapper = await mountHeader(false)

    expect(wrapper.find('.edit-icon--edit').exists()).toBe(false)
    expect(wrapper.text()).toContain('Blog')
    await wrapper.get('span').trigger('click')
    expect(wrapper.find('.v-form').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not emit an empty name or one longer than 25 characters, and emits a valid one', async () => {
    const wrapper = await mountHeader(true)
    await wrapper.get('.info-panel__data').trigger('click')

    await wrapper.get('input').setValue('')
    await wrapper.get('.edit-icon--submit').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:input-value')).toBeUndefined()

    await wrapper.get('input').setValue('x'.repeat(26))
    await wrapper.get('.edit-icon--submit').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:input-value')).toBeUndefined()

    await wrapper.get('input').setValue('Shop')
    await wrapper.get('.edit-icon--submit').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:input-value')).toEqual([['Shop']])
    wrapper.unmount()
  })

  it('closes the editor when loading goes back to false', async () => {
    const wrapper = await mountHeader(true)
    await wrapper.get('.info-panel__data').trigger('click')
    expect(wrapper.find('.v-form').exists()).toBe(true)

    await wrapper.setProps({ loading: true })
    expect(wrapper.find('.v-form').exists()).toBe(true)
    await wrapper.setProps({ loading: false })
    await flushPromises()

    expect(wrapper.find('.v-form').exists()).toBe(false)
    wrapper.unmount()
  })
})
