// Kit pattern of the General info card: column, card, title, body and actions.
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import InfoCard from './InfoCard.vue'

describe('InfoCard', () => {
  it('renders a quarter column with the elevated card, the title and the body', async () => {
    const wrapper = await mountKit(InfoCard, {
      props: { title: 'Source' },
      slots: { default: '<div class="v-card-text" data-testid="body">b</div>' },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['info-card', 'responsive-card', 'align-stretch', 'd-flex', 'v-col--cols-12', 'v-col--cols-sm-6', 'v-col--cols-md-6', 'v-col--cols-xl-3']))
    const card = wrapper.get('.v-card')
    expect(card.classes()).toEqual(expect.arrayContaining(['info-card__card', 'elevation-4']))
    expect(card.classes()).not.toContain('info-card__card--actions')
    expect(card.get('.v-card-title').text()).toBe('Source')
    expect(card.get('.v-card-title').classes()).toEqual(expect.arrayContaining(['px-6', 'pb-0', 'mb-4', 'h6', 'font-weight-bold']))
    expect(card.find('[data-testid="body"]').exists()).toBe(true)
    expect(card.find('.v-card-actions').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders no title row without a title', async () => {
    const wrapper = await mountKit(InfoCard, { slots: { default: '<div data-testid="body" />' } })

    expect(wrapper.find('.v-card-title').exists()).toBe(false)
    expect(wrapper.find('.v-card [data-testid="body"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the title append and the actions row', async () => {
    const wrapper = await mountKit(InfoCard, {
      props: { title: 'Speed' },
      slots: { 'title-append': '<a data-testid="link">r</a>', 'actions': '<button data-testid="act">go</button>' },
    })

    expect(wrapper.find('.v-card-title [data-testid="link"]').exists()).toBe(true)
    const actions = wrapper.get('.v-card-actions')
    expect(actions.classes()).toContain('pt-0')
    expect(actions.find('[data-testid="act"]').exists()).toBe(true)
    expect(wrapper.get('.v-card').classes()).toContain('info-card__card--actions')
    wrapper.unmount()
  })

  it('sizes the column by span', async () => {
    const half = await mountKit(InfoCard, { props: { span: 'half' } })
    expect(half.classes()).toEqual(expect.arrayContaining(['v-col--cols-12', 'v-col--cols-xl-6']))
    expect(half.classes()).not.toContain('v-col--cols-sm-6')
    half.unmount()

    const full = await mountKit(InfoCard, { props: { span: 'full' } })
    expect(full.classes()).toContain('v-col--cols-12')
    expect(full.classes()).not.toContain('v-col--cols-xl-6')
    full.unmount()
  })

  it('passes the class and the test id to the card, not to the column', async () => {
    const wrapper = await mountKit(InfoCard, {
      attrs: { 'class': 'analytics-card analytics-card--system', 'data-testid': 'instance-analytics-system' },
    })

    const card = wrapper.get('[data-testid="instance-analytics-system"]')
    expect(card.classes()).toEqual(expect.arrayContaining(['v-card', 'analytics-card', 'analytics-card--system']))
    expect(wrapper.classes()).not.toContain('analytics-card')
    expect(wrapper.attributes('data-testid')).toBeUndefined()
    wrapper.unmount()
  })
})
