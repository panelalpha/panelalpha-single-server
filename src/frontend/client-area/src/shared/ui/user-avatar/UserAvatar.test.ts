import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import UserAvatar from './UserAvatar.vue'

describe('UserAvatar', () => {
  it('renders user-avatar with Gravatar src from email', async () => {
    // Email is required (the screen passes the session email)
    const wrapper = await mountKit(UserAvatar, {
      props: { email: 'test@example.com', size: 48, badge: 'success' },
    })
    expectLegacyClasses(wrapper.get('.user-avatar').element, ['user-avatar'])
    const img = wrapper.find('.v-img')
    expect(img.exists()).toBe(true)
    expect(wrapper.html()).toContain('gravatar.com/avatar/55502f40dc8b7c769880b10874abc9d0.jpg')
    expect(wrapper.find('.user-dot-badge').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not throw without an email', async () => {
    const wrapper = await mountKit(UserAvatar, { props: { email: undefined as unknown as string } })
    expect(wrapper.find('.user-avatar').exists()).toBe(true)
    wrapper.unmount()
  })
})
