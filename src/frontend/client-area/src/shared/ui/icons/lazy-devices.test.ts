import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { lazyDeviceIcons, resetDeviceIcons, withDeviceIcons } from './lazy-devices'

describe('lazy device icons', () => {
  afterEach(() => resetDeviceIcons())

  it('keeps every alias the devices table builds (`device-icons.ts`)', () => {
    expect(Object.keys(lazyDeviceIcons).toSorted()).toEqual([
      'androidIcon', 'browserOtherIcon', 'chromeIcon', 'deviceOtherIcon', 'edgeIcon', 'firefoxIcon',
      'linuxIcon', 'macOsIcon', 'operaIcon', 'safariIcon', 'windowsIcon',
    ])
  })

  it('renders the logo once the chunk is in', async () => {
    const wrapper = mount({ render: () => h(lazyDeviceIcons.safariIcon) })
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.find('svg').exists()).toBe(true)
    }, { timeout: 5000 })
  })

  it('withDeviceIcons resolves the view together with the icons', async () => {
    const view = { default: { name: 'View' } }
    await expect(withDeviceIcons(Promise.resolve(view))).resolves.toBe(view)
  })
})
