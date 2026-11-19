// Contract test: a mobile table card is `MobileTableCard` + `MobileTableField`, not hand-written markup.
// Legacy copied `div.mobile-table-item` and `div.mobile-table-item__row` into every table; the kit pattern owns that markup now, and
// the global `_mobileTableItems.scss` and the parity probes count on it. A new table that writes the card by hand would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const OWNERS = new Set([
  join(SRC, 'shared', 'ui', 'data-table', 'MobileTableField.vue'),
  join(SRC, 'shared', 'ui', 'data-table', 'MobileTableCard.vue'),
])
const FORBIDDEN_CLASSES = new Set(['mobile-table-item', 'mobile-table-item__row'])

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

// The top-level `<template>` block only (column 0), with HTML comments removed. `<style>` and `<script>` are not scanned.
function templateOf (text: string): string {
  const block = /^<template>[\s\S]+?^<\/template>/m.exec(text)
  return (block?.[0] ?? '').replace(/<!--[\s\S]*?-->/g, '')
}

// Every class name that a `class` or `:class` attribute spells out as a literal (`class="a b"`, `:class="['a', { b: x }]"`, `:class="x ? 'a' : 'b'"`).
function literalClasses (template: string): string[] {
  const names: string[] = []
  for (const attribute of template.matchAll(/(?<![\w-])(:?)class\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const value = attribute[2] ?? attribute[3] ?? ''
    names.push(...value.split(/[\s'"`,[\]{}:?|&()]+/).filter(Boolean))
  }
  return names
}

function offenders (files: string[]): string[] {
  return files
    .filter(file => literalClasses(templateOf(readFileSync(file, 'utf8'))).some(name => FORBIDDEN_CLASSES.has(name)))
    .map(file => relative(ROOT, file))
}

const files = walk(SRC).filter(file => !OWNERS.has(file))

describe('mobile table card contract', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(500)
    const uses = files.filter(file => /<MobileTable(?:Field|Card)\b/.test(readFileSync(file, 'utf8')))
    expect(uses.length).toBeGreaterThanOrEqual(20)
  })

  it('knows the spellings of hand-written card markup it must catch', () => {
    for (const sample of [
      '<div class="mobile-table-item__row">',
      '<div class="mobile-table-item">',
      '<div class="mobile-table-item foo">',
      '<div :class="[\'mobile-table-item__row\', { a: b }]">',
      '<div :class="x ? \'mobile-table-item\' : \'y\'">',
    ]) {
      const names = literalClasses(`<template>${sample}</div></template>`)
      expect({ sample, caught: names.some(name => FORBIDDEN_CLASSES.has(name)) }).toEqual({ sample, caught: true })
    }
    for (const sample of [
      '<div class="mobile-table-item__actions">',
      '<div class="mobile-table-item--wide">',
      '<div class="my-mobile-table-item">',
    ]) {
      const names = literalClasses(`<template>${sample}</div></template>`)
      expect({ sample, caught: names.some(name => FORBIDDEN_CLASSES.has(name)) }).toEqual({ sample, caught: false })
    }
  })

  it('has no hand-written card or field in a template outside the pattern', () => {
    expect(offenders(files)).toEqual([])
  })

  it('does not look at comments, styles and the pattern files themselves', () => {
    expect(templateOf('<template>\n  <!-- <div class="mobile-table-item__row"> -->\n  <p />\n</template>\n<style>.mobile-table-item__row {}</style>')).not.toContain('mobile-table-item')
    expect([...OWNERS].every(file => file.split(sep).includes('data-table'))).toBe(true)
  })
})
