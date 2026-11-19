import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import TimePicker from './TimePicker.vue'

// t(key) answers the key in the kit, so a label reads `4:42 general.am`.
async function items (props: Record<string, unknown>): Promise<string[]> {
  const wrapper = await mountKit(TimePicker, { props })
  const list = wrapper.findComponent({ name: 'VAutocomplete' }).props('items') as string[]
  wrapper.unmount()
  return list
}

describe('TimePicker', () => {
  it('offers the quarter-hour grid when the project has no minute of its own', async () => {
    const options = await items({ modelValue: '4:00 AM' })
    expect(options).toHaveLength(96)
    expect(options).not.toContain('4:42 general.am')
  })

  it('keeps the project\'s own minute in the list, so a saved schedule can be picked again', async () => {
    const options = await items({ modelValue: '4:42 AM', keep: '4:42 AM' })
    expect(options).toContain('4:42 general.am')
    expect(options.indexOf('4:42 general.am')).toBe(options.indexOf('4:30 general.am') + 1)
  })
})
