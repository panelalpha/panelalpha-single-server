// Screenshot and hover buttons of the installed theme card: written on the code before the move of
// the screenshot onto `CatalogCardMedia`. The rest of the card is covered by `ThemeCard.test.ts`.
import type { VueWrapper } from '@vue/test-utils'
import type { InstalledTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import { themeScreenshotSrc } from '@/entities/project/instance-themes.api'
import { mountKit } from '@/test/mount-kit'
import ThemeCard from './ThemeCard.vue'

function theme (overrides: Partial<InstalledTheme> = {}): InstalledTheme {
  return { name: 'twentytwentyfive', title: 'Twenty Twenty-Five', status: 'inactive', version: '1.0.0', description: 'Short description.', ...overrides }
}

function buttonWithText (wrapper: VueWrapper, text: string) {
  return wrapper.findAllComponents({ name: 'VBtn' }).find(button => button.text().includes(text))
}

describe('ThemeCard screenshot', () => {
  it('shows the screenshot of the instance theme', async () => {
    const wrapper = await mountKit(ThemeCard, { props: { item: theme(), checked: false, instanceId: 7 } })

    expect(wrapper.findComponent({ name: 'VImg' }).props('src')).toBe(themeScreenshotSrc(7, 'twentytwentyfive'))
  })

  it('links the hover Preview to wp-themes in a new tab, also on the active theme', async () => {
    const wrapper = await mountKit(ThemeCard, { props: { item: theme({ status: 'active' }), checked: false, instanceId: 7 } })
    const preview = buttonWithText(wrapper, 'button.preview')!

    expect(preview.attributes('href')).toBe('https://wp-themes.com/twentytwentyfive')
    expect(preview.attributes('target')).toBe('_blank')
    expect(preview.attributes('rel')).toBe('noopener noreferrer')
  })
})
