// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type Declaration, type Rule } from 'postcss'
import { compile } from 'sass-embedded'
import { describe, expect, it } from 'vitest'
import { darkColors, lightColors, variations } from '@/app/plugins/theme-colors'

const CONTEXT = ':is(.v-application, .v-overlay-container)'
// V2 never had the M3 surface keys, and `on-*` are text colors for them.
const EXCLUDED_KEYS = new Set(['background', 'surface', 'surface-bright', 'surface-light', 'surface-variant'])

const css = compile(resolve(__dirname, 'theme-utilities.scss')).css
const rules: Rule[] = []
postcss.parse(css).walkRules(rule => {
  rules.push(rule)
})
const themesSource = readFileSync(resolve(__dirname, 'themes-variables.scss'), 'utf8')
const declaredVars = new Set([...themesSource.matchAll(/--v-([\w-]+)\s*:/g)].map(m => m[1]))

function expectedKeys (): string[] {
  const keys = new Set(
    [...Object.keys(lightColors), ...Object.keys(darkColors)]
      .filter(key => !key.startsWith('on-') && !EXCLUDED_KEYS.has(key)),
  )
  for (const color of variations.colors) {
    for (let i = 1; i <= variations.lighten; i++) {
      keys.add(`${color}-lighten-${i}`)
    }
    for (let i = 1; i <= variations.darken; i++) {
      keys.add(`${color}-darken-${i}`)
    }
  }
  return [...keys].toSorted()
}

function legacyVarName (key: string): string {
  const match = /^(.*?)-(lighten|darken)-(\d)$/.exec(key)
  return match ? `${match[1]}-${match[2]}${match[3]}` : `${key}-base`
}

function keysOf (kind: 'text' | 'bg'): string[] {
  return rules
    .map(rule => rule.selector)
    .filter(selector => selector.startsWith(`${CONTEXT} .${kind}-`))
    .map(selector => selector.slice(`${CONTEXT} .${kind}-`.length))
    .toSorted()
}

function valueOf (rule: Rule, prop: string): string | undefined {
  return rule.nodes.find((node): node is Declaration => node.type === 'decl' && node.prop === prop)?.value
}

describe('theme-utilities.scss', () => {
  it('has a text and a bg class for exactly the theme keys of theme-colors.ts', () => {
    expect(keysOf('text')).toEqual(expectedKeys())
    expect(keysOf('bg')).toEqual(expectedKeys())
  })

  it('makes every declaration !important and uses the V2 context selector', () => {
    for (const rule of rules) {
      expect(rule.selector.startsWith(`${CONTEXT} .`)).toBe(true)
      for (const node of rule.nodes) {
        expect((node as Declaration).important).toBe(true)
      }
    }
  })

  it('colors text and caret on text-*, and background and border on bg-*, but not the text color of bg-*', () => {
    const propsOf = (rule: Rule) => rule.nodes.map(node => (node as Declaration).prop)
    const textRules = rules.filter(rule => rule.selector.includes('.text-'))
    const bgRules = rules.filter(rule => rule.selector.includes('.bg-'))
    expect(textRules.length + bgRules.length).toBe(rules.length)
    expect(new Set(textRules.map(rule => propsOf(rule).join(',')))).toEqual(new Set(['color,caret-color']))
    expect(new Set(bgRules.map(rule => propsOf(rule).join(',')))).toEqual(new Set(['background-color,border-color']))
  })

  it('reads the legacy variable when themes-variables.scss defines it, else the V4 theme variable', () => {
    for (const key of expectedKeys()) {
      const rule = rules.find(r => r.selector === `${CONTEXT} .text-${key}`)
      const legacyVar = legacyVarName(key)
      const expected = declaredVars.has(legacyVar) ? `var(--v-${legacyVar})` : `rgb(var(--v-theme-${key}))`
      expect(valueOf(rule!, 'color')).toBe(expected)
    }
  })

  it('keeps the dark gray-darken-1 of legacy (#9494AD), not the V4 one', () => {
    const rule = rules.find(r => r.selector === `${CONTEXT} .text-gray-darken-1`)
    expect(valueOf(rule!, 'color')).toBe('var(--v-gray-darken1)')
    expect(themesSource).toMatch(/--v-gray-darken1:\s*#9494AD/i)
  })
})
