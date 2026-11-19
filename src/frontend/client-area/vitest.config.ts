import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { defineConfig } from 'vitest/config'
import { isMediaCustomElement } from './build/vue-custom-elements.ts'

export default defineConfig({
  plugins: [
    vue({
      template: { compilerOptions: { isCustomElement: isMediaCustomElement } },
    }),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    testTimeout: 15_000,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'parity/**/*.test.ts', 'build/**/*.test.ts', 'scripts/**/*.test.ts'],
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
  ssr: {
    noExternal: ['vuetify'],
  },
})
