import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import AlertSm from './AlertSm.vue'

describe('AlertSm', () => {
  it('renders the legacy class contract with text', async () => {
    // The markup is `.alert-sm > .alert-sm-icon + .alert-sm-text`.
    const wrapper = await mountKit(AlertSm, { props: { text: 'Hello' } })
    expectLegacyClasses(wrapper.element, ['alert-sm'])
    expectLegacyClasses(wrapper.get('.alert-sm-icon').element, ['alert-sm-icon', 'mr-2'])
    expectLegacyClasses(wrapper.get('.alert-sm-text').element, ['alert-sm-text', 'text--gray-darken1'])
    expect(wrapper.get('.p-sm').text()).toBe('Hello')
    wrapper.unmount()
  })

  it('renders the icon as .v-icon so the primary colour rule reaches it', async () => {
    // Legacy colours `.alert-sm-icon span` (V2 icon = <span>); V4 icon = <i class="v-icon">
    const wrapper = await mountKit(AlertSm, { props: { text: 'Hello' } })
    expect(wrapper.get('.alert-sm-icon .v-icon').element.tagName).toBe('I')
    wrapper.unmount()
    const source = readFileSync('src/shared/ui/alerts/AlertSm.vue', 'utf8')
    const rule = /&--primary\s*\{\s*\.alert-sm-icon\s*\{[\s\S]*?\.v-icon\s*\{\s*color:\s*map\.get\(v\.\$primary, base\)/
    expect(source).toMatch(rule)
  })
})
