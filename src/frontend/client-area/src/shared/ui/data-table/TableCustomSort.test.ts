import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import TableCustomSort from './TableCustomSort.vue'

const nameHeader = { text: 'Name', value: 'name', sortable: true }
const dateHeader = { text: 'Date', value: 'date', sortable: true }
const plainHeader = { text: 'Plain', value: 'plain', sortable: false }
const actionsHeader = { value: 'actions', sortable: false }
const headers = [nameHeader, dateHeader, plainHeader, actionsHeader]

describe('TableCustomSort', () => {
  it('renders tr.custom-sort with item--<text> cells and translated labels', async () => {
    // The item class is `item--${text.toLowerCase()}`, and `select` has no text.
    const wrapper = await mountKit(TableCustomSort, { props: { headers } })
    expectLegacyClasses(wrapper.element, ['custom-sort'])
    const cells = wrapper.findAll('td')
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      expectLegacyClasses(cell.element, ['sort-item'])
    }
    expectLegacyClasses(cells[0]!.element, ['item--name'])
    expectLegacyClasses(cells[1]!.element, ['item--date'])
    expectLegacyClasses(cells[2]!.element, ['item--plain'])
    expectLegacyClasses(cells[3]!.element, ['item--select'])
    expect(cells[0]!.get('.custom-sort__item').text()).toBe('table.header.Name')
    expectLegacyClasses(cells[0]!.get('.custom-sort__item').element, ['custom-sort__item', 'custom-sort__item--sortable'])
    expect(cells[2]!.get('.custom-sort__item').classes()).not.toContain('custom-sort__item--sortable')
    expect(cells[3]!.find('.custom-sort__item').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows a ready label as is instead of the translation key', async () => {
    // Containers: hard-coded legacy copy comes in `label`.
    const wrapper = await mountKit(TableCustomSort, { props: { headers: [{ ...nameHeader, label: 'Service' }, dateHeader] } })
    const items = wrapper.findAll('.custom-sort__item')
    expect(items[0]!.text()).toBe('Service')
    expect(items[1]!.text()).toBe('table.header.Date')
    wrapper.unmount()
  })

  it('shows sort arrows only for sortable headers and marks the sorted one up or down', async () => {
    // `up` is ascending and `down` is descending on the sorted header.
    const asc = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: false } })
    expect(asc.findAll('.custom-sort__arrows')).toHaveLength(2)
    const [nameArrow, dateArrow] = asc.findAll('.custom-sort__arrow-up')
    expect(nameArrow!.attributes('up')).toBeDefined()
    expect(nameArrow!.attributes('down')).toBeUndefined()
    expect(dateArrow!.attributes('up')).toBeUndefined()
    expect(dateArrow!.attributes('down')).toBeUndefined()
    asc.unmount()
    const desc = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: true } })
    const arrow = desc.get('.custom-sort__arrow-up')
    expect(arrow.attributes('down')).toBeDefined()
    expect(arrow.attributes('up')).toBeUndefined()
    desc.unmount()
  })

  it('emits update:sort-by with the header when another column is clicked', async () => {
    const wrapper = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: false } })
    await wrapper.findAll('.custom-sort__item')[1]!.trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[dateHeader]])
    expect(wrapper.emitted('update:sort-desc')).toBeUndefined()
    wrapper.unmount()
  })

  it('toggles sortDesc when the sorted column is clicked', async () => {
    const wrapper = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: false } })
    await wrapper.findAll('.custom-sort__item')[0]!.trigger('click')
    expect(wrapper.emitted('update:sort-desc')).toEqual([[true]])
    expect(wrapper.emitted('update:sort-by')).toBeUndefined()
    wrapper.unmount()
  })

  it('ignores clicks on a non-sortable header', async () => {
    // A click sorts only a sortable header.
    const wrapper = await mountKit(TableCustomSort, { props: { headers } })
    await wrapper.findAll('.custom-sort__item')[2]!.trigger('click')
    expect(wrapper.emitted('update:sort-by')).toBeUndefined()
    expect(wrapper.emitted('update:sort-desc')).toBeUndefined()
    wrapper.unmount()
  })

  it('sorts with Enter and Space on a focusable sortable header, and leaves a plain header out of the tab order', async () => {
    // The V4 header of Containers sorted with Enter; the shared sort row keeps that for every table.
    const wrapper = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: false } })
    const items = wrapper.findAll('.custom-sort__item')
    expect(items[0]!.attributes('role')).toBe('button')
    expect(items[0]!.attributes('tabindex')).toBe('0')
    expect(items[2]!.attributes('role')).toBeUndefined()
    expect(items[2]!.attributes('tabindex')).toBeUndefined()

    await items[1]!.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:sort-by')).toEqual([[dateHeader]])
    await items[0]!.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('update:sort-desc')).toEqual([[true]])
    await items[2]!.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:sort-by')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders no checkbox unless canBeSelected', async () => {
    // Only the first header cell gets the checkbox, and only when `canBeSelected` is set.
    const plain = await mountKit(TableCustomSort, { props: { headers } })
    expect(plain.find('.custom-sort__checkbox').exists()).toBe(false)
    expect(plain.find('.checkbox').exists()).toBe(false)
    plain.unmount()
  })

  it('renders the select-all checkbox in the first cell and emits select-all with the negated state', async () => {
    const wrapper = await mountKit(TableCustomSort, { props: { headers, canBeSelected: true, allSelected: false } })
    const box = wrapper.get('td.sort-item .custom-sort__checkbox')
    expectLegacyClasses(box.element, ['custom-sort__checkbox', 'mt-1'])
    expect(wrapper.findAll('td')[0]!.find('.custom-sort__item').exists()).toBe(false)
    await box.get('input').setValue(true)
    expect(wrapper.emitted('select-all')).toEqual([[true]])
    await wrapper.setProps({ allSelected: true })
    await box.get('input').setValue(false)
    expect(wrapper.emitted('select-all')?.[1]).toEqual([false])
    wrapper.unmount()
  })

  it('has no columnheader role and no aria-sort without announceSort', async () => {
    const wrapper = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: false } })
    for (const cell of wrapper.findAll('td')) {
      expect(cell.attributes('role')).toBeUndefined()
      expect(cell.attributes('aria-sort')).toBeUndefined()
    }
    wrapper.unmount()
  })

  it('marks the sorted header with aria-sort ascending and gives every cell the columnheader role', async () => {
    const wrapper = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: false, announceSort: true } })
    const cells = wrapper.findAll('td')
    expect(cells[0]!.classes()).toContain('item--name')
    expect(cells[0]!.attributes('role')).toBe('columnheader')
    expect(cells[0]!.attributes('aria-sort')).toBe('ascending')
    for (const cell of cells.slice(1)) {
      expect(cell.attributes('role')).toBe('columnheader')
      expect(cell.attributes('aria-sort')).toBeUndefined()
    }
    wrapper.unmount()
  })

  it('marks the sorted header with aria-sort descending when sortDesc is set', async () => {
    const wrapper = await mountKit(TableCustomSort, { props: { headers, sortBy: nameHeader, sortDesc: true, announceSort: true } })
    expect(wrapper.get('td.item--name').attributes('aria-sort')).toBe('descending')
    wrapper.unmount()
  })

  it('puts a header with headerAlign end to the right and leaves the others to the left', async () => {
    const wrapper = await mountKit(TableCustomSort, { props: { headers: [{ text: 'name', value: 'name' }, { text: 'status', value: 'status', headerAlign: 'end' }] } })
    const cells = wrapper.findAll('td')
    expect(cells[0]!.classes()).not.toContain('text-right')
    expect(cells[0]!.get('.custom-sort__item').classes()).not.toContain('justify-end')
    expect(cells[1]!.classes()).toContain('text-right')
    expect(cells[1]!.get('.custom-sort__item').classes()).toContain('justify-end')
    wrapper.unmount()
  })
})
