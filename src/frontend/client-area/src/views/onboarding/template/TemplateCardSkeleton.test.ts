// Skeleton of the onboarding template card: the bones the grid shows while the templates load.
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import TemplateCardSkeleton from './TemplateCardSkeleton.vue'

describe('TemplateCardSkeleton', () => {
  it('shows the screenshot and the name bones only', async () => {
    const wrapper = await mountKit(TemplateCardSkeleton)

    expect(wrapper.findAll('.v-skeleton-loader__image')).toHaveLength(1)
    expect(wrapper.findAll('.v-skeleton-loader__heading')).toHaveLength(1)
    expect(wrapper.findAll('.v-skeleton-loader__text')).toHaveLength(0)
    expect(wrapper.findAll('.v-skeleton-loader__button')).toHaveLength(0)
  })
})
