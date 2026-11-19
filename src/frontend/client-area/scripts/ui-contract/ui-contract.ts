// Shared logic of the UI contract scan (change `ui-guard`, F-14). Plain node: `node:*` imports, `./x.ts` specifiers, erasable TypeScript only,
// because `scripts/ui-contract/ui-scan.ts` runs it with Node type-stripping and the contract test imports the same code.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Category = 'hex' | 'fn' | 'inline-style' | 'mdi' | 'important'

export interface Hit {
  line: number
  category: Category
  /** `inline-literal` when an inline style holds `#`, `rgb` or `px` (view-review.md grep). */
  literal?: boolean
  text: string
}

export interface ScanOptions {
  /** Repo-root-relative path; decides the `important` (legacy layer) exemption. */
  file?: string
}

export interface GateOptions {
  /** Inline `style=` also fails (session, setup, auth frame, free). */
  strict?: boolean
}

/** CSS variables Vuetify itself sets (theme colours, layout offsets, border and emphasis opacities), not the token layer. */
export const VUETIFY_VARS = /^--v-(?:theme-|layout-|border-(?:color|opacity)$|high-emphasis-opacity$)/

// A colour hex has 3, 4, 6 or 8 digits; the `(?![\w-])` keeps a word such as `#added` out.
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i
// Colour functions; `rgb(var(--…))` is a token reference, not a literal.
const FN = /\b(?:rgba?|hsla?)\((?!\s*var\()|\boklch\(/i
const INLINE_STYLE = /(?:^|\s)(?:v-bind)?:?style=["']/
const INLINE_LITERAL = /#|rgb|px/i
const MDI = /\bmdi-[a-z]/
const IMPORTANT = /!important/

const LEGACY_STYLES_DIR = 'src/app/styles/legacy/'

/**
 * Blanks what cannot hold a colour and would read like one: comments (`//` but not `://` of a URL or `//` right after `url(`),
 * `<template>` opening tags (slot shorthands such as `#face`) and `href="#…"` anchors. Line numbers are kept.
 */
export function stripNonValues (source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ')
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:(])\/\/.*$/gm, (match, before: string) => before + blank(match.slice(before.length)))
    .replace(/<template\b[^>]*>/g, blank)
    .replace(/href="#[^"]*"/g, blank)
}

/** Every hit of every category outside comments, one per category per line. */
export function scanText (text: string, options: ScanOptions = {}): Hit[] {
  const file = (options.file ?? '').replace(/\\/g, '/')
  const skipImportant = file.startsWith(LEGACY_STYLES_DIR)
  const hits: Hit[] = []
  for (const [index, raw] of stripNonValues(text).split('\n').entries()) {
    const line = index + 1
    const shown = raw.trim()
    if (HEX.test(raw)) {
      hits.push({ line, category: 'hex', text: shown })
    }
    if (FN.test(raw)) {
      hits.push({ line, category: 'fn', text: shown })
    }
    if (INLINE_STYLE.test(raw)) {
      hits.push({ line, category: 'inline-style', literal: INLINE_LITERAL.test(raw), text: shown })
    }
    if (MDI.test(raw)) {
      hits.push({ line, category: 'mdi', text: shown })
    }
    if (!skipImportant && IMPORTANT.test(raw)) {
      hits.push({ line, category: 'important', text: shown })
    }
  }
  return hits
}

/** The hits that fail the contract: hex and fn always, inline-style only when strict; mdi and important are counters only. */
export function gate (hits: Hit[], options: GateOptions = {}): Hit[] {
  return hits.filter(hit => hit.category === 'hex' || hit.category === 'fn' || (options.strict === true && hit.category === 'inline-style'))
}

/** `--v-*` names read with `var()` outside comments. */
export function usedVars (text: string): string[] {
  return [...stripNonValues(text).matchAll(/var\((--v-[\w-]+)/g)].map(match => match[1]!)
}

export function scssFiles (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return scssFiles(path)
    }
    return entry.name.endsWith('.scss') ? [path] : []
  })
}

/** Every `--v-*` custom property the stylesheets under `stylesDir` declare. */
export function declaredVars (stylesDir: string): Set<string> {
  return new Set(scssFiles(stylesDir).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/(--v-[\w-]+)\s*:/g)].map(match => match[1]!)))
}

/** `var(--v-…)` names that neither Vuetify nor the declared token layer provides (a typo silently falls back to the inherited value). */
export function undeclaredVars (text: string, declared: Set<string>): string[] {
  return usedVars(text).filter(name => !VUETIFY_VARS.test(name) && !declared.has(name))
}

/** Whether a hit line is kept 1:1 with legacy: the trimmed line equals an `allow` entry. */
export function isAllowed (lineText: string, allow: readonly string[] = []): boolean {
  return allow.includes(lineText.trim())
}

const CATEGORIES: readonly Category[] = ['hex', 'fn', 'inline-style', 'mdi', 'important']

/** `file:line: category: trimmed text`. */
export function formatHit (file: string, hit: Hit): string {
  return `${file}:${hit.line}: ${hit.category}: ${hit.text}`
}

/** `file: N (hex=a fn=b inline-style=c mdi=d important=e)`. */
export function formatFileSummary (file: string, hits: Hit[]): string {
  const counts = CATEGORIES.map(category => `${category}=${hits.filter(hit => hit.category === category).length}`)
  return `${file}: ${hits.length} (${counts.join(' ')})`
}

export function formatTotal (total: number): string {
  return `SUMA: ${total}`
}

/** `.vue`, `.scss` and `.ts` files under a directory, recursively, without `*.test.ts`. */
export function sourceFiles (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    return /\.(?:vue|scss|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : []
  }).toSorted()
}
