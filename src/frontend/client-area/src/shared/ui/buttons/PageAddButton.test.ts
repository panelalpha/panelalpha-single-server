// Add button of a page title: label on every width, size per width, states and events.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PageAddButton from './PageAddButton.vue'

const width = window.innerWidth

async function mountButton (innerWidth: number, props: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
  window.innerWidth = innerWidth
  return mountKit(PageAddButton, { props: { label: 'button.cron.add', ...props }, attrs })
}

describe('PageAddButton', () => {
  afterEach(() => {
    window.innerWidth = width
  })

  it('is the large green page-add button with the icon, the label and no aria-label on desktop', async () => {
    const wrapper = await mountButton(1500, {})

    for (const cls of ['p-2', 'add-new-button', 'page-title__add-button', 'bg-primary', 'v-btn--size-large']) {
      expect(wrapper.classes()).toContain(cls)
    }
    expect(wrapper.text()).toBe('button.cron.add')
    expect(wrapper.attributes('aria-label')).toBeUndefined()
    expect(wrapper.find('.v-icon').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the icon and the label below 976 px (issue #23); large from md, small below, no extra aria-label', async () => {
    const tablet = await mountButton(800, {})
    expect(tablet.text()).toBe('button.cron.add')
    expect(tablet.attributes('aria-label')).toBeUndefined()
    expect(tablet.classes()).toContain('v-btn--size-large')
    expect(tablet.find('.v-icon').exists()).toBe(true)
    tablet.unmount()

    const phone = await mountButton(375, {})
    expect(phone.text()).toBe('button.cron.add')
    expect(phone.classes()).toContain('v-btn--size-small')
    expect(phone.attributes('aria-label')).toBeUndefined()
    expect(phone.find('.v-icon').exists()).toBe(true)
    phone.unmount()
  })

  it('takes a fixed accessible name from ariaLabel on every width', async () => {
    const wrapper = await mountButton(1500, { ariaLabel: 'button.apiToken.create' })
    expect(wrapper.attributes('aria-label')).toBe('button.apiToken.create')
    wrapper.unmount()
  })

  it('passes loading, disabled, the test id and the click to the button', async () => {
    const onClick = vi.fn()
    const wrapper = await mountButton(1500, {}, { 'data-testid': 'cron-add', onClick })
    expect(wrapper.attributes('data-testid')).toBe('cron-add')
    await wrapper.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    wrapper.unmount()

    const loading = await mountButton(1500, { loading: true })
    expect(loading.classes()).toContain('v-btn--loading')
    loading.unmount()

    const disabled = await mountButton(1500, { disabled: true })
    expect(disabled.attributes('disabled')).toBeDefined()
    disabled.unmount()
  })
})
