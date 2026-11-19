import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ImageLoader from './ImageLoader.vue'

describe('ImageLoader', () => {
  it('renders the spinner on the loader background', async () => {
    const wrapper = await mountKit(ImageLoader)
    expect(wrapper.classes()).toContain('loader-bg')
    expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
    wrapper.unmount()
  })
})
