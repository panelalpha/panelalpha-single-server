import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { normalizeHtml } from '@/test/normalize-html'
import MobileTableCard from './MobileTableCard.vue'

const field = (text: string) => h('div', { class: 'mobile-table-item__row' }, text)

function html (wrapper: ReturnType<typeof mount>): string {
  return normalizeHtml(wrapper.html())
}

/** The frame the tables wrote by hand before the pattern. */
function frame (inner: string, { td = ' class="w-100"', card = '', before = '' } = {}): string {
  return `<tr><td${td}><div class="mobile-table-item"${card}>${before}<div class="mobile-table-item__values">${inner}</div></div></td></tr>`
}

describe('MobileTableCard', () => {
  it('has the hand-written frame with the default cell class', () => {
    const wrapper = mount(MobileTableCard, { slots: { default: () => field('one') } })

    expect(html(wrapper)).toBe(frame('<div class="mobile-table-item__row">one</div>'))
    expect(wrapper.element.tagName).toBe('TR')
  })

  it.each([
    ['w-100 px-0', ' class="w-100 px-0"'],
    ['w-100 text-start v-data-table-column--align-start', ' class="w-100 text-start v-data-table-column--align-start"'],
    ['', ''],
  ])('puts the cell class %j on the td (no class attribute for an empty one)', (cellClass, td) => {
    const wrapper = mount(MobileTableCard, { props: { cellClass }, slots: { default: () => field('one') } })

    expect(html(wrapper)).toBe(frame('<div class="mobile-table-item__row">one</div>', { td }))
  })

  it('puts the card test id on div.mobile-table-item', () => {
    const wrapper = mount(MobileTableCard, { props: { cardTestid: 'card-1' }, slots: { default: () => field('one') } })

    expect(html(wrapper)).toBe(frame('<div class="mobile-table-item__row">one</div>', { card: ' data-testid="card-1"' }))
  })

  it('renders the select slot before the values', () => {
    const wrapper = mount(MobileTableCard, {
      slots: { select: () => h('input', { type: 'checkbox' }), default: () => field('one') },
    })

    expect(html(wrapper)).toBe(frame(
      '<div class="mobile-table-item__row">one</div>',
      { before: '<div class="mobile-table-item__select"><input type="checkbox"></div>' },
    ))
  })

  it('renders the actions slot as the last field with its label and emits actions-sort', async () => {
    const wrapper = mount(MobileTableCard, {
      props: { actionsLabel: 'Actions' },
      slots: { default: () => field('one'), actions: () => h('button', 'edit') },
    })

    expect(html(wrapper)).toBe(frame(
      '<div class="mobile-table-item__row">one</div>'
      + '<div class="mobile-table-item__row"><div class="mobile-table-item__header">Actions</div>'
      + '<div class="mobile-table-item__value"><button>edit</button></div></div>',
    ))
    await wrapper.get('.mobile-table-item__header').trigger('click')
    expect(wrapper.emitted('actions-sort')).toHaveLength(1)
  })

  it('renders the actions slot without a label in div.mobile-table-item__actions', () => {
    const wrapper = mount(MobileTableCard, {
      slots: { default: () => field('one'), actions: () => h('button', 'edit') },
    })

    expect(html(wrapper)).toBe(frame(
      '<div class="mobile-table-item__row">one</div><div class="mobile-table-item__actions"><button>edit</button></div>',
    ))
  })

  it('renders no action row without the actions slot', () => {
    const wrapper = mount(MobileTableCard, { props: { actionsLabel: 'Actions' }, slots: { default: () => field('one') } })

    expect(wrapper.findAll('.mobile-table-item__row')).toHaveLength(1)
  })

  it('passes class and data-testid of the host to the tr', () => {
    const wrapper = mount({
      components: { MobileTableCard },
      template: '<table><tbody><MobileTableCard class="mobile-table-item-row" data-testid="tasks-row"><div /></MobileTableCard></tbody></table>',
    })

    const row = wrapper.get('tbody > tr')
    expect(row.classes()).toContain('mobile-table-item-row')
    expect(row.attributes('data-testid')).toBe('tasks-row')
  })

  it('puts the actions test id on the value of the actions field and on the plain actions block', () => {
    const withLabel = mount(MobileTableCard, {
      props: { actionsLabel: 'Actions', actionsTestid: 'acts' },
      slots: { actions: () => h('b', 'x') },
    })
    expect(withLabel.get('.mobile-table-item__value').attributes('data-testid')).toBe('acts')

    const plain = mount(MobileTableCard, { props: { actionsTestid: 'acts' }, slots: { actions: () => h('b', 'x') } })
    expect(plain.get('.mobile-table-item__actions').attributes('data-testid')).toBe('acts')
  })

  describe('compact variant', () => {
    const compactSlots = {
      'title': () => h('b', 'T'),
      'status': () => h('i', 'S'),
      'full': () => h('p', 'F'),
      'meta': () => h('span', 'M'),
      'meta-end': () => h('span', 'E'),
    }

    it('renders the named slots in the grid, without labelled fields', () => {
      const wrapper = mount(MobileTableCard, { props: { variant: 'compact', cardTestid: 'c1' }, slots: { ...compactSlots, default: () => field('ignored') } })

      expect(html(wrapper)).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item mobile-table-item--compact" data-testid="c1"><div class="mobile-table-item__title"><b>T</b></div><div class="mobile-table-item__status"><i>S</i></div><div class="mobile-table-item__full"><p>F</p></div><div class="mobile-table-item__meta"><span>M</span></div><div class="mobile-table-item__meta-end"><span>E</span></div></div></td></tr>"`)
      expect(wrapper.find('.mobile-table-item__values').exists()).toBe(false)
      expect(wrapper.find('.mobile-table-item__header').exists()).toBe(false)
    })

    it('renders no element for a slot the host does not fill', () => {
      const wrapper = mount(MobileTableCard, { props: { variant: 'compact' }, slots: { title: () => h('b', 'T') } })

      expect(wrapper.findAll('.mobile-table-item--compact > div')).toHaveLength(1)
    })

    it('puts class and data-testid of the host on the tr', () => {
      const wrapper = mount(MobileTableCard, {
        props: { variant: 'compact' },
        attrs: { 'class': 'item-bordered item-bordered--green', 'data-testid': 'row-1' },
        slots: { title: () => h('b', 'T') },
      })

      expect(wrapper.element.tagName).toBe('TR')
      expect(wrapper.classes()).toContain('item-bordered--green')
      expect(wrapper.attributes('data-testid')).toBe('row-1')
    })
  })
})
