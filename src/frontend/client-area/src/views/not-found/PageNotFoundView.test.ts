import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/app/router'
import { useThemeStore } from '@/shared/theme/theme.store'
import { mountKit } from '@/test/mount-kit'
import PageNotFoundView from './PageNotFoundView.vue'

describe('PageNotFoundView', () => {
  it('renders legacy copy keys, the illustration and a link to home', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/nope')
    await router.isReady()

    const wrapper = await mountKit(PageNotFoundView, {
      global: { plugins: [createPinia(), router] },
    })

    // Test i18n resolves a missing key to the key itself.
    expect(wrapper.get('[data-testid="not-found-title"]').text()).toBe('heading.notFoundPage.title')
    expect(wrapper.get('[data-testid="not-found-info"]').text()).toBe('heading.notFoundPage.info')
    expect(wrapper.get('[data-testid="not-found-illustration"] svg').exists()).toBe(true)
    expect(wrapper.get('[data-testid="not-found-logo-image"]').classes()).toContain('brand-logo')

    const home = wrapper.get('[data-testid="not-found-home"]')
    expect(home.element.tagName).toBe('A')
    expect(home.attributes('href')).toBe('/')
    expect(home.text()).toBe('button.home.back')
    wrapper.unmount()
  })

  it('shows the theme light logo in light mode and the dark logo after switching to dark', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const themeStore = useThemeStore()
    themeStore.changeColorsTheme({
      logo: 'data:image/png;base64,LIGHTLOGO',
      darkLogo: 'data:image/png;base64,DARKLOGO',
    })
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/nope')
    await router.isReady()

    const wrapper = await mountKit(PageNotFoundView, {
      global: { plugins: [pinia, router] },
    })
    const logo = wrapper.get('[data-testid="not-found-logo-image"]')
    expect(logo.attributes('src')).toBe('data:image/png;base64,LIGHTLOGO')

    wrapper.vm.$vuetify.theme.global.name = 'dark'
    await nextTick()
    expect(wrapper.get('[data-testid="not-found-logo-image"]').attributes('src')).toBe('data:image/png;base64,DARKLOGO')
    wrapper.unmount()
  })

  it('links home from any unknown address and navigates to / without query parameters', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/instances-x/1')
    await router.isReady()

    const wrapper = await mountKit(PageNotFoundView, {
      global: { plugins: [pinia, router] },
    })
    const home = wrapper.get('[data-testid="not-found-home"]')
    expect(home.attributes('href')).toBe('/')

    await home.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query).toEqual({})
    wrapper.unmount()
  })
})
