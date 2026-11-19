// Contract test: a page sidebar is `PagesSidebar` with `groups`, not its own `v-list-item`,
// `v-tab` and `sticky-sidebar` frame. Four screens had copies of the frame (Advanced, hosting, Reseller, Connect AI); one look now lives in
// the kit. A new sidebar written by hand would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const CONSUMERS = [
  join(SRC, 'views', 'projects', 'project', 'advanced', 'AdvancedPagesSidebar.vue'),
  join(SRC, 'views', 'hosting', 'HostingPagesSidebar.vue'),
  join(SRC, 'views', 'reseller', 'ResellerSidebar.vue'),
  join(SRC, 'views', 'connect-ai', 'McpToolSidebar.vue'),
]
// Other side lists with their own look, not page sidebars: onboarding filter column (TagsSidebar*) and the billing column with a card.
const EXEMPT_FRAME = new Set([
  join(SRC, 'views', 'onboarding', 'template', 'TagsSidebar.vue'),
  join(SRC, 'views', 'onboarding', 'template', 'TagsSidebarSkeleton.vue'),
  join(SRC, 'views', 'account', 'billing', 'BillingView.vue'),
])
const RAW = /<v-tabs?\b|<v-list(?:-item|-subheader)?\b|<VTabs?\b|<VList(?:Item|Subheader)?\b/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

// The top-level `<template>` block only (column 0), with HTML comments removed.
function templateOf (text: string): string {
  const block = /^<template>[\s\S]+?^<\/template>/m.exec(text)
  return (block?.[0] ?? '').replace(/<!--[\s\S]*?-->/g, '')
}

// `line` numbers of the template lines that match a raw list or tab tag.
function rawLines (text: string): number[] {
  return templateOf(text).split('\n').flatMap((line, index) => (RAW.test(line) ? [index + 1] : []))
}

function consumerProblems (file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const name = relative(ROOT, file)
  const problems: string[] = []
  if (!templateOf(text).includes('<pages-sidebar')) {
    problems.push(`${name}: no <pages-sidebar> in the template`)
  }
  const lines = rawLines(text)
  if (lines.length > 0) {
    problems.push(`${name}: raw list or tab tag in template line ${lines.join(', ')}`)
  }
  if (/<style\b/.test(text)) {
    problems.push(`${name}: a <style> block (the look lives in PagesSidebar.vue)`)
  }
  return problems
}

const views = walk(join(SRC, 'views'))

describe('page sidebar contract', () => {
  it('scans the views tree', () => {
    expect(views.length).toBeGreaterThan(100)
  })

  it('knows the raw tags it must catch', () => {
    for (const sample of ['<v-tab :to="x">', '<v-tabs>', '<v-list-item>', '<v-list-subheader>']) {
      expect({ sample, caught: rawLines(`<template>\n${sample}\n</template>`).length > 0 }).toEqual({ sample, caught: true })
    }
    const pattern = '<pages-sidebar :groups="g" />'
    expect({ sample: pattern, caught: rawLines(`<template>\n${pattern}\n</template>`).length > 0 }).toEqual({ sample: pattern, caught: false })
  })

  it('each page sidebar uses the pattern, without its own list, tabs or style', () => {
    expect(CONSUMERS.flatMap(file => consumerProblems(file))).toEqual([])
  })

  it('no other screen copies the sidebar frame', () => {
    const copies = views
      .filter(file => !CONSUMERS.includes(file) && !EXEMPT_FRAME.has(file))
      .filter(file => templateOf(readFileSync(file, 'utf8')).includes('sticky-sidebar'))
      .map(file => `${relative(ROOT, file)}: sticky-sidebar in the template`)
    expect(copies).toEqual([])
  })
})
