import { createVuetify, type VuetifyOptions } from 'vuetify'
import { aliases } from '@/shared/ui/icons/aliases'
import { displayOptions } from './display-options'
import { darkColors, lightColors, variations } from './theme-colors'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

/** Shared with the kit test helper (`test/mount-kit.ts`) so tests mount the production config. */
export const vuetifyOptions: VuetifyOptions = {
  icons: { aliases },
  display: displayOptions,
  defaults: {
    // Legacy skeletons use `type="header"` (no such type in V4); registering it keeps the `v-skeleton-loader__header` bone without the warning.
    VSkeletonLoader: { types: { header: 'header' } },
  },
  theme: {
    defaultTheme: 'light', // home branding darkMode applied at runtime — not OS system
    variations,
    themes: {
      light: {
        dark: false,
        colors: lightColors,
      },
      dark: {
        dark: true,
        colors: darkColors,
      },
    },
  },
}

export default createVuetify(vuetifyOptions)
