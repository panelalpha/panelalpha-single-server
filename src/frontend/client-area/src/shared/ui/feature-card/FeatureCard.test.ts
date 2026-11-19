import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import FeatureCard from './FeatureCard.vue'
import FeatureCheckList from './FeatureCheckList.vue'

const base = { flag: 'Free', title: 'Title', checks: ['One'] }

describe('FeatureCard', () => {
  it('renders the flag, the title and the checks, and only the slots it was given', async () => {
    const wrapper = await mountKit(FeatureCard, { props: base })
    expect(wrapper.get('.feature-flag').text()).toBe('Free')
    expect(wrapper.get('h3').text()).toBe('Title')
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.find('.feature-card__lead').exists()).toBe(false)
    expect(wrapper.find('.feature-card__note').exists()).toBe(false)
  })

  it('renders the lead and the note slots when given', async () => {
    const wrapper = await mountKit(FeatureCard, {
      props: base,
      slots: { 'lead': 'Lead text', 'note': 'Note text', 'action': '<button>Go</button>', 'aside': '<i data-testid="aside" />', 'flag-icon': '<u data-testid="icon" />' },
    })
    expect(wrapper.get('.feature-card__lead').text()).toBe('Lead text')
    expect(wrapper.get('.feature-card__note').text()).toBe('Note text')
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('[data-testid="aside"]').exists()).toBe(true)
    expect(wrapper.get('.feature-flag [data-testid="icon"]').exists()).toBe(true)
  })

  it('ok and busy add the modifier classes, busy sets aria-busy, layout wide adds its class', async () => {
    const plain = await mountKit(FeatureCard, { props: base })
    expect(plain.classes()).not.toContain('feature-card--ok')
    expect(plain.attributes('aria-busy')).toBeUndefined()
    const wrapper = await mountKit(FeatureCard, { props: { ...base, ok: true, busy: true, layout: 'wide' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['feature-card--ok', 'feature-card--busy', 'feature-card--wide']))
    expect(wrapper.attributes('aria-busy')).toBe('true')
  })

  it('titleTag sets the level of the title, h3 by default', async () => {
    const wrapper = await mountKit(FeatureCard, { props: { ...base, titleTag: 'h2' } })
    expect(wrapper.get('h2.feature-card__title').text()).toBe('Title')
    expect(wrapper.find('h3').exists()).toBe(false)
  })

  it('loading is the skeleton in the same frame: busy, bones for the flag, title, lead, three points, button and picture, no slot', async () => {
    const wrapper = await mountKit(FeatureCard, {
      props: { loading: true, layout: 'wide' },
      slots: { action: '<button>Go</button>', aside: '<i data-testid="aside" />' },
    })
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['feature-card', 'feature-card--busy', 'feature-card--wide']))
    expect(wrapper.find('.feature-flag--loading .feature-flag__bone').exists()).toBe(true)
    expect(wrapper.findAll('.feature-card__bone')).toHaveLength(7)
    expect(wrapper.find('.feature-card__title').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('[data-testid="aside"]').exists()).toBe(false)
  })

  it('takes the data-testid of the consumer on its root', async () => {
    const wrapper = await mountKit(FeatureCard, { props: { loading: true }, attrs: { 'data-testid': 'card-loading' } })
    expect(wrapper.attributes('data-testid')).toBe('card-loading')
  })
})

describe('FeatureCheckList', () => {
  it('renders a text as is and { title, text } as bold title, a dot and the text', async () => {
    const wrapper = await mountKit(FeatureCheckList, { props: { items: ['Plain', { title: 'Bold', text: 'rest' }] } })
    const [plain, rich] = wrapper.findAll('li')
    expect(plain.text()).toBe('Plain')
    expect(plain.find('b').exists()).toBe(false)
    expect(rich.get('b').text()).toBe('Bold')
    expect(rich.text()).toBe('Bold · rest')
  })

  it('row and the wide layout add their classes', async () => {
    const wrapper = await mountKit(FeatureCheckList, { props: { items: ['a'], row: true, layout: 'wide' } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['feature-checks--row', 'feature-checks--wide']))
  })
})
