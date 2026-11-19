import { describe, expect, it } from 'vitest'
import UserAvatar from '@/shared/ui/user-avatar/UserAvatar.vue'
import { mountKit } from '@/test/mount-kit'
import UserItem from './UserItem.vue'

describe('UserItem', () => {
  it('shows the full name and the formatted role chip', async () => {
    const wrapper = await mountKit(UserItem, {
      props: { user: { email: 'a@b.c', first_name: 'Ada', last_name: 'Lovelace', role: 'super_admin' } },
    })
    expect(wrapper.get('.user-item__name').text()).toBe('Ada Lovelace')
    const chip = wrapper.get('.user-item__role')
    expect(chip.text()).toBe('Super Admin')
    expect(chip.classes()).toContain('ml-1')
    wrapper.unmount()
  })

  it('shows the owner chip when the role is null', async () => {
    const wrapper = await mountKit(UserItem, { props: { user: { email: 'a@b.c', role: null } } })
    expect(wrapper.get('.user-item__name').text()).toBe('a@b.c')
    const chip = wrapper.get('.user-item__role')
    expect(chip.text()).toBe('general.owner')
    expect(chip.classes()).toContain('ml-2')
    wrapper.unmount()
  })

  it('renders the avatar at size 28 without a badge', async () => {
    const wrapper = await mountKit(UserItem, { props: { user: { email: 'a@b.c', role: 'editor' } } })
    const avatar = wrapper.findComponent(UserAvatar)
    expect(avatar.props('size')).toBe(28)
    expect(avatar.props('email')).toBe('a@b.c')
    expect(avatar.props('badge')).toBe('')
    wrapper.unmount()
  })
})
