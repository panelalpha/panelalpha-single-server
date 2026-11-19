// Contract test: a status chip is the kit `StatusLabel` (or the entity preset `SuspendChip`), not a raw
// `v-chip` in the screens that kept their own status chips before this pattern, a tinted `div` / `span` with a former copy class,
// or the old kebab `<status-label>` API.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const OWNER_DIR = join(SRC, 'shared', 'ui', 'status-label')

/** Files whose raw status chips moved to the kit; a `v-chip` there brings a copy back. */
const FORMER_COPIES = [
  'views/account/billing/InvoiceStatusLabel.vue',
  'views/account/services/CustomLabel.vue',
  'views/account/tasks/TaskStatusLabel.vue',
  'views/connect-ai/McpTokensTableCell.vue',
  'views/connect-ai/McpActivityLogTableCell.vue',
  'views/projects/project/advanced/git/GitLogsTable.vue',
  'views/projects/project/topbar/InstanceStatusTabAlert.vue',
  'views/projects/project/topbar/InstanceTopBarTabs.vue',
  'views/hosting/containers/ContainersView.vue',
  'views/hosting/containers/ContainerPorts.vue',
  'entities/project/ui/ImportInstanceDetailsModal.vue',
].map(file => join(SRC, file))

// A former copy class on a raw tag; on the kit (`StatusLabel`, `SuspendChip`) it is only a hook for the screen's layout rules.
const RAW_LOOK
  = /class=["'][^"']*\b(?:chipTable|v-chip-faded|activated-chip|disabled-chip|cloudflare-status__badge|top-bar__chip|instance-status-tab-alert__chip|port-chip--neutral|port-chip--plain)\b/
const KEBAB_API = /<status-label\b/
const KIT_TAGS = new Set(['StatusLabel', 'SuspendChip'])
const HOOK_CLASS = /class=["'](?:[^"']* )?(?:suspend-chip|record-label)[ "']/
const RAW_TAGS = new Set(['div', 'span', 'b'])

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

// Template lines with a raw status chip. `former`: the file held a raw `v-chip` status chip before the pattern.
function rawChipLines (text: string, former: boolean): number[] {
  let tag = ''
  return templateOf(text).split('\n').flatMap((line, index) => {
    const open = /<([A-Z][\w-]*)/i.exec(line)
    if (open) {
      tag = open[1]!
    }
    const raw = (RAW_LOOK.test(line) && !KIT_TAGS.has(tag))
      || KEBAB_API.test(line)
      || (former && /<v-chip\b/.test(line))
      || (HOOK_CLASS.test(line) && RAW_TAGS.has(tag))
    return raw ? [index + 1] : []
  })
}

function offenders (files: string[]): string[] {
  return files.flatMap(file => {
    const lines = rawChipLines(readFileSync(file, 'utf8'), FORMER_COPIES.includes(file))
    return lines.length > 0 ? [`${relative(ROOT, file)} (use StatusLabel / SuspendChip): template line ${lines.join(', ')}`] : []
  })
}

const files = walk(SRC).filter(file => !file.startsWith(OWNER_DIR + '/'))

describe('status chip contract', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(FORMER_COPIES.every(file => files.includes(file))).toBe(true)
    const uses = files.filter(file => /<(?:StatusLabel|SuspendChip)\b/.test(readFileSync(file, 'utf8')))
    expect(uses.length).toBeGreaterThanOrEqual(20)
  })

  it('knows the spellings of a raw status chip it must catch', () => {
    for (const sample of [
      '<v-chip label size="small">',
      '<div class="activated-chip">',
      '<span class="px-2 py-1 cloudflare-status__badge cloudflare-status__badge--active">',
      '<v-chip class="v-chip-faded v-chip-faded--min-w-100">',
      '<status-label small />',
      '<span\n  class="top-bar__chip ml-2"\n>',
      '<div\n  class="suspend-chip ml-2"\n>',
      '<div\n  v-if="ok"\n  class="record-label configured"\n>',
    ]) {
      const caught = rawChipLines(`<template>\n${sample}\n</template>`, true).length > 0
      expect({ sample, caught }).toEqual({ sample, caught: true })
    }
    for (const sample of [
      '<StatusLabel class="record-label configured ms-2" />',
      '<StatusLabel\n  class="suspend-chip"\n/>',
      '<SuspendChip class="ml-2" />',
      '<StatusLabel\n  v-bind="activatorProps"\n  class="top-bar__chip ml-2"\n/>',
      '<p class="record-text">',
    ]) {
      const caught = rawChipLines(`<template>\n${sample}\n</template>`, true).length > 0
      expect({ sample, caught }).toEqual({ sample, caught: false })
    }
    expect(rawChipLines('<template>\n<v-chip class="label-purple">\n</template>', false)).toEqual([])
  })

  it('has no raw status chip in a template outside the pattern', () => {
    expect(offenders(files)).toEqual([])
  })

  it('does not look at comments and styles, and the owner dir is the pattern', () => {
    expect(rawChipLines('<template>\n  <!-- <v-chip label> -->\n  <p />\n</template>\n<style>.activated-chip {}</style>', true)).toEqual([])
    expect(OWNER_DIR.split('/').pop()).toBe('status-label')
  })
})
