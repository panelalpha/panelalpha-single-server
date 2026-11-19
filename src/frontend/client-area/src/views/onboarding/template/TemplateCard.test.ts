// Behaviour of the onboarding template card: written on the code before the catalogue card pattern,
// so the same tests guard the move onto `CatalogCard`. Locators: the `VBtn` and `VImg` components and their text, not CSS structure.
import type { OnboardingTheme } from '@/views/onboarding/onboarding.api'
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { themeScreenshotUrl } from '@/views/onboarding/onboarding.api'
import { mountKit } from '@/test/mount-kit'
import TemplateCard from './TemplateCard.vue'

function template (overrides: Partial<OnboardingTheme> = {}): OnboardingTheme {
  return { id: 3, name: 'Astra', slug: 'astra', screenshot_url: 'https://cdn.example/astra.png', preview_url: 'https://demo.example/astra', ...overrides }
}

function buttonWithText (wrapper: VueWrapper, text: string) {
  return wrapper.findAllComponents({ name: 'VBtn' }).find(button => button.text().includes(text))
}

async function mountCard (item: OnboardingTheme, props: Record<string, unknown> = {}) {
  return mountKit(TemplateCard, { props: { item, ...props } })
}

describe('TemplateCard', () => {
  it('shows the template name', async () => {
    const wrapper = await mountCard(template())

    expect(wrapper.text()).toContain('Astra')
  })

  it('emits the template when Use is clicked', async () => {
    const item = template()
    const wrapper = await mountCard(item)

    await buttonWithText(wrapper, 'button.theme.use')!.trigger('click')
    expect(wrapper.emitted('select-theme')?.[0]).toEqual([item])
  })

  it('opens the preview in a new tab (K-39)', async () => {
    const wrapper = await mountCard(template())
    const preview = buttonWithText(wrapper, 'button.preview')!

    expect(preview.attributes('href')).toBe('https://demo.example/astra')
    expect(preview.attributes('target')).toBe('_blank')
    expect(preview.attributes('rel')).toBe('noopener noreferrer')
  })

  it('has no preview button without a preview url', async () => {
    const wrapper = await mountCard(template({ preview_url: undefined }))

    expect(buttonWithText(wrapper, 'button.preview')).toBeUndefined()
    expect(buttonWithText(wrapper, 'button.theme.use')).toBeDefined()
  })

  it('takes the screenshot of a custom template from the API and the others from the item', async () => {
    const custom = await mountCard(template({ type: 'custom', id: 5 }))
    expect(custom.findComponent({ name: 'VImg' }).props('src')).toBe(themeScreenshotUrl(5))

    const other = await mountCard(template())
    expect(other.findComponent({ name: 'VImg' }).props('src')).toBe('https://cdn.example/astra.png')
  })

  it('puts Use in its loading state with the Creating label while loading', async () => {
    const wrapper = await mountCard(template(), { loading: true })
    const use = buttonWithText(wrapper, 'button.theme.use')!

    expect(use.props('loading')).toBe(true)
    expect(use.text()).toContain('button.domain.creating')
  })
})
