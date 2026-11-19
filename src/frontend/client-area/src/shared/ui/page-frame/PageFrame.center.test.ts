// Kit pattern of the page frame: the page tab strip centres the selected tab once after mount, as the
// My Account and Settings strips did before the frame (V2 `center-active` parity).
import { describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PageFrame from './PageFrame.vue'

const { centerActiveTabOnMount } = vi.hoisted(() => ({ centerActiveTabOnMount: vi.fn() }))

vi.mock('@/shared/ui/tabs/center-active-tab', () => ({ centerActiveTabOnMount }))

describe('PageFrame tab strip centring', () => {
  it('centres the selected tab once after mount', async () => {
    const wrapper = await mountKit(PageFrame, {
      props: { title: 'Settings', testidPrefix: 'settings', tabs: [{ value: 0, title: 'General' }, { value: 1, title: 'Backups' }], tab: 1 },
      slots: { default: '<div />' },
    })

    expect(centerActiveTabOnMount).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not centre anything without a tab strip', async () => {
    centerActiveTabOnMount.mockClear()
    const wrapper = await mountKit(PageFrame, { props: { title: 'T', testidPrefix: 'x' }, slots: { default: '<div />' } })

    expect(centerActiveTabOnMount).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
