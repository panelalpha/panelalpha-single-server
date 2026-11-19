// Contract test: a setting card is `SettingCard` (`src/shared/ui/setting-card/`) and its white bordered action is
// `AppButton kind="setting-action"`. The copies repeated the header row (`v-card-text.d-flex.justify-space-between` with the card text
// colour or `.v-card--mobile`) and the `v-btn--default` class by hand; a new copy would bring back the per-page looks.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const OWNER_DIRS = [join(SRC, 'shared', 'ui', 'setting-card'), join(SRC, 'shared', 'ui', 'buttons'), join(SRC, 'shared', 'ui', 'skeletons')]
// The skeleton of the whole Git page draws its own bones.
const EXEMPT = new Set([join(SRC, 'views', 'projects', 'project', 'advanced', 'git', 'GitCardSkeleton.vue')])
// No file may keep a raw card header any more: the Git logs header (a `DataTable` `#top` slot) is a plain `v-card-text`.
const ALLOWED_CARDS = new Map<string, number>()
const RAW_CARD = /class="[^"]*justify-space-between[^"]*(text-gray-darken-2|text--gray-darken2|v-card--mobile)/g
const RAW_ACTION = /class="[^"]*\bv-btn--default\b/g
const OLD_SKELETON = /AutoUpdatesCardSkeleton/

function walk (directory: string, extensions: string[]): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path, extensions)
    }
    return extensions.some(extension => entry.name.endsWith(extension)) ? [path] : []
  })
}

// The top-level `<template>` block only (column 0), with HTML comments removed. `<style>` and `<script>` are not scanned.
function templateOf (text: string): string {
  const block = /^<template>[\s\S]+?^<\/template>/m.exec(text)
  return (block?.[0] ?? '').replace(/<!--[\s\S]*?-->/g, '')
}

function count (text: string, pattern: RegExp): number {
  return [...templateOf(text).matchAll(pattern)].length
}

const outsideOwners = (file: string) => !OWNER_DIRS.some(dir => file.startsWith(dir + '/'))
const files = walk(SRC, ['.vue']).filter(file => outsideOwners(file) && !EXEMPT.has(file))

describe('setting card contract', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(500)
    const uses = files.filter(file => /<SettingCard\b/.test(readFileSync(file, 'utf8')))
    expect(uses.length).toBeGreaterThanOrEqual(15)
  })

  it('knows the spellings it must catch', () => {
    expect(count('<template>\n<v-card-text class="d-flex justify-space-between pb-6 text-gray-darken-2">\n</template>', RAW_CARD)).toBe(1)
    expect(count('<template>\n<v-card-text class="d-flex justify-space-between text--gray-darken2 v-card--mobile">\n</template>', RAW_CARD)).toBe(1)
    expect(count('<template>\n<v-btn class="mt-0 pt-0 v-btn--default">\n</template>', RAW_ACTION)).toBe(1)
    expect(count('<template>\n<SettingCard :title="x" />\n<AppButton kind="setting-action" />\n</template>', RAW_CARD)).toBe(0)
    expect(count('<template>\n<!-- <v-btn class="v-btn--default" /> -->\n<p />\n</template>\n<style>.v-btn--default {}</style>', RAW_ACTION)).toBe(0)
  })

  it('has no raw setting card header outside the pattern', () => {
    const offenders = files.flatMap(file => {
      const found = count(readFileSync(file, 'utf8'), RAW_CARD)
      const allowed = ALLOWED_CARDS.get(file) ?? 0
      return found > allowed ? [`${relative(ROOT, file)} (use SettingCard): ${found} header(s), ${allowed} allowed`] : []
    })
    expect(offenders).toEqual([])
  })

  it('has no raw v-btn--default action outside AppButton', () => {
    const offenders = files.filter(file => count(readFileSync(file, 'utf8'), RAW_ACTION) > 0)
      .map(file => `${relative(ROOT, file)} (use AppButton kind="setting-action")`)
    expect(offenders).toEqual([])
  })

  it('uses the old skeleton name only in its alias', () => {
    const offenders = walk(SRC, ['.vue', '.ts']).filter(file => outsideOwners(file)).filter(file => OLD_SKELETON.test(readFileSync(file, 'utf8'))).map(file => relative(ROOT, file))
    expect(offenders).toEqual([])
  })
})
