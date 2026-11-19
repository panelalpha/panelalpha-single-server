import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import SettingCardSkeleton from './SettingCardSkeleton.vue'

describe('SettingCardSkeleton', () => {
  it('renders V4 skeleton bones with bg-text class', async () => {
    // `.text` becomes `.bg-text`
    const wrapper = await mountKit(SettingCardSkeleton)
    expect(wrapper.find('.v-card').exists()).toBe(true)
    const textLoaders = wrapper.findAll('.v-skeleton-loader.bg-text')
    expect(textLoaders.length).toBe(2)
    expectLegacyClasses(wrapper.get('.v-skeleton-loader.switch').element, ['switch'])
    wrapper.unmount()
  })
})
