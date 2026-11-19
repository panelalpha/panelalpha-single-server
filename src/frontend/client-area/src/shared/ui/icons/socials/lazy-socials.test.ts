import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { VIcon } from 'vuetify/components'
import vuetify from '@/app/plugins/vuetify'
import { lazySocialIcons, preloadSocialIcons } from './lazy-socials'

describe('lazy social icons', () => {
  it('resolves for known and unknown names alike', async () => {
    await expect(preloadSocialIcons(['github', 'google', 'nope'])).resolves.toBeUndefined()
    await expect(preloadSocialIcons([])).resolves.toBeUndefined()
  })

  it('exposes the four bitmap logos as async components', () => {
    expect(Object.keys(lazySocialIcons).toSorted()).toEqual(['apple', 'github', 'linkedin', 'microsoft'])
  })

  it('draws the logo through the $github alias once the chunk is in memory', async () => {
    await preloadSocialIcons(['github'])
    const wrapper = mount(VIcon, { props: { icon: '$github' }, global: { plugins: [vuetify] } })
    await flushPromises()

    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
