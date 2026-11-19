import { describe, expect, it } from 'vitest'
import { createVuetify } from 'vuetify'
import { darkColors, lightColors, variations } from './theme-colors'

// Legacy V2 generated lighten/darken shades for every base colour; StatusLabel uses
// `bg-<status>-lighten-4 text-<status>-darken-1` for success/error/warning chips.
describe('theme variations', () => {
  it.each(['success', 'error', 'warning'])('generates %s lighten-4 and darken-1', name => {
    for (const [dark, colors] of [[false, lightColors], [true, darkColors]] as const) {
      const vuetify = createVuetify({
        theme: {
          defaultTheme: 't',
          variations,
          themes: { t: { dark, colors } },
        },
      })
      const generated = vuetify.theme.computedThemes.value.t.colors
      expect(generated[`${name}-lighten-4`]).toBeTruthy()
      expect(generated[`${name}-darken-1`]).toBeTruthy()
    }
  })
})
