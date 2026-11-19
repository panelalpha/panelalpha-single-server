import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import SupportLink from './SupportLink.vue'

describe('SupportLink', () => {
  it('renders the support sentence with the link to the support page', async () => {
    const wrapper = await mountKit(SupportLink, { props: { href: 'https://support.example.test' } })

    const paragraph = wrapper.get('p')
    expect(paragraph.text().replace(/\s+/g, ' ')).toBe('message.support.before message.support.link message.support.after')
    const link = paragraph.get('a.text-info')
    expect(link.attributes('href')).toBe('https://support.example.test')
    expect(link.text()).toBe('message.support.link')
    wrapper.unmount()
  })

  it('renders the link without href when there is no support link', async () => {
    const wrapper = await mountKit(SupportLink)

    expect(wrapper.get('a.text-info').attributes('href')).toBeUndefined()
    wrapper.unmount()
  })
})
