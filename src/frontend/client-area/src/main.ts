import { createApp, nextTick } from 'vue'
import { i18nReady } from '@/app/i18n'
import { registerPlugins } from '@/app/plugins'
import { router } from '@/app/router'
import { prefetchBootHome } from '@/app/router/boot-prefetch'
import App from './app/App.vue'
import '@/app/styles/reset.scss'
import '@/app/styles/themes-variables.scss'
import '@/app/styles/legacy/index.scss'
import '@/app/styles/theme-utilities.scss'
import 'unfonts.css'

// `GET /home` for the first URL starts with the translations, not after them.
prefetchBootHome(router, `${window.location.pathname}${window.location.search}${window.location.hash}`)

await i18nReady

const app = createApp(App)

registerPlugins(app)

app.mount('#app')

// The boot indicator of `index.html` leaves once the first route has rendered, also when that navigation failed.
function removeBootIndicator () {
  void nextTick(() => document.querySelector('#boot-indicator')?.remove())
}
router.isReady().then(removeBootIndicator, removeBootIndicator)
