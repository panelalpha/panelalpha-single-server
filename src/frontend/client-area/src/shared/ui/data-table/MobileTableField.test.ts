import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { normalizeHtml } from '@/test/normalize-html'
import MobileTableField from './MobileTableField.vue'

/** The markup the tables wrote by hand before the pattern, as one string. */
function handWritten (header: string | null, value: string, valueAttrs = ''): string {
  const head = header === null ? '' : `<div class="mobile-table-item__header">${header}</div>`
  return `<div class="mobile-table-item__row">${head}<div class="mobile-table-item__value"${valueAttrs}>${value}</div></div>`
}

function html (wrapper: ReturnType<typeof mount>): string {
  return normalizeHtml(wrapper.html())
}

describe('MobileTableField', () => {
  it('has the hand-written markup for a bold value', () => {
    const wrapper = mount(MobileTableField, { props: { label: 'Name', value: 'Alpha' } })

    expect(html(wrapper)).toBe(handWritten('Name', '<span class="bold p-3">Alpha</span>'))
    expect((wrapper.element as HTMLElement).className).toBe('mobile-table-item__row')
  })

  it('has the hand-written markup for a value that is not bold', () => {
    const wrapper = mount(MobileTableField, { props: { label: 'Command', value: 'ls', bold: false } })

    expect(html(wrapper)).toBe(handWritten('Command', '<span class="p-3">ls</span>'))
  })

  it('renders a number and an empty value as text', () => {
    expect(html(mount(MobileTableField, { props: { label: 'Id', value: 7 } }))).toBe(handWritten('Id', '<span class="bold p-3">7</span>'))
    expect(html(mount(MobileTableField, { props: { label: 'Id', value: null } }))).toBe(handWritten('Id', '<span class="bold p-3"></span>'))
  })

  it('puts the default slot in place of the span', () => {
    const wrapper = mount(MobileTableField, {
      props: { label: 'Status' },
      slots: { default: () => h('a', { class: 'link' }, 'open') },
    })

    expect(html(wrapper)).toBe(handWritten('Status', '<a class="link">open</a>'))
  })

  it('has no header without a label', () => {
    const wrapper = mount(MobileTableField, { props: { value: 'text' } })

    expect(wrapper.find('.mobile-table-item__header').exists()).toBe(false)
    expect(html(wrapper)).toBe(handWritten(null, '<span class="bold p-3">text</span>'))
  })

  it('has no value element with hideValue', () => {
    const wrapper = mount(MobileTableField, { props: { label: 'Actions', hideValue: true } })

    expect(wrapper.find('.mobile-table-item__value').exists()).toBe(false)
    expect(html(wrapper)).toBe('<div class="mobile-table-item__row"><div class="mobile-table-item__header">Actions</div></div>')
  })

  it('adds the value class and the value test id to the value element', () => {
    const wrapper = mount(MobileTableField, {
      props: { label: 'Key', value: 'a', valueClass: 'd-flex align-center', valueTestid: 'row-actions' },
    })

    expect(html(wrapper)).toBe(handWritten('Key', '<span class="bold p-3">a</span>', ' data-testid="row-actions"').replace('mobile-table-item__value"', 'mobile-table-item__value d-flex align-center"'))
  })

  it('emits sort when the header is clicked', async () => {
    const wrapper = mount(MobileTableField, { props: { label: 'Name', value: 'Alpha' } })

    await wrapper.get('.mobile-table-item__header').trigger('click')
    await wrapper.get('.mobile-table-item__value').trigger('click')

    expect(wrapper.emitted('sort')).toHaveLength(1)
  })

  it('has one root, so a directive of the host lands on it', () => {
    const wrapper = mount({
      components: { MobileTableField },
      template: '<div><MobileTableField v-for="n in 3" :key="n" :label="`L${n}`" :value="n" class="extra" /></div>',
    })

    expect(wrapper.findAll('.mobile-table-item__row.extra')).toHaveLength(3)
  })

  it('has no role and no tabindex on the header without sortable', () => {
    const wrapper = mount(MobileTableField, { props: { label: 'Name', value: 'Alpha' } })

    expect(wrapper.get('.mobile-table-item__header').attributes('role')).toBeUndefined()
    expect(wrapper.get('.mobile-table-item__header').attributes('tabindex')).toBeUndefined()
  })

  it('makes a sortable header a button that sorts on Enter and Space', async () => {
    const wrapper = mount(MobileTableField, { props: { label: 'Name', value: 'Alpha', sortable: true } })
    const header = wrapper.get('.mobile-table-item__header')

    expect(header.attributes('role')).toBe('button')
    expect(header.attributes('tabindex')).toBe('0')
    await header.trigger('keydown', { key: 'Enter' })
    await header.trigger('keydown', { key: ' ' })

    expect(wrapper.emitted('sort')).toHaveLength(2)
  })
})
