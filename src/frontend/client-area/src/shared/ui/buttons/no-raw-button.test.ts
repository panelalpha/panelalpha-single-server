// Contract test: a button is `AppButton` with a `kind` (or a preset over it: `ModalCloseButton`,
// `BaseIconButton`, `CopyTextButton`, `QuickActionsButton`, `PageAddButton`), not a bare `v-btn`.
// 618 raw `v-btn` in 99 combinations of `variant`, `color` and `size` went to the kinds of `app-button.ts`.
// A new `<v-btn>` (or a `VBtn` import outside the pattern) would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const OWNERS = new Set([join(SRC, 'shared', 'ui', 'buttons', 'AppButton.vue')])
const RAW_BUTTON = /<v-btn(?![-\w])|<VBtn(?![-\w])/
const VBTN_IMPORT = /\bimport\s*\{[^}]*\bVBtn\b[^}]*\}\s*from\s*'vuetify\/components/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return /\.(?:vue|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
  })
}

// The top-level `<template>` block only (column 0), with HTML comments removed. `<style>` and `<script>` are not scanned.
function templateOf (text: string): string {
  const block = /^<template>[\s\S]+?^<\/template>/m.exec(text)
  return (block?.[0] ?? '').replaceAll(/<!--[\s\S]*?-->/g, '')
}

// Template lines with a raw `v-btn` tag (`v-btn-group` and `v-btn-toggle` are other components).
function rawButtonLines (text: string): number[] {
  return templateOf(text).split('\n').flatMap((line, index) => (RAW_BUTTON.test(line) ? [index + 1] : []))
}

function offenders (files: string[]): string[] {
  return files.flatMap(file => {
    const text = readFileSync(file, 'utf8')
    const lines = file.endsWith('.vue') ? rawButtonLines(text) : []
    const found = lines.length > 0 ? [`${relative(ROOT, file)} (use AppButton with a kind): template line ${lines.join(', ')}`] : []
    return VBTN_IMPORT.test(text) ? [...found, `${relative(ROOT, file)} (VBtn import outside AppButton)`] : found
  })
}

const files = walk(SRC).filter(file => !OWNERS.has(file))

describe('button contract (kit-button-rest)', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(900)
    const uses = files.filter(file => /<AppButton\b/.test(readFileSync(file, 'utf8')))
    expect(uses.length).toBeGreaterThanOrEqual(150)
  })

  it('knows the spellings of a raw button it must catch', () => {
    for (const sample of ['<v-btn @click="x" />', '<VBtn\n  color="primary"\n/>', '<v-btn>']) {
      expect({ sample, caught: rawButtonLines(`<template>\n${sample}\n</template>`).length > 0 }).toEqual({ sample, caught: true })
    }
    for (const sample of ['<AppButton kind="primary" />', '<ModalCloseButton />', '<v-btn-group divided>', '<v-btn-toggle v-model="x">', '<PageAddButton />']) {
      const caught = rawButtonLines(`<template>\n${sample}\n</template>`).length > 0
      expect({ sample, caught }).toEqual({ sample, caught: false })
    }
    expect(VBTN_IMPORT.test(`import { VBtn } from 'vuetify/components'`)).toBe(true)
    expect(VBTN_IMPORT.test(`import { VBtnToggle } from 'vuetify/components'`)).toBe(false)
  })

  it('has no raw v-btn in a template outside the pattern', () => {
    expect(offenders(files)).toEqual([])
  })

  it('does not look at comments, styles and the pattern file itself', () => {
    expect(rawButtonLines('<template>\n  <!-- <v-btn /> -->\n  <p />\n</template>\n<style>.v-btn {}</style>')).toEqual([])
    expect([...OWNERS].every(file => file.endsWith('AppButton.vue'))).toBe(true)
  })
})
