// The catalogue card skeleton of the kit: props switch the screenshot, the text and actions and the buttons.
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import CatalogCardSkeleton from './CatalogCardSkeleton.vue'

async function bones (props: Record<string, unknown>) {
  const wrapper = await mountKit(CatalogCardSkeleton, { props })
  const count = (name: string) => wrapper.findAll(`.v-skeleton-loader__${name}`).length
  return { image: count('image'), heading: count('heading'), chip: count('chip'), text: count('text'), button: count('button') }
}

describe('CatalogCardSkeleton', () => {
  it('has the name, two text lines and two buttons by default', async () => {
    expect(await bones({})).toEqual({ image: 0, heading: 1, chip: 1, text: 2, button: 2 })
  })

  it('adds the screenshot with media', async () => {
    expect(await bones({ media: true })).toEqual({ image: 1, heading: 1, chip: 1, text: 2, button: 2 })
  })

  it('drops the text and the actions with titleOnly', async () => {
    expect(await bones({ media: true, titleOnly: true })).toEqual({ image: 1, heading: 1, chip: 1, text: 0, button: 0 })
  })

  it('renders the given number of buttons', async () => {
    expect(await bones({ buttons: 3 })).toEqual({ image: 0, heading: 1, chip: 1, text: 2, button: 3 })
  })
})
