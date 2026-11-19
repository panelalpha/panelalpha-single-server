import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ErrorCard from './ErrorCard.vue'

describe('ErrorCard', () => {
  it('renders the error message with no action box', async () => {
    // Now the AppMessage error preset
    const wrapper = await mountKit(ErrorCard, { props: { message: 'Something failed' } })
    expect(wrapper.classes()).toContain('app-message')
    expect(wrapper.classes()).toContain('app-message--error')
    expect(wrapper.find('.app-message__icon').exists()).toBe(true)
    expect(wrapper.get('.app-message__text p').text()).toBe('Something failed')
    expect(wrapper.find('.app-message__action').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders a Retry button that emits retry when the card is retryable', async () => {
    const wrapper = await mountKit(ErrorCard, { props: { message: 'The server did not answer in time.', retryable: true } })

    expect(wrapper.get('.app-message__action [data-testid="error-card-retry"]').text()).toBe('button.retry')
    await wrapper.get('[data-testid="error-card-retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders the action slot in the action box', async () => {
    const wrapper = await mountKit(ErrorCard, {
      props: { message: 'x' },
      slots: { action: '<button class="retry">Retry</button>' },
    })
    expect(wrapper.get('.app-message__action .retry').text()).toBe('Retry')
    wrapper.unmount()
  })
})
