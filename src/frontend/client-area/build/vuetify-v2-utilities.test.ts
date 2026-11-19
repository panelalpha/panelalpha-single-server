import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { vuetifyV2Utilities } from './vuetify-v2-utilities.ts'

const PREFIX = ':is(.v-application, .v-overlay-container)'

async function run (css: string): Promise<string> {
  const result = await postcss([vuetifyV2Utilities()]).process(css, { from: undefined })
  return result.css
}

describe('vuetifyV2Utilities', () => {
  it('unwraps the utilities layer, adds !important and the V2 prefix, keeps the rule order', async () => {
    const css = await run('@layer vuetify-utilities { .ma-0 { margin: 0 } .pt-8 { padding-top: 32px } }')
    expect(css).not.toContain('@layer')
    expect(css).toContain(`${PREFIX} .ma-0 { margin: 0 !important }`)
    expect(css).toContain(`${PREFIX} .pt-8 { padding-top: 32px !important }`)
    expect(css.indexOf('.ma-0')).toBeLessThan(css.indexOf('.pt-8'))
  })

  it('handles the dotted form of a sublayer', async () => {
    const css = await run('@layer vuetify-utilities.helpers { .d-none { display: none } }')
    expect(css).not.toContain('@layer')
    expect(css).toContain(`${PREFIX} .d-none { display: none !important }`)
  })

  it('handles a nested sublayer and drops the nested order statement', async () => {
    const css = await run(`@layer vuetify-utilities {
      @layer theme-base, typography, helpers;
      @layer helpers { .d-flex { display: flex } }
    }`)
    expect(css).not.toContain('@layer')
    expect(css).toContain(`${PREFIX} .d-flex { display: flex !important }`)
  })

  it('keeps @media and strengthens the rules inside it', async () => {
    const css = await run('@layer vuetify-utilities.helpers { @media (width <= 767.98px) { .hidden-xs { display: none } } }')
    expect(css).toContain('@media (width <= 767.98px)')
    expect(css).toContain(`${PREFIX} .hidden-xs { display: none !important }`)
  })

  it('prefixes every selector of a list', async () => {
    const css = await run('@layer vuetify-utilities { .a, .b > .c { color: red } }')
    expect(css).toContain(`${PREFIX} .a`)
    expect(css).toContain(`${PREFIX} .b > .c`)
  })

  it('does not prefix selectors that start with the locale context', async () => {
    const css = await run('@layer vuetify-utilities { .v-locale--is-ltr .ms-2 { margin-inline-start: 8px } }')
    expect(css).toContain('.v-locale--is-ltr .ms-2 { margin-inline-start: 8px !important }')
    expect(css).not.toContain(PREFIX)
  })

  it('leaves custom properties without !important', async () => {
    const css = await run('@layer vuetify-utilities { .x { --v-foo: 1; color: red } }')
    expect(css).toContain('--v-foo: 1;')
    expect(css).not.toContain('--v-foo: 1 !important')
    expect(css).toContain('color: red !important')
  })

  it('keeps font-weight and line-height of typography without !important', async () => {
    const css = await run(`@layer vuetify-utilities.typography {
      .text-h1 { font-size: 6rem; font-weight: 300; line-height: 1; letter-spacing: -1px }
    }`)
    expect(css).toContain('font-size: 6rem !important')
    expect(css).toContain('letter-spacing: -1px !important')
    expect(css).toContain('font-weight: 300;')
    expect(css).toContain('line-height: 1;')
  })

  it('keeps font-weight and line-height !important outside typography', async () => {
    const css = await run('@layer vuetify-utilities.helpers { .font-weight-bold { font-weight: 700 } }')
    expect(css).toContain('font-weight: 700 !important')
  })

  it('does not duplicate an existing !important', async () => {
    const css = await run('@layer vuetify-utilities { .x { color: red !important } }')
    expect(css.match(/!important/g)).toHaveLength(1)
  })

  it('leaves other layers untouched', async () => {
    const input = '@layer vuetify-core { .a { margin: 0 } } @layer vuetify-components { .b { margin: 0 } } @layer vuetify-overrides { .c { margin: 0 } } @layer vuetify-final { .d { margin: 0 } }'
    expect(await run(input)).toBe(input)
  })

  it('leaves layer order declarations untouched', async () => {
    const input = '@layer vuetify-core, vuetify-components, vuetify-utilities;'
    expect(await run(input)).toBe(input)
  })

  it('leaves unlayered rules untouched', async () => {
    const input = '.a { margin: 0 }'
    expect(await run(input)).toBe(input)
  })

  it('unwraps layers nested three levels deep', async () => {
    const css = await run('@layer vuetify-utilities { @layer a { @layer b { .x { color: red } } } .y { color: blue } }')
    expect(css).not.toContain('@layer')
    expect(css).toContain(`${PREFIX} .x { color: red !important }`)
    expect(css).toContain(`${PREFIX} .y { color: blue !important }`)
  })

  it('does not prefix a natively nested rule', async () => {
    const css = await run('@layer vuetify-utilities { .a { &:hover { color: red } } }')
    expect(css).toContain(`${PREFIX} .a`)
    expect(css).toContain('&:hover { color: red !important }')
    expect(css).not.toContain(`${PREFIX} &`)
  })

  it('leaves :root and html selectors unprefixed', async () => {
    const css = await run('@layer vuetify-utilities { :root { color: red } html.dark { color: blue } .a { color: green } }')
    expect(css).toContain(':root { color: red !important }')
    expect(css).toContain('html.dark { color: blue !important }')
    expect(css).toContain(`${PREFIX} .a`)
  })

  it('keeps @supports with the prefix and !important', async () => {
    const css = await run('@layer vuetify-utilities { @supports (display: grid) { .g { display: grid } } }')
    expect(css).toContain('@supports (display: grid)')
    expect(css).toContain(`${PREFIX} .g { display: grid !important }`)
  })

  it('leaves @keyframes untouched', async () => {
    const css = await run('@layer vuetify-utilities { @keyframes spin { from { opacity: 0 } to { opacity: 1 } } }')
    expect(css).toContain('@keyframes spin')
    expect(css).toContain('from { opacity: 0 }')
    expect(css).not.toContain(PREFIX)
    expect(css).not.toContain('!important')
  })

  it('processes the real Vuetify main.css: no utilities layer left, every utility rule strengthened', async () => {
    const source = readFileSync(resolve(process.cwd(), 'node_modules/vuetify/lib/styles/main.css'), 'utf8')
    const result = await postcss([vuetifyV2Utilities()]).process(source, { from: undefined })
    expect(result.css).not.toMatch(/@layer\s+vuetify-utilities/)

    const original = postcss.parse(source)
    const utilitySelectors = new Set<string>()
    original.walkAtRules('layer', layer => {
      if (/^vuetify-utilities(?:\.|$)/.test(layer.params.trim()) && layer.nodes) {
        layer.walkRules(rule => {
          if (rule.parent?.type === 'atrule' && (rule.parent as postcss.AtRule).name.endsWith('keyframes')) {
            return
          }
          for (const selector of rule.selectors) {
            utilitySelectors.add(selector.trim())
          }
        })
      }
    })
    expect(utilitySelectors.size).toBeGreaterThan(100)

    const processed = new Set<string>()
    postcss.parse(result.css).walkRules(rule => {
      for (const selector of rule.selectors) {
        processed.add(selector.trim())
      }
    })
    const missing = [...utilitySelectors].filter(selector => {
      const expected = selector.startsWith('.v-locale--is-') ? selector : `${PREFIX} ${selector}`
      return !processed.has(expected)
    })
    expect(missing).toEqual([])
  })
})
