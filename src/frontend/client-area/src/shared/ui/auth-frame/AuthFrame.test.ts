import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { useThemeStore } from '@/shared/theme/theme.store'
import radioLinesUrl from '@/shared/ui/assets/radio-lines.svg'
import { mountKit } from '@/test/mount-kit'
import AuthFrame from './AuthFrame.vue'

async function mountFrame (options: { attrs?: Record<string, unknown> } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return {
    pinia,
    wrapper: await mountKit(AuthFrame, {
      ...options,
      slots: { default: () => h('div', { 'class': 'v-card', 'data-testid': 'slot-card' }) },
      global: { plugins: [pinia] },
    }),
  }
}

describe('AuthFrame', () => {
  it('renders the legacy frame: container, background, column, logo, then the slot', async () => {
    const { wrapper } = await mountFrame()
    const root = wrapper.get('.full-height-container')
    expect(root.classes()).toContain('px-6')

    const background = root.get('img.radio-lines')
    expect(background.attributes('src')).toBe(radioLinesUrl)
    expect(background.attributes('alt')).toBe('')
    expect(background.attributes('aria-hidden')).toBe('true')

    const column = root.get('.login-container')
    expect(column.classes()).toEqual(expect.arrayContaining(['d-flex', 'flex-column', 'align-center']))
    const children = column.element.children
    expect(children[0]?.classList.contains('brand-logo')).toBe(true)
    expect(children[0]?.classList.contains('mb-10')).toBe(true)
    expect((children[1] as HTMLElement | undefined)?.dataset.testid).toBe('slot-card')
    wrapper.unmount()
  })

  it('passes the branding logos from the theme store', async () => {
    const { wrapper } = await mountFrame()
    useThemeStore().changeColorsTheme({ logo: 'data:image/png;base64,aaa', darkLogo: 'data:image/png;base64,bbb' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('img.brand-logo').attributes('src')).toBe('data:image/png;base64,aaa')
    wrapper.unmount()
  })

  it('forwards host attributes to the frame root', async () => {
    const { wrapper } = await mountFrame({ attrs: { 'data-testid': 'frame' } })
    expect(wrapper.get('.full-height-container').attributes('data-testid')).toBe('frame')
    wrapper.unmount()
  })
})
