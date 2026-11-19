import type { Component } from 'vue'
import { mount, type MountingOptions, type VueWrapper } from '@vue/test-utils'
import i18next from 'i18next'
import I18NextVue from 'i18next-vue'
import { afterEach } from 'vitest'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { vuetifyOptions } from '@/app/plugins/vuetify'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

let i18nReady: Promise<typeof i18next> | null = null

const liveWrappers = new Set<VueWrapper>()

// Unmount what a test left mounted (an assertion threw before its own `unmount()`), so teleported
// overlays never leak into the next test. Explicitly unmounted wrappers are skipped: a second
// `app.unmount()` would only warn.
afterEach(() => {
  for (const wrapper of liveWrappers) {
    wrapper.unmount()
  }
  liveWrappers.clear()
})

function ensureI18n (): Promise<typeof i18next> {
  if (!i18nReady) {
    i18nReady = i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: {} } },
      // Missing keys resolve to the key itself (t(key) === key), or to the default value when `t` got one.
      parseMissingKeyHandler: (key: string, defaultValue?: string) => defaultValue ?? key,
      interpolation: { escapeValue: false },
    }).then(() => i18next)
  }
  return i18nReady
}

function createKitVuetify () {
  return createVuetify({
    ...vuetifyOptions,
    components,
    directives,
  })
}

export type MountKitOptions = MountingOptions<Record<string, unknown>> & {
  attachTo?: Element | string
}

/**
 * Mount a kit component with the app Vuetify (icon aliases + theme) and
 * i18next where t(key) === key. Supports attachTo for overlay teleport tests.
 */
export async function mountKit (
  component: Component,
  options: MountKitOptions = {},
): Promise<VueWrapper> {
  await ensureI18n()
  const vuetify = createKitVuetify()
  const { global: globalOptions, attachTo, ...rest } = options

  const wrapper = mount(component, {
    ...rest,
    attachTo,
    global: {
      ...globalOptions,
      plugins: [
        vuetify,
        [I18NextVue, { i18next }],
        ...(globalOptions?.plugins ?? []),
      ],
    },
  })
  const unmount = wrapper.unmount.bind(wrapper)
  wrapper.unmount = () => {
    liveWrappers.delete(wrapper)
    unmount()
  }
  liveWrappers.add(wrapper)
  return wrapper
}
