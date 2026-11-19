// Contract test: a switch is `AppSwitch` (or the presets `ButtonSwitch` and `DarkModeSwitch`), not a bare `v-switch`.
// Ten templates repeated `color`, `flat`, `inset` and `hide-details` by hand; the kit pattern owns those defaults now (`app-switch.ts`).
// A new switch written as `<v-switch>` would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const OWNERS = new Set([join(SRC, 'shared', 'ui', 'buttons', 'AppSwitch.vue')])
const RAW_SWITCH = /<v-switch\b|<VSwitch\b/

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

// `file:line` of every raw `v-switch` tag in the template of a component.
function rawSwitchLines (text: string): number[] {
  return templateOf(text).split('\n').flatMap((line, index) => (RAW_SWITCH.test(line) ? [index + 1] : []))
}

function offenders (files: string[]): string[] {
  return files.flatMap(file => {
    const lines = rawSwitchLines(readFileSync(file, 'utf8'))
    return lines.length > 0 ? [`${relative(ROOT, file)} (use AppSwitch or ButtonSwitch): template line ${lines.join(', ')}`] : []
  })
}

const files = walk(SRC).filter(file => !OWNERS.has(file))

describe('switch contract', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(500)
    const uses = files.filter(file => /<(?:AppSwitch|ButtonSwitch)\b/.test(readFileSync(file, 'utf8')))
    expect(uses.length).toBeGreaterThanOrEqual(9)
  })

  it('knows the spellings of a raw switch it must catch', () => {
    for (const sample of ['<v-switch v-model="x" />', '<VSwitch\n  v-model="x"\n/>', '<v-switch>']) {
      expect({ sample, caught: rawSwitchLines(`<template>\n${sample}\n</template>`).length > 0 }).toEqual({ sample, caught: true })
    }
    for (const sample of ['<AppSwitch v-model="x" />', '<ButtonSwitch />', '<DarkModeSwitch />', '<v-checkbox />']) {
      const caught = rawSwitchLines(`<template>\n${sample}\n</template>`).length > 0
      expect({ sample, caught }).toEqual({ sample, caught: false })
    }
  })

  it('has no raw v-switch in a template outside the pattern', () => {
    expect(offenders(files)).toEqual([])
  })

  it('does not look at comments, styles and the pattern file itself', () => {
    expect(rawSwitchLines('<template>\n  <!-- <v-switch /> -->\n  <p />\n</template>\n<style>v-switch {}</style>')).toEqual([])
    expect([...OWNERS].every(file => file.endsWith('AppSwitch.vue'))).toBe(true)
  })
})
