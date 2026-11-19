// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { compile, compileString } from 'sass-embedded'
import { describe, expect, it } from 'vitest'
import { V2_SELECTORS } from '@/app/styles/v2-selectors'

const legacyDir = __dirname
const indexPath = resolve(legacyDir, 'index.scss')
const themesVariablesPath = resolve(legacyDir, '../themes-variables.scss')
const settingsPath = resolve(legacyDir, '../settings.scss')
const tokensVariablesPath = resolve(legacyDir, 'tokens/_variables.scss')

/** Unique legacy partials (26) in the order of the legacy generic index (`_skeleton` listed once). */
const LEGACY_PARTIALS = [
  'general', 'fonts', 'inputs', 'buttons', 'card', 'dropdowns', 'pagination', 'tabs', 'icons',
  'tables', 'labels', 'list', 'snackbar', 'noData', 'switch', 'skeleton', 'data-iterator',
  'dialog', 'alert', 'pageTitle', 'mobileTableItems', 'transitions', 'dividers', 'chart',
  'collapse', 'rtl',
] as const

/** Palette keys of the legacy theme settings (light + dark). V2 emitted a bare `.<key>` class for each. */
const PALETTE_KEYS = [
  'body', 'panel', 'link', 'checkbox', 'field', 'icon', 'white', 'nav', 'tooltip', 'darkicon',
  'primary', 'secondary', 'accent', 'gray', 'massaction', 'info', 'success', 'text', 'sand',
  'error', 'warning',
]

const EXPECTED_BREAKPOINTS = { xs: '0', sm: '768px', md: '976px', lg: '1200px', xl: '1400px' }

function compileLayer (): string {
  return compile(indexPath).css
}

/** Selector preludes of every rule in compiled CSS (at-rule preludes are skipped). */
function selectorsOf (css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []
  for (const match of stripped.matchAll(/([^{};]+)\{/g)) {
    const prelude = match[1].trim()
    if (prelude && !prelude.startsWith('@')) {
      selectors.push(prelude)
    }
  }
  return selectors
}

function v2SelectorViolations (css: string): string[] {
  const selectors = selectorsOf(css).join('\n')
  return V2_SELECTORS.filter(fragment => selectors.includes(fragment))
}

function bareThemeAndTransitionViolations (css: string): string[] {
  const selectors = selectorsOf(css).join('\n')
  const rules: Array<[string, RegExp]> = [
    ['bare theme--dark/light', /(?<![\w-])theme--(?:dark|light)(?![\w-])/g],
    ['.is-dark/.is-light', /\.is-(?:dark|light)(?![\w-])/g],
    // `-enter` / `-leave` only when the class ends there (not -enter-from/-to/-active)
    ['bare transition -enter/-leave', /\.[\w-]*-(?:enter|leave)(?![\w-])/g],
  ]
  return rules.flatMap(([label, re]) => (selectors.match(re) ?? []).map(hit => `${label}: ${hit}`))
}

function bareColorClassViolations (css: string): string[] {
  const selectors = selectorsOf(css).join('\n')
  const palette = new RegExp(String.raw`\.(?:${PALETTE_KEYS.join('|')})(?![\w-])`, 'g')
  const shade = /\.(?:lighten|darken)-\d+(?![\w-])/g
  return [...(selectors.match(palette) ?? []), ...(selectors.match(shade) ?? [])]
}

function scssFiles (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      return scssFiles(full)
    }
    return entry.name.endsWith('.scss') ? [full] : []
  })
}

function stripScssComments (source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function usedPartials (indexSource: string): string[] {
  return [...stripScssComments(indexSource).matchAll(/@use\s+['"]\.\/_?([\w-]+)['"]/g)].map(m => m[1])
}

function undeclaredPaletteVars (css: string, themesSource: string): string[] {
  const used = new Set(
    [...css.matchAll(/var\(\s*--v-([\w-]+)/g)]
      .map(m => m[1])
      .filter(name => /-(?:base|lighten\d+|darken\d+)$/.test(name)),
  )
  const declared = new Set([...themesSource.matchAll(/--v-([\w-]+)\s*:/g)].map(m => m[1]))
  return [...used].filter(name => !declared.has(name)).toSorted()
}

function gridBreakpoints (source: string): Record<string, string> {
  const block = /\$grid-breakpoints\s*:\s*\(([\s\S]*?)\)/.exec(stripScssComments(source))
  if (!block) {
    return {}
  }
  const entries = [...block[1].matchAll(/['"]?(\w+)['"]?\s*:\s*([\w.]+)/g)].map(m => [m[1], m[2]])
  return Object.fromEntries(entries)
}

describe('legacy layer', () => {
  const css = compileLayer()

  it('compiles with sass-embedded', () => {
    expect(typeof css).toBe('string')
  })

  it('has no Vuetify 2 selectors', () => {
    expect(v2SelectorViolations(css)).toEqual([])
  })

  it('has no bare theme or transition classes', () => {
    expect(bareThemeAndTransitionViolations(css)).toEqual([])
  })

  it('has no bare V2 color classes', () => {
    expect(bareColorClassViolations(css)).toEqual([])
  })

  it('uses no @import in legacy sources', () => {
    const offenders = scssFiles(legacyDir).filter(file => /@import\b/.test(stripScssComments(readFileSync(file, 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('uses no @layer in legacy sources', () => {
    const offenders = scssFiles(legacyDir).filter(file => /@layer\b/.test(stripScssComments(readFileSync(file, 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('keeps the V2 specificity of .elevation-0/2/4 against V4 !important utilities (F-11)', () => {
    const selectors = selectorsOf(css)
    const prefix = 'body :is(.v-application, .v-overlay-container) '
    for (const name of ['elevation-0', 'elevation-2', 'elevation-4']) {
      expect(selectors).toContain(`${prefix}.${name}`)
    }
    for (const name of ['elevation-2', 'elevation-4']) {
      expect(selectors).toContain(`${prefix}.${name}--before::before`)
      expect(selectors).toContain(`${prefix}.${name}--after::after`)
    }
    expect(selectors).not.toContain('.elevation-2')
    expect(selectors).toContain('.elevation-8')
  })

  it('keeps the V2 specificity of the skeleton reset against the F-11 theme sheet', () => {
    const selectors = selectorsOf(css)
    expect(selectors).toContain(':is(.v-application, .v-overlay-container) .v-skeleton-loader.bg-text')
    expect(selectors).not.toContain('.v-skeleton-loader.bg-text')
  })

  it('keeps the V2 specificity of the ul reset against the F-11 element rule', () => {
    const selectors = selectorsOf(css)
    expect(selectors).toContain('body :is(.v-application, .v-overlay-container) ul')
    expect(selectors).not.toContain('ul')
  })

  it('@uses exactly the 26 unique legacy partials, in legacy order', () => {
    const used = usedPartials(readFileSync(indexPath, 'utf8'))
    expect(LEGACY_PARTIALS).toHaveLength(26)
    expect(used).toEqual([...LEGACY_PARTIALS])
  })

  it('has a file for every legacy partial', () => {
    const missing = LEGACY_PARTIALS.filter(name => !existsSync(join(legacyDir, `_${name}.scss`)))
    expect(missing).toEqual([])
  })

  it('declares every palette variable it reads in themes-variables.scss', () => {
    expect(undeclaredPaletteVars(css, readFileSync(themesVariablesPath, 'utf8'))).toEqual([])
  })

  it('keeps the legacy grid breakpoints in tokens and settings.scss', () => {
    const tokens = gridBreakpoints(readFileSync(tokensVariablesPath, 'utf8'))
    const settings = gridBreakpoints(readFileSync(settingsPath, 'utf8'))
    expect(tokens).toEqual(EXPECTED_BREAKPOINTS)
    expect(settings).toEqual(tokens)
  })
})

describe('legacy layer guard detectors', () => {
  it.each(V2_SELECTORS)('flags %s', fragment => {
    const compiled = compileString(`.a ${fragment.endsWith('--') || fragment.endsWith('__') ? fragment + 'x' : fragment} { color: red; }`).css
    expect(v2SelectorViolations(compiled)).toContain(fragment)
  })

  it('does not flag Vuetify 4 selectors', () => {
    const v4 = '.v-field--focused .v-field__outline, .v-btn--variant-outlined, .v-card-title, .v-tab--selected, .v-theme--dark .a { color: red; }'
    expect(v2SelectorViolations(v4)).toEqual([])
    expect(bareThemeAndTransitionViolations(v4)).toEqual([])
    expect(bareColorClassViolations(v4)).toEqual([])
  })

  it('flags bare theme, is-dark and transition classes only', () => {
    expect(bareThemeAndTransitionViolations('.theme--dark .a { }').length).toBe(1)
    expect(bareThemeAndTransitionViolations('.is-light .a { }').length).toBe(1)
    expect(bareThemeAndTransitionViolations('.fade-enter { }').length).toBe(1)
    expect(bareThemeAndTransitionViolations('.fade-leave { }').length).toBe(1)
    expect(bareThemeAndTransitionViolations('.v-theme--dark .a, .fade-enter-from, .fade-enter-active, .fade-leave-to { }')).toEqual([])
  })

  it('flags bare color and shade classes only', () => {
    expect(bareColorClassViolations('.primary { }')).toEqual(['.primary'])
    expect(bareColorClassViolations('.v-btn.error:not(.x) { }')).toEqual(['.error'])
    expect(bareColorClassViolations('.primary.lighten-2 { }')).toEqual(['.primary', '.lighten-2'])
    expect(bareColorClassViolations('.error-title, .bg-error, .text-primary, .border-info, .bg-primary-lighten-1 { }')).toEqual([])
    expect(bareColorClassViolations('.a { margin: 0.5em; background: url(x.png) }')).toEqual([])
  })

  it('reports palette variables missing from themes-variables.scss', () => {
    const themes = '.v-theme--light { --v-error-base: #f00; }'
    expect(undeclaredPaletteVars('.a { color: var(--v-error-base); }', themes)).toEqual([])
    expect(undeclaredPaletteVars('.a { color: var(--v-gray-lighten3); border-color: var(--v-x-darken2) }', themes)).toEqual(['gray-lighten3', 'x-darken2'])
    expect(undeclaredPaletteVars('.a { color: var(--v-link-base); margin: var(--v-other) }', themes)).toEqual(['link-base'])
  })

  it('parses breakpoints and detects a mismatch', () => {
    expect(gridBreakpoints('$grid-breakpoints: (\n  xs: 0,\n  sm: 768px,\n);')).toEqual({ xs: '0', sm: '768px' })
    expect(gridBreakpoints('with ($grid-breakpoints: (\'xs\': 0, \'sm\': 700px))')).not.toEqual({ xs: '0', sm: '768px' })
  })
})
