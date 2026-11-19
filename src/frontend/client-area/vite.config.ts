import fs from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import fonts from 'unplugin-fonts/vite'
import { defineConfig, type ServerOptions } from 'vite'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { isMediaCustomElement } from './build/vue-custom-elements.ts'
import { vuetifyV2Utilities } from './build/vuetify-v2-utilities.ts'

/**
 * `API_PROXY` (e.g. `https://panel.example.com`): the dev server forwards `/api` and the Echo `/ws` to that panel,
 * so the browser stays same-origin. Needed for a panel whose CORS does not allow credentials and whose session
 * cookies have no shared `domain`. Origin and Referer are rewritten to the panel, so Sanctum treats requests as stateful.
 */
function apiProxy (target: string | undefined): ServerOptions['proxy'] {
  if (!target) {
    return undefined
  }
  const origin = new URL(target).origin
  const rewriteOrigin = (proxyReq: { getHeader: (name: string) => unknown, setHeader: (name: string, value: string) => void }) => {
    if (proxyReq.getHeader('origin')) {
      proxyReq.setHeader('origin', origin)
    }
    if (proxyReq.getHeader('referer')) {
      proxyReq.setHeader('referer', `${origin}/`)
    }
  }

  return {
    '/api': {
      target: origin,
      changeOrigin: true,
      secure: false,
      cookieDomainRewrite: '',
      configure: proxy => proxy.on('proxyReq', rewriteOrigin),
    },
    '/ws': {
      target: origin,
      changeOrigin: true,
      secure: false,
      ws: true,
      configure: proxy => proxy.on('proxyReqWs', rewriteOrigin),
    },
  }
}

function devServer (): ServerOptions {
  const port = Number(process.env.DEV_PORT) || 5174
  const httpsKey = process.env.DEV_HTTPS_KEY
  const httpsCert = process.env.DEV_HTTPS_CERT
  const https
    = httpsKey && httpsCert
      ? {
          key: fs.readFileSync(httpsKey),
          cert: fs.readFileSync(httpsCert),
        }
      : undefined
  const devHost = process.env.DEV_HOST

  return {
    host: true,
    port,
    strictPort: true,
    https,
    proxy: apiProxy(process.env.API_PROXY),
    hmr: devHost
      ? {
          host: devHost,
          protocol: https ? 'wss' : 'ws',
          clientPort: port,
        }
      : undefined,
  }
}

export default defineConfig({
  plugins: [
    vue({
      template: {
        transformAssetUrls,
        compilerOptions: { isCustomElement: isMediaCustomElement },
      },
    }),
    vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/app/styles/settings.scss',
      },
    }),
    fonts({
      fontsource: {
        families: [
          {
            name: 'Nunito Sans',
            weights: [200, 300, 400, 600, 700, 800],
            styles: ['normal', 'italic'],
          },
        ],
      },
    }),
  ],
  css: {
    postcss: { plugins: [vuetifyV2Utilities()] },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  server: devServer(),
})
