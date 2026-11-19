import defaultLogoDarkUrl from '@/shared/ui/assets/logo-white.svg'
import defaultLogoLightUrl from '@/shared/ui/assets/logo.svg'

export interface BrandLogoValues {
  logo?: string | false | null
  darkLogo?: string | false | null
}

const defaultBrandLogos = {
  light: defaultLogoLightUrl,
  dark: defaultLogoDarkUrl,
} as const

function customLogoValue (values: BrandLogoValues | undefined, dark: boolean): string | null {
  const raw = dark ? values?.darkLogo : values?.logo
  if (typeof raw !== 'string') {
    return null
  }

  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Resolve brand logo `img` src: custom theme logo/darkLogo, else default PanelAlpha SVG.
 * Raw SVG markup becomes a data URL (prefer img over v-html).
 */
export function resolveBrandLogoSrc (
  values: BrandLogoValues | undefined,
  dark: boolean,
  defaults: { light: string, dark: string } = defaultBrandLogos,
): string {
  const custom = customLogoValue(values, dark)
  if (!custom) {
    return dark ? defaults.dark : defaults.light
  }

  if (custom.startsWith('data:image/') || custom.startsWith('http://') || custom.startsWith('https://') || custom.startsWith('/')) {
    return custom
  }

  // Legacy sometimes stored raw SVG markup (was v-html); encode safely for <img>.
  if (custom.startsWith('<')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(custom)}`
  }

  return custom
}
