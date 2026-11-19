import type * as ImageUploadModule from './image-upload'
import type { HomeResponse } from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VApp, VColorPicker } from 'vuetify/components'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { useThemeStore } from '@/shared/theme/theme.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import { PREDEFINED_COLOR_GROUPS } from './color-groups'
import { MAX_IMAGE_BYTES, readImageAsDataUrl } from './image-upload'
import { putResellerBranding, putUserappBranding } from './style-manager.api'
import StyleManagerMenu from './StyleManagerMenu.vue'

// jsdom has no canvas or image loading: the conversion is replaced, the limit check stays real.
vi.mock('./image-upload', async importOriginal => ({
  ...await importOriginal<typeof ImageUploadModule>(),
  readImageAsDataUrl: vi.fn(),
}))

vi.mock('./style-manager.api', () => ({
  putResellerBranding: vi.fn(),
  putUserappBranding: vi.fn(),
}))

// The V4 drawer is a layout item: it needs a `v-app` (the shell mounts it inside one).
const Host = defineComponent({
  props: { reseller: { type: Boolean, default: false } },
  setup: props => () => h(VApp, null, () => h(StyleManagerMenu, { reseller: props.reseller })),
})

const FLAG_KEY = `${window.location.origin}-style-manager`

function makeRouter (history = createMemoryHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/other', name: 'other', component: { template: '<div />' } },
    ],
  })
}

async function setup (props: { reseller?: boolean } = {}, initial = '/') {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.push(initial)
  const wrapper = await mountKit(Host, {
    props,
    attachTo: document.body,
    global: { plugins: [router] },
  })
  await flushPromises()
  return { router, wrapper }
}

const drawer = () => document.body.querySelector('[data-testid="style-manager-drawer"]') as HTMLElement
const activator = () => document.body.querySelector('[data-testid="style-manager-activator"]') as HTMLElement | null
const isOpen = () => drawer().classList.contains('v-navigation-drawer--active')

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  resetAppEvents()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  // `applyBodyDarkClasses` drops `no-transition` after 100 ms; let that timer run before jsdom is torn down.
  await new Promise(resolve => setTimeout(resolve, 100))
})

describe('StyleManagerMenu frame', () => {
  it('renders the title, the sections and the footer buttons, closed', async () => {
    await setup({ reseller: false })
    expect(isOpen()).toBe(false)
    expect(drawer().textContent).toContain('heading.styleManager.title')
    for (const key of ['darkMode', 'logo', 'favicon', 'colorScheme', 'primaryColor']) {
      expect(drawer().textContent).toContain(`heading.styleManager.${key}.title`)
    }
    expect(document.body.querySelector('[data-testid="style-manager-save"]')?.textContent).toContain('button.saveChanges')
    expect(document.body.querySelector('[data-testid="style-manager-restore"]')?.textContent).toContain('button.restoreDefault')
  })

  it('has no activator for a plain admin (no flag, no ?branding)', async () => {
    await setup({ reseller: false })
    expect(activator()).toBeNull()
  })
})

describe('StyleManagerMenu opening', () => {
  it('opens and closes on the style-manager-open / style-manager-close events', async () => {
    await setup({ reseller: true })
    emit('style-manager-open')
    await flushPromises()
    expect(isOpen()).toBe(true)
    emit('style-manager-close')
    await flushPromises()
    expect(isOpen()).toBe(false)
  })

  it('shows and hides the activator on the activator events (admin variant)', async () => {
    await setup({ reseller: false })
    emit('style-manager-activator-show')
    await flushPromises()
    expect(activator()?.textContent).toContain('button.customize')
    emit('style-manager-activator-hide')
    await flushPromises()
    expect(activator()).toBeNull()
  })

  it('never shows the activator to a reseller, even on the activator event or a stored flag', async () => {
    localStorage.setItem(FLAG_KEY, 'true')
    await setup({ reseller: true })
    emit('style-manager-activator-show')
    await flushPromises()
    expect(activator()).toBeNull()
  })

  it('toggles the drawer from the activator', async () => {
    localStorage.setItem(FLAG_KEY, 'true')
    await setup({ reseller: false })
    expect(activator()).not.toBeNull()
    activator()!.click()
    await flushPromises()
    expect(isOpen()).toBe(true)
    activator()!.click()
    await flushPromises()
    expect(isOpen()).toBe(false)
  })

  it('exposes the activator as a named button and toggles it with Enter and Space', async () => {
    localStorage.setItem(FLAG_KEY, 'true')
    await setup({ reseller: false })
    const tab = activator()!
    expect(tab.getAttribute('role')).toBe('button')
    expect(tab.getAttribute('tabindex')).toBe('0')
    expect(tab.getAttribute('aria-label')).toBe('button.customize')
    expect(tab.getAttribute('aria-expanded')).toBe('false')

    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(isOpen()).toBe(true)
    expect(activator()!.getAttribute('aria-expanded')).toBe('true')

    activator()!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(isOpen()).toBe(false)
    expect(activator()!.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on a click outside the drawer', async () => {
    localStorage.setItem(FLAG_KEY, 'true')
    await setup({ reseller: false })
    emit('style-manager-open')
    await flushPromises()
    expect(isOpen()).toBe(true)

    // V4 `ClickOutside` needs a mousedown outside, then the click, and hands the close to a `setTimeout(0)`.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 10))
    await flushPromises()
    expect(isOpen()).toBe(false)
  })

  it('admin: the flag shows the activator without opening', async () => {
    localStorage.setItem(FLAG_KEY, 'true')
    await setup({ reseller: false })
    expect(activator()).not.toBeNull()
    expect(isOpen()).toBe(false)
  })

  it('admin: ?branding on the initial route opens after 1000 ms, shows the activator and stores the flag', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await setup({ reseller: false }, '/?branding=1')
    expect(isOpen()).toBe(false)
    expect(localStorage.getItem(FLAG_KEY)).toBeNull()

    await vi.advanceTimersByTimeAsync(999)
    expect(isOpen()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(isOpen()).toBe(true)
    expect(activator()).not.toBeNull()
    expect(localStorage.getItem(FLAG_KEY)).toBe('true')
  })

  it('mounted before the first navigation ends: ?branding opens for an admin, not for a reseller', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    for (const reseller of [false, true]) {
      document.body.innerHTML = ''
      localStorage.clear()
      setActivePinia(createPinia())
      // `router.install` (inside the mount) starts the initial navigation, so the component is set up while it is pending.
      const history = createMemoryHistory()
      history.replace('/?branding=1')
      const router = makeRouter(history)
      const wrapper = await mountKit(Host, {
        props: { reseller },
        attachTo: document.body,
        global: { plugins: [router] },
      })
      expect(router.currentRoute.value.query.branding).toBeUndefined()
      // The drawer's `v-menu`s (colour editors) install a `router.beforeEach` guard that defers `next()` with `setTimeout`
      // (Vuetify `useBackButton`), and `setTimeout` is faked here, so the pending navigation has to be let through first.
      await vi.advanceTimersByTimeAsync(0)
      await router.isReady()
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()

      expect(isOpen()).toBe(!reseller)
      expect(activator() !== null).toBe(!reseller)
      expect(localStorage.getItem(FLAG_KEY)).toBe(reseller ? null : 'true')
      wrapper.unmount()
    }
  })

  it('opens when the query gains ?branding later (both roles), not on other query changes', async () => {
    for (const reseller of [false, true]) {
      document.body.innerHTML = ''
      const { router, wrapper } = await setup({ reseller })
      await router.push('/other')
      await flushPromises()
      expect(isOpen()).toBe(false)

      await router.push('/other?branding=1')
      await flushPromises()
      expect(isOpen()).toBe(true)
      wrapper.unmount()
    }
  })

  it('opens on the login route in demo mode only', async () => {
    const off = await setup({ reseller: true })
    await off.router.push('/login')
    await flushPromises()
    expect(isOpen()).toBe(false)
    off.wrapper.unmount()

    document.body.innerHTML = ''
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const on = await setup({ reseller: true })
    await on.router.push('/login')
    await flushPromises()
    expect(isOpen()).toBe(true)
  })
})

describe('StyleManagerMenu mode and additional sections', () => {
  const sw = (id: string) => document.body.querySelector(`[data-testid="${CSS.escape(id)}"] input`) as HTMLInputElement

  it('dark switch sets themeStore.isDark and writes isDarkMode before the body classes change', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    expect(store.isDark).toBe(false)
    const order: string[] = []
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string) {
      if (key === 'isDarkMode') {
        order.push(`storage:${document.body.classList.contains('is-dark') ? 'dark' : 'not-dark'}`)
      }
    })
    sw('style-manager-dark-mode').click()
    await flushPromises()
    setItem.mockRestore()
    expect(order).toEqual(['storage:not-dark'])
    expect(store.isDark).toBe(true)
    expect(document.body.classList.contains('is-dark')).toBe(true)
  })

  it('hides the Additional section when the stored style is empty and shows it for a non-empty style', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    const shadows = () => document.body.querySelector('[data-testid="style-manager-disable-shadows"]')
    expect(shadows()).not.toBeNull()

    store.changeColorsTheme({ style: {} })
    await flushPromises()
    expect(shadows()).toBeNull()

    store.changeColorsTheme({ style: { disableShadows: false, allowToChangeMode: false, darkMode: false } })
    await flushPromises()
    expect(shadows()).not.toBeNull()
  })

  it('"Let Users Switch" writes allowToChangeMode and keeps the logos', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    store.changeColorsTheme({ style: { ...store.style }, logo: 'data:image/png;base64,AA', darkLogo: false, favicon: false })
    sw('style-manager-allow-mode').click()
    await flushPromises()
    expect(store.style.allowToChangeMode).toBe(true)
    expect(store.lightLogo).toBe('data:image/png;base64,AA')
  })

  it('shadow switch toggles disableShadows exactly once per click', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    const el = sw('style-manager-disable-shadows')
    expect(store.style.disableShadows).toBe(false)
    el.click()
    await flushPromises()
    expect(store.style.disableShadows).toBe(true)
    el.click()
    await flushPromises()
    expect(store.style.disableShadows).toBe(false)
  })
})

describe('StyleManagerMenu palette and primary editor', () => {
  const groupSwatches = () => document.body.querySelectorAll<HTMLElement>('[data-testid="style-manager-color-groups"] .color-swatch')

  it('a click on a palette group sets themeStore.colors.primary to the whole group and keeps the logos', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    store.changeColorsTheme({ style: { ...store.style }, logo: 'data:image/png;base64,AA', darkLogo: false, favicon: false })
    expect(groupSwatches()).toHaveLength(5)
    groupSwatches()[2].click()
    await flushPromises()
    expect(store.colors.primary).toEqual(PREDEFINED_COLOR_GROUPS[2])
    expect(store.lightLogo).toBe('data:image/png;base64,AA')
    expect(groupSwatches()[2].classList.contains('color-swatch--active')).toBe(true)
    expect(document.body.querySelectorAll('[data-testid="style-manager-color-groups"] .color-swatch--active')).toHaveLength(1)
  })

  it('no swatch is active when the colours match no group', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    store.changeColorsTheme({ colors: { base: '#123456' } })
    await flushPromises()
    expect(document.body.querySelectorAll('[data-testid="style-manager-color-groups"] .color-swatch--active')).toHaveLength(0)
  })

  it('renders one editor per shade with the upper-case HEX, and editing one shade updates only that shade', async () => {
    const { wrapper } = await setup({ reseller: true })
    const store = useThemeStore()
    store.changeColorsTheme({ colors: { ...PREDEFINED_COLOR_GROUPS[0], lighten1: '#1fd895' } })
    await flushPromises()
    const editor = document.body.querySelector('[data-testid="style-manager-editor-lighten1"]') as HTMLElement
    expect(editor.textContent).toContain('form.option.color.lighten1')
    expect(editor.textContent).toContain('#1FD895')
    expect(document.body.querySelectorAll('[data-testid^="style-manager-editor-"]')).toHaveLength(5)

    editor.querySelector('button')!.click()
    await flushPromises()
    const picker = wrapper.findAllComponents(VColorPicker)[0]
    expect(picker).toBeDefined()
    picker.vm.$emit('update:modelValue', '#aabbcc')
    // The editor sends the picked colour once per animation frame (`StyleManagerEditor.vue`, `requestAnimationFrame(flush)`).
    // Frame callbacks run in the order they were requested, so the frame awaited here comes after the editor's flush;
    // `flushPromises()` alone does not wait for a frame and passed only when the jsdom frame happened to fire first.
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    await flushPromises()
    expect(store.colors.primary).toEqual({ ...PREDEFINED_COLOR_GROUPS[0], lighten1: '#AABBCC' })
  })
})

describe('StyleManagerMenu logos and favicon', () => {
  const input = (testId: string) => document.body.querySelector(`[data-testid="${CSS.escape(testId)}"]`) as HTMLInputElement

  async function pick (testId: string, file: File) {
    const el = input(testId)
    Object.defineProperty(el, 'files', { value: [file], configurable: true })
    el.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  function tooLarge () {
    const file = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: MAX_IMAGE_BYTES + 1 })
    return file
  }

  beforeEach(() => {
    vi.mocked(readImageAsDataUrl).mockReset()
    vi.mocked(readImageAsDataUrl).mockResolvedValue('data:image/png;base64,NEW')
  })

  it.each([
    ['style-manager-logo-input-light', 'lightLogo'],
    ['style-manager-logo-input-dark', 'darkLogo'],
    ['style-manager-favicon-input', 'favicon'],
  ] as const)('%s: a file over 2 MB raises an error alert and leaves the store alone', async (testId, field) => {
    await setup({ reseller: true })
    const store = useThemeStore()
    await pick(testId, tooLarge())
    expect(readImageAsDataUrl).not.toHaveBeenCalled()
    expect(store[field]).toBe(false)
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'notification.style.image.tooLarge' }])
  })

  it.each([
    ['style-manager-logo-input-light', 'lightLogo'],
    ['style-manager-logo-input-dark', 'darkLogo'],
    ['style-manager-favicon-input', 'favicon'],
  ] as const)('%s: a valid file sets the store field and keeps the others', async (testId, field) => {
    await setup({ reseller: true })
    const store = useThemeStore()
    const colors = { ...store.colors.primary }
    await pick(testId, new File(['x'], 'a.png', { type: 'image/png' }))
    expect(store[field]).toBe('data:image/png;base64,NEW')
    for (const other of (['lightLogo', 'darkLogo', 'favicon'] as const).filter(f => f !== field)) {
      expect(store[other]).toBe(false)
    }
    expect(store.colors.primary).toEqual(colors)
    expect(useAlertsStore().activeAlerts).toHaveLength(0)
  })

  it('renders the preview of a set logo as an img (also for SVG markup) and Remove clears only that logo', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    store.changeColorsTheme({ style: { ...store.style }, logo: '<svg width="1" height="1"></svg>', darkLogo: 'data:image/png;base64,D', favicon: 'data:image/png;base64,F' })
    await flushPromises()
    const img = document.body.querySelector('.upload-img--done .upload-img__preview-img') as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(document.body.querySelector('.upload-img__preview-svg')).toBeNull()

    ;(document.body.querySelector('[data-testid="style-manager-logo-remove-light"]') as HTMLElement).click()
    await flushPromises()
    expect(store.lightLogo).toBe(false)
    expect(store.darkLogo).toBe('data:image/png;base64,D')
    expect(store.favicon).toBe('data:image/png;base64,F')
  })

  it('Remove on the favicon clears it', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    store.changeColorsTheme({ style: { ...store.style }, favicon: 'data:image/png;base64,F' })
    await flushPromises()
    ;(document.body.querySelector('[data-testid="style-manager-favicon-remove"]') as HTMLElement).click()
    await flushPromises()
    expect(store.favicon).toBe(false)
  })

  it('a dropped file on the favicon area is converted and stored, and the hover state ends', async () => {
    await setup({ reseller: true })
    const store = useThemeStore()
    const area = document.body.querySelector('[data-testid="style-manager-favicon-input"]')!.closest('.upload-img') as HTMLElement
    const dropTarget = area.parentElement!.parentElement as HTMLElement
    area.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(area.classList.contains('upload-img--hover')).toBe(true)
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    dropTarget.dispatchEvent(drop)
    await flushPromises()
    expect(store.favicon).toBe('data:image/png;base64,NEW')
    expect(area.classList.contains('upload-img--hover')).toBe(false)
  })
})

describe('StyleManagerMenu Save and Restore Default', () => {
  const click = async (testId: string) => {
    ;(document.body.querySelector(`[data-testid="${CSS.escape(testId)}"]`) as HTMLElement).click()
    await flushPromises()
  }

  function withHome (home: Partial<HomeResponse>) {
    useSessionStore().home = { app: {}, ...home } as HomeResponse
  }

  const saveBtn = () => document.body.querySelector('[data-testid="style-manager-save"]') as HTMLElement

  beforeEach(() => {
    vi.mocked(putResellerBranding).mockReset().mockResolvedValue()
    vi.mocked(putUserappBranding).mockReset().mockResolvedValue()
  })

  it('reseller Save: shows loading, PUTs the payload, alerts success and stores theme + isDarkMode', async () => {
    let resolve!: () => void
    vi.mocked(putResellerBranding).mockReturnValue(new Promise<void>(done => {
      resolve = done
    }))
    await setup({ reseller: true })
    const store = useThemeStore()
    store.setDarkMode(true)
    store.changeColorsTheme({ colors: { base: '#123456' }, style: { ...store.style }, logo: 'L' })

    saveBtn().click()
    await flushPromises()
    expect(saveBtn().classList.contains('v-btn--loading')).toBe(true)
    resolve()
    await flushPromises()

    expect(saveBtn().classList.contains('v-btn--loading')).toBe(false)
    expect(putUserappBranding).not.toHaveBeenCalled()
    const payload = vi.mocked(putResellerBranding).mock.calls[0][0]
    expect(payload).toMatchObject({ colors: { base: '#123456' }, style: { darkMode: true }, logo: 'L', darkLogo: false, favicon: false })
    expect(JSON.parse(localStorage.getItem('theme')!)).toEqual(payload)
    expect(localStorage.getItem('isDarkMode')).toBe('true')
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.style.update.success' }])
  })

  it('admin Save PUTs the userapp endpoint', async () => {
    await setup({ reseller: false })
    withHome({ admin: { app_url: 'x' } })
    await click('style-manager-save')
    expect(putUserappBranding).toHaveBeenCalledTimes(1)
    expect(putResellerBranding).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: true }])
  })

  it('an API error raises an error alert and ends loading', async () => {
    vi.mocked(putUserappBranding).mockRejectedValue({ response: { status: 422, data: { message: 'Nope' } } })
    await setup({ reseller: false })
    withHome({ admin: { app_url: 'x' } })
    await click('style-manager-save')
    expect(saveBtn().classList.contains('v-btn--loading')).toBe(false)
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: expect.stringContaining('Nope') }])
  })

  it('Save without an endpoint (D6) only writes localStorage: no request, no loading, no alert', async () => {
    await setup({ reseller: false })
    withHome({})
    await click('style-manager-save')
    expect(putUserappBranding).not.toHaveBeenCalled()
    expect(putResellerBranding).not.toHaveBeenCalled()
    expect(saveBtn().classList.contains('v-btn--loading')).toBe(false)
    expect(localStorage.getItem('theme')).not.toBeNull()
    expect(useAlertsStore().activeAlerts).toHaveLength(0)
  })

  it('Restore Default with default_theme applies it, saves it and leaves home.app.default_theme untouched', async () => {
    await setup({ reseller: true })
    const defaults = { colors: { base: '#0000ff', lighten1: '#1', lighten2: '#2', lighten4: '#4', darken1: '#5' }, style: { darkMode: true, disableShadows: true, allowToChangeMode: true }, logo: 'DL', darkLogo: false as const, favicon: false as const }
    withHome({ app: { default_theme: structuredClone(defaults) } })
    const store = useThemeStore()
    document.body.classList.add('is-light')
    await click('style-manager-restore')

    expect(store.colors.primary).toEqual(defaults.colors)
    expect(store.style).toEqual(defaults.style)
    expect(store.lightLogo).toBe('DL')
    expect(store.isDark).toBe(true)
    expect(document.body.classList.contains('is-dark')).toBe(true)
    expect(localStorage.getItem('isDarkMode')).toBe('true')
    expect(putResellerBranding).toHaveBeenCalledWith(expect.objectContaining({ colors: defaults.colors, logo: 'DL' }))
    expect(useSessionStore().home?.app?.default_theme).toEqual(defaults)
    store.setDarkMode(false)
    expect(useSessionStore().home?.app?.default_theme?.style).toEqual(defaults.style)
  })

  it('Restore Default without default_theme writes the built-in theme with allowToChangeMode false (D5)', async () => {
    await setup({ reseller: true })
    withHome({})
    const store = useThemeStore()
    store.setDarkMode(true)
    store.changeColorsTheme({ colors: { base: '#ff0000' }, style: { darkMode: true, disableShadows: true, allowToChangeMode: true }, logo: 'L' })
    await click('style-manager-restore')

    expect(store.colors.primary.base).toBe('#07C07E')
    expect(store.style).toEqual({ disableShadows: false, darkMode: false, allowToChangeMode: false })
    expect(store.lightLogo).toBe(false)
    expect(document.body.classList.contains('is-light')).toBe(true)
    expect(putResellerBranding).toHaveBeenCalledWith(expect.objectContaining({ style: { disableShadows: false, darkMode: false, allowToChangeMode: false } }))
  })
})

// Characterization of the DOM: written on the code with raw `v-switch` elements, kept unchanged after they moved to `AppSwitch`.
describe('StyleManagerMenu switch DOM', () => {
  const dom = (id: string) => {
    const root = document.body.querySelector(`[data-testid="${CSS.escape(id)}"]`)!
    return {
      html: normalizeHtml(root.outerHTML).replace(/ id="switch-v-\d+"/g, ''),
      scoped: root.getAttributeNames().some(name => name.startsWith('data-v-')),
    }
  }

  it('keeps the DOM of the allow-mode switch', async () => {
    await setup({ reseller: true })
    const { html, scoped } = dom('style-manager-allow-mode')
    expect(html).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default v-input--switch mt-0 pt-0 mr-3 text-primary" data-testid="style-manager-allow-mode"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div>"`)
    expect(scoped).toBe(true)
  })

  it('keeps the DOM of the disable-shadows switch', async () => {
    await setup({ reseller: true })
    const { html, scoped } = dom('style-manager-disable-shadows')
    expect(html).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default my-0 py-0 mr-4" data-testid="style-manager-disable-shadows"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div>"`)
    expect(scoped).toBe(true)
  })

  it('keeps the DOM of the allow-mode switch when it is on', async () => {
    await setup({ reseller: true })
    useThemeStore().changeColorsTheme({ style: { ...useThemeStore().style, allowToChangeMode: true } })
    await flushPromises()
    expect(dom('style-manager-allow-mode').html).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default v-input--switch mt-0 pt-0 mr-3 text-primary" data-testid="style-manager-allow-mode"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true" checked=""><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div>"`)
  })
})
