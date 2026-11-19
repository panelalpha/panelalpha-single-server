import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { useTheme } from 'vuetify'
import defaultLogoDarkUrl from '@/shared/ui/assets/logo-white.svg'
import defaultLogoLightUrl from '@/shared/ui/assets/logo.svg'
import { mountKit } from '@/test/mount-kit'
import BrandLogo from './BrandLogo.vue'

// Mounts BrandLogo under a given Vuetify theme (the kit reads dark mode from useTheme).
function themed (themeName: 'light' | 'dark', props: Record<string, unknown> = {}) {
  return defineComponent({
    setup () {
      useTheme().change(themeName)
      return () => h(BrandLogo, props)
    },
  })
}

describe('BrandLogo', () => {
  it('renders the legacy logo img with fixed size and class', async () => {
    // Legacy v-img: contain, 200 / 171 x 60
    const wrapper = await mountKit(BrandLogo, { attrs: { 'class': 'mb-10', 'data-testid': 'logo' } })
    const img = wrapper.get('img')
    expect(img.classes()).toEqual(expect.arrayContaining(['brand-logo', 'mb-10']))
    expect(img.attributes('width')).toBe('200')
    expect(img.attributes('height')).toBe('60')
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes('data-testid')).toBe('logo')
    wrapper.unmount()
  })

  it('uses the default light logo', async () => {
    const wrapper = await mountKit(themed('light'))
    expect(wrapper.get('img').attributes('src')).toBe(defaultLogoLightUrl)
    wrapper.unmount()
  })

  it('uses the default dark logo under the dark theme', async () => {
    const wrapper = await mountKit(themed('dark'))
    expect(wrapper.get('img').attributes('src')).toBe(defaultLogoDarkUrl)
    wrapper.unmount()
  })

  it('prefers custom logo / darkLogo per theme', async () => {
    const props = { logo: 'data:image/png;base64,aaa', darkLogo: 'data:image/png;base64,bbb' }
    const light = await mountKit(themed('light', props))
    expect(light.get('img').attributes('src')).toBe('data:image/png;base64,aaa')
    light.unmount()

    const dark = await mountKit(themed('dark', props))
    expect(dark.get('img').attributes('src')).toBe('data:image/png;base64,bbb')
    dark.unmount()
  })
})
