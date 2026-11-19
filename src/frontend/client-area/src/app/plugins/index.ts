import type { App } from 'vue'
import I18NextVue from 'i18next-vue'
import { createPinia } from 'pinia'
import { i18next } from '@/app/i18n'
import { router } from '@/app/router'
import { installErrorHandlers } from './error-handlers'
import vuetify from './vuetify'

export function registerPlugins (app: App) {
  // First, so that nothing after it can fail unseen. The listeners live as long as the page.
  installErrorHandlers(app, { getRouteName: () => router.currentRoute.value.name })
  app.use(vuetify)
  app.use(createPinia())
  app.use(router)
  app.use(I18NextVue, { i18next })
}
