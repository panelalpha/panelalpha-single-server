// Skeleton of the plugin cards: the bones the installed and the catalogue grids show while loading.
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PluginCardSkeleton from './PluginCardSkeleton.vue'

describe('PluginCardSkeleton', () => {
  it('shows the name, two text lines and three buttons, without a screenshot', async () => {
    const wrapper = await mountKit(PluginCardSkeleton)

    expect(wrapper.findAll('.v-skeleton-loader__image')).toHaveLength(0)
    expect(wrapper.findAll('.v-skeleton-loader__heading')).toHaveLength(1)
    expect(wrapper.findAll('.v-skeleton-loader__chip')).toHaveLength(1)
    expect(wrapper.findAll('.v-skeleton-loader__text')).toHaveLength(2)
    expect(wrapper.findAll('.v-skeleton-loader__button')).toHaveLength(3)
  })
})
