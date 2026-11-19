import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '@/shared/theme/theme.store'
import { mountKit } from '@/test/mount-kit'
import StyleManagerLogoBox from './StyleManagerLogoBox.vue'

const LOGO = 'data:image/png;base64,iVBORw0KGgo='

async function mountBox (type: 'light' | 'dark', dark: boolean) {
  setActivePinia(createPinia())
  useThemeStore().setDarkMode(dark)
  const wrapper = await mountKit(StyleManagerLogoBox, {
    props: { type, fileData: LOGO, text: 'Logo' },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const previewBox = (wrapper: { element: Element }) => wrapper.element.querySelector('.upload-img__text') as HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(async () => {
  // `applyBodyDarkClasses` drops `no-transition` after 100 ms; let that timer run before jsdom is torn down.
  await new Promise(resolve => setTimeout(resolve, 100))
})

describe('StyleManagerLogoBox preview background', () => {
  it('puts a light logo on the white token in dark mode', async () => {
    const wrapper = await mountBox('light', true)
    expect(previewBox(wrapper).classList.contains('upload-img__text--white')).toBe(true)
    expect(previewBox(wrapper).classList.contains('upload-img__text--dark-bg')).toBe(false)
    expect(previewBox(wrapper).hasAttribute('style')).toBe(false)
  })

  it('puts a dark logo on the dark-background token in light mode', async () => {
    const wrapper = await mountBox('dark', false)
    expect(previewBox(wrapper).classList.contains('upload-img__text--dark-bg')).toBe(true)
    expect(previewBox(wrapper).classList.contains('upload-img__text--white')).toBe(false)
    expect(previewBox(wrapper).hasAttribute('style')).toBe(false)
  })

  it('adds no background class when the logo is already on its own theme', async () => {
    const wrapper = await mountBox('light', false)
    expect(previewBox(wrapper).classList.contains('upload-img__text--white')).toBe(false)
    expect(previewBox(wrapper).classList.contains('upload-img__text--dark-bg')).toBe(false)
  })
})

describe('StyleManagerLogoBox icon buttons', () => {
  it('names the Replace and Remove icon buttons after their i18n keys', async () => {
    const wrapper = await mountBox('light', false)
    const replace = wrapper.element.querySelector('[data-testid="style-manager-logo-replace-light"]')
    const remove = wrapper.element.querySelector('[data-testid="style-manager-logo-remove-light"]')
    expect(replace?.getAttribute('aria-label')).toBe('button.replace')
    expect(remove?.getAttribute('aria-label')).toBe('button.remove')
  })
})
