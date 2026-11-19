import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import FormFieldDocHint from './FormFieldDocHint.vue'

describe('FormFieldDocHint', () => {
  it('renders the hint and links the copy to the documentation link the host passes', async () => {
    const wrapper = await mountKit(FormFieldDocHint, {
      props: {
        hint: 'Create a token.',
        linkText: 'message.link.documentation.howToCreate',
        documentationLink: 'https://docs.example.test/git',
      },
    })

    expect(wrapper.text()).toContain('Create a token.')
    const link = wrapper.get('a')
    expect(link.text()).toBe('message.link.documentation.howToCreate')
    expect(link.attributes('href')).toBe('https://docs.example.test/git')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
    wrapper.unmount()
  })

  it('renders no link when the host passes no documentation link', async () => {
    const wrapper = await mountKit(FormFieldDocHint, { props: { hint: 'Create a token.', linkText: 'How?' } })

    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('Create a token.')
    wrapper.unmount()
  })

  it('renders no link when showDocLink is false', async () => {
    const wrapper = await mountKit(FormFieldDocHint, {
      props: { hint: 'Hint', linkText: 'How?', showDocLink: false, documentationLink: 'https://docs.example.test' },
    })

    expect(wrapper.find('a').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders only the link when there is no hint text', async () => {
    const wrapper = await mountKit(FormFieldDocHint, {
      props: { linkText: 'How?', documentationLink: 'https://docs.example.test' },
    })

    expect(wrapper.find('span').exists()).toBe(false)
    expect(wrapper.get('a').text()).toBe('How?')
    wrapper.unmount()
  })
})
