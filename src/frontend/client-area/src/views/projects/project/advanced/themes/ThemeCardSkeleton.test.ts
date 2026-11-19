// Skeleton of the theme cards: the bones the installed and the catalogue grids show while loading.
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ThemeCardSkeleton from './ThemeCardSkeleton.vue'

describe('ThemeCardSkeleton', () => {
  it('shows the screenshot, the name, two text lines and two buttons', async () => {
    const wrapper = await mountKit(ThemeCardSkeleton)

    expect(wrapper.findAll('.v-skeleton-loader__image')).toHaveLength(1)
    expect(wrapper.findAll('.v-skeleton-loader__heading')).toHaveLength(1)
    expect(wrapper.findAll('.v-skeleton-loader__chip')).toHaveLength(1)
    expect(wrapper.findAll('.v-skeleton-loader__text')).toHaveLength(2)
    expect(wrapper.findAll('.v-skeleton-loader__button')).toHaveLength(2)
  })
})
