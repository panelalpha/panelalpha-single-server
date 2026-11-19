// Page of the Advanced frame with setting cards.
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import AdvancedPageLayout from './AdvancedPageLayout.vue'

describe('AdvancedPageLayout', () => {
  it('renders the Advanced page title and, as its next sibling, the card grid with the slot in the row', async () => {
    const wrapper = await mountKit(AdvancedPageLayout, {
      props: { title: 'CDN', titleTestid: 'cdn-title' },
      slots: { default: '<v-col cols="12" data-testid="card">c</v-col>' },
    })

    expect(wrapper.classes()).toContain('advanced-page')
    const title = wrapper.get(':scope > .page-title.page-title--advanced')
    expect(title.get('h4.page-title__title').text()).toBe('CDN')
    expect(title.get('h4').attributes('data-testid')).toBe('cdn-title')
    const cards = title.element.nextElementSibling!
    expect(cards.classList.contains('advanced-page__cards')).toBe(true)
    expect(wrapper.get('.advanced-page__cards > .advanced-page__row > [data-testid="card"]').text()).toBe('c')
    wrapper.unmount()
  })
})
