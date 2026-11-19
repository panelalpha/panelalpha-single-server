import type { BrandColors } from '@/shared/theme/brand-theme'
import { DEFAULT_BRAND_COLORS } from '@/shared/theme/brand-theme'

/** Id of the `<style>` element with the `--v-primary-*` overrides. */
export const PRIMARY_VARS_STYLE_ID = 'brand-primary-vars'

/** The format that goes to `<style>` and to the theme: `#rgb`, `#rrggbb` or `#rrggbbaa`. Everything else (e.g. `red; } body {`) is dropped. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isHexColor (value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/**
 * The brand base for the V4 `primary` key (both themes). Vuetify generates the `primary-lighten-N` / `primary-darken-N` variants
 * from the base and overrides explicit keys with them, so the brand shades are not passed this way (they go to `--v-primary-*`).
 * An invalid base (e.g. a hand-edited `localStorage.theme`) gives the default brand base, not junk in the theme.
 */
export function toVuetifyPrimary (colors: Pick<BrandColors, 'base'>): { primary: string } {
  return { primary: isHexColor(colors.base) ? colors.base : DEFAULT_BRAND_COLORS.base }
}

/** A `--name: value;` declaration, or `null` when the value is not a valid hex (the variable falls back to `themes-variables.scss`). */
function declaration (name: string, value: unknown): string | null {
  return isHexColor(value) ? `  ${name}: ${value};` : null
}

/** A theme block with the valid declarations; an empty block stays, so the theme selector does not vanish from the text. */
function themeBlock (selector: string, declarations: Array<string | null>): string {
  return [selector + ' {', ...declarations.filter((line): line is string => line !== null), '}'].join('\n')
}

/**
 * The `<style>` text with `--v-primary-*` (as in legacy, here in both themes). In dark only `base`, `lighten1`
 * and `darken1` (the legacy dark palette), so `--v-primary-lighten2/4/5` stay from `themes-variables.scss`.
 * A value that is not a hex does not reach the CSS: only that declaration is skipped.
 */
export function primaryVarsCss (colors: BrandColors): string {
  return [
    themeBlock('.v-theme--light', [
      declaration('--v-primary-base', colors.base),
      declaration('--v-primary-lighten1', colors.lighten1),
      declaration('--v-primary-lighten2', colors.lighten2),
      declaration('--v-primary-lighten4', colors.lighten4),
      declaration('--v-primary-darken1', colors.darken1),
    ]),
    themeBlock('.v-theme--dark', [
      declaration('--v-primary-base', colors.base),
      declaration('--v-primary-lighten1', colors.lighten1),
      declaration('--v-primary-darken1', colors.darken1),
    ]),
  ].join('\n')
}

/** One `<style id="brand-primary-vars">` element at the end of `<head>` (a later order wins over SCSS at the same specificity). */
export function writePrimaryVars (doc: Document, colors: BrandColors): void {
  let style = doc.querySelector(`#${PRIMARY_VARS_STYLE_ID}`)
  if (!style) {
    style = doc.createElement('style')
    style.id = PRIMARY_VARS_STYLE_ID
    doc.head.append(style)
  }
  style.textContent = primaryVarsCss(colors)
}
