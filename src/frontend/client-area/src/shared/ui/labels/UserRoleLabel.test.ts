import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { useTheme } from 'vuetify'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import UserRoleLabel from './UserRoleLabel.vue'

describe('UserRoleLabel', () => {
  it('renders a small chip with the role text and light variables', async () => {
    // Administrator, light theme
    const wrapper = await mountKit(UserRoleLabel, { props: { role: 'author' } })
    expectLegacyClasses(wrapper.element, ['v-chip', 'v-chip--size-small', 'user-role-label'])
    const style = wrapper.attributes('style')!
    expect(style).toContain('background-color: var(--v-role-author-light-bg)')
    expect(style).toContain('border-color: var(--v-role-author-light-bg)')
    const text = wrapper.get('span.p-3')
    expect(text.text()).toBe('author')
    expect(text.attributes('style')).toContain('color: var(--v-primary-base)')
    wrapper.unmount()
  })

  it('paints administrator from the sand theme colours', async () => {
    const wrapper = await mountKit(UserRoleLabel, { props: { role: 'administrator' } })
    expect(wrapper.attributes('style')).toContain('--v-theme-sand-lighten-5')
    expect(wrapper.get('span.p-3').attributes('style')).toContain('--v-theme-sand-darken-2')
    wrapper.unmount()
  })

  it('uses the dark variables in the dark theme', async () => {
    const Dark = defineComponent({
      setup () {
        useTheme().change('dark')
        return () => h(UserRoleLabel, { role: 'editor' })
      },
    })
    const wrapper = await mountKit(Dark)
    expect(wrapper.get('.v-chip').attributes('style')).toContain('--v-role4-bg')
    expect(wrapper.get('span.p-3').attributes('style')).toContain('--v-role4-text')
    wrapper.unmount()
  })

  it('renders nothing for an unknown or missing role', async () => {
    const unknown = await mountKit(UserRoleLabel, { props: { role: 'owner' } })
    expect(unknown.find('.v-chip').exists()).toBe(false)
    unknown.unmount()
    const missing = await mountKit(UserRoleLabel)
    expect(missing.find('.v-chip').exists()).toBe(false)
    missing.unmount()
    const inherited = await mountKit(UserRoleLabel, { props: { role: 'constructor' } })
    expect(inherited.find('.v-chip').exists()).toBe(false)
    inherited.unmount()
  })
})
