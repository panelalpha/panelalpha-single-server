// Contract test (a11y): an icon-only `AppButton` shows no text, so the only name a screen reader can read is
// `aria-label`. The button's tooltip is a description (`aria-describedby`), not a name, so a button with `:tooltip` and no
// `aria-label` still announces "button". The kit takes the name as `aria-label` (or the `ariaLabel` prop of `AppButton`).
// An icon-only link (`<router-link><v-icon /></router-link>`, `<a><img></a>`) is the same case, read as a bare "link".
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
// The kinds that draw a bare icon, and the `icon` prop of the `v-btn` (a preset icon button of `kind="secondary"` etc.).
const ICON_KIND = /(?<![\w-])kind="(?:icon|icon-toggle|row-action)"(?![\w-])|(?<![\w-]):?icon(?![\w-])/
const NAME = /(?<![\w-]):?(?:aria-label|ariaLabel)="[^"]+"/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

// A tag ends at the first `>` outside a quoted attribute value: the index of that `>`.
function tagEnd (source: string, start: number): number {
  let cursor = start
  let quote: string | undefined
  while (cursor < source.length) {
    const char = source[cursor]
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
    } else if (char === '"' || char === '\'') {
      quote = char
    } else if (char === '>') {
      return cursor
    }
    cursor += 1
  }
  return source.length - 1
}

// The `<AppButton …>` tags of a whole file (template, script and style: a render function may hold one too), comments removed.
function appButtonTags (text: string): string[] {
  const source = text.replaceAll(/<!--[\s\S]*?-->/g, '')
  const tags: string[] = []
  let index = source.indexOf('<AppButton')
  while (index !== -1) {
    const end = tagEnd(source, index)
    tags.push(source.slice(index, end + 1))
    index = source.indexOf('<AppButton', end)
  }
  return tags
}

function unlabelledIconButtons (file: string): number[] {
  const text = readFileSync(file, 'utf8')
  return appButtonTags(text)
    .filter(tag => ICON_KIND.test(tag) && !NAME.test(tag))
    .map(tag => text.slice(0, text.indexOf(tag)).split('\n').length)
}

// A link element (`<router-link>`, `<RouterLink>`, `<a>`) with its body: the opening tag, the markup between it and its
// closing tag, and the template line it starts on.
interface LinkTag {
  open: string
  body: string
  line: number
}

const LINK = /<\/?(router-link|RouterLink|a)(?=[\s>/])/g
// A link is markup of the template only: the same spelling in a script string or a style comment is not a link.
const TEMPLATE = /<template(?:\s[^>]*)?>|<\/template>/g
// `v-text` / `v-html` fill the element with its text, so a link carrying them shows something.
const SHOWS_TEXT = /(?<![\w-])v-(?:text|html)(?![\w-])/
// The elements that only ever paint a picture (an icon, an image), so a link holding nothing else is icon-only. A link that
// holds any other component shows text of its own (a title button, a status list), so it is not scanned further.
const ICON_ELEMENTS = new Set(['v-icon', 'v-img', 'img', 'svg', 'g', 'path', 'circle', 'rect', 'use', 'span', 'div', 'i', 'b'])

function holdsOnlyIcons (markup: string): boolean {
  const names = [...markup.replaceAll(/<!--[\s\S]*?-->/g, '').matchAll(/<([A-Z][\w.:-]*)/gi)].map(match => match[1]!)
  return names.length > 0 && names.every(name => ICON_ELEMENTS.has(name))
}

/** The content of the SFC's own `<template>` block, the slots nested in it included. */
function templateOf (text: string): { text: string, offset: number } {
  const source = text.replaceAll(/<!--[\s\S]*?-->/g, '')
  let start = -1
  let depth = 0
  for (const match of source.matchAll(TEMPLATE)) {
    if (match[0].startsWith('</')) {
      depth -= 1
      if (depth === 0 && start !== -1) {
        return { text: source.slice(start, match.index), offset: start }
      }
    } else {
      depth += 1
      if (depth === 1) {
        start = match.index + match[0].length
      }
    }
  }
  return { text: '', offset: 0 }
}

function linkTags (text: string): LinkTag[] {
  const { text: template, offset } = templateOf(text)
  const tags: LinkTag[] = []
  const line = (index: number) => text.slice(0, offset + index).split('\n').length
  // A link may hold another one (`<router-link><router-link><v-icon /></router-link></router-link>`): match by a stack.
  const stack: { name: string, start: number, open: string, bodyStart: number }[] = []
  for (const match of template.matchAll(LINK)) {
    const name = match[1]!
    if (match[0].startsWith('</')) {
      const open = stack.pop()
      if (open && open.name === name) {
        tags.push({ open: open.open, body: template.slice(open.bodyStart, match.index), line: line(open.start) })
      }
      continue
    }
    const end = tagEnd(template, match.index)
    const open = template.slice(match.index, end + 1)
    if (open.endsWith('/>')) {
      tags.push({ open, body: '', line: line(match.index) })
    } else {
      stack.push({ name, start: match.index, open, bodyStart: end + 1 })
    }
  }
  return tags
}

/** The text a link shows: its markup and comments removed, whitespace trimmed (an interpolation counts as text). */
function shownText (markup: string): string {
  let text = ''
  let cursor = 0
  while (cursor < markup.length) {
    const open = markup.indexOf('<', cursor)
    if (open === -1) {
      text += markup.slice(cursor)
      break
    }
    text += markup.slice(cursor, open)
    cursor = tagEnd(markup, open) + 1
  }
  return text.trim()
}

function unlabelledIconLinks (file: string): number[] {
  return linkTags(readFileSync(file, 'utf8'))
    .filter(link => holdsOnlyIcons(link.body) && shownText(link.body) === '' && !SHOWS_TEXT.test(link.open) && !NAME.test(link.open))
    .map(link => link.line)
}

const files = walk(SRC)

describe('icon-only buttons carry an accessible name (a11y)', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(700)
    const iconButtons = files.flatMap(file => appButtonTags(readFileSync(file, 'utf8')).filter(tag => ICON_KIND.test(tag)))
    expect(iconButtons.length).toBeGreaterThanOrEqual(45)
  })

  it('knows the spellings of an unnamed icon button it must catch', () => {
    const sample = (body: string) => appButtonTags(body).filter(tag => ICON_KIND.test(tag) && !NAME.test(tag)).length
    expect(sample('<AppButton kind="icon"><v-icon icon="$close" /></AppButton>')).toBe(1)
    expect(sample('<AppButton icon kind="secondary" @click="x = !x" />')).toBe(1)
    expect(sample('<AppButton :icon="x ? \'$eye\' : \'$eyeclosed\'" size="small" />')).toBe(1)
    expect(sample('<AppButton\n  kind="icon"\n  :tooltip="t(\'button.more\')"\n/>')).toBe(1)
    expect(sample('<AppButton\n  :aria-label="t(\'button.more\')"\n  kind="icon"\n/>')).toBe(0)
    expect(sample('<AppButton aria-label="Copy" kind="icon" />')).toBe(0)
    expect(sample('<AppButton title="More" kind="icon" />')).toBe(1)
    // Other kinds show their label, and a labelled icon does not count as icon-only.
    expect(sample('<AppButton kind="primary">More</AppButton>')).toBe(0)
    expect(sample('<AppButton kind="icon-labeled" :text="t(\'button.edit\')" />')).toBe(0)
    // A `>` inside an attribute value does not end the tag.
    expect(sample('<AppButton kind="icon" :class="a > b ? \'x\' : \'y\'" />')).toBe(1)
    // A commented-out button is not a button.
    expect(sample('<!-- <AppButton kind="icon" /> -->')).toBe(0)
  })

  it('has no unnamed icon-only AppButton', () => {
    const offenders = files.flatMap(file => {
      const lines = unlabelledIconButtons(file)
      return lines.length > 0 ? [`${relative(ROOT, file)}: template line ${lines.join(', ')}`] : []
    })
    expect(offenders).toEqual([])
  })
})

describe('icon-only links carry an accessible name (a11y)', () => {
  it('scans the source tree', () => {
    const links = files.flatMap(file => linkTags(readFileSync(file, 'utf8')))
    expect(links.length).toBeGreaterThanOrEqual(40)
  })

  it('knows the spellings of an unnamed icon link it must catch', () => {
    const sample = (body: string) => linkTags(body)
      .filter(link => holdsOnlyIcons(link.body) && shownText(link.body) === '' && !SHOWS_TEXT.test(link.open) && !NAME.test(link.open))
      .length
    expect(sample('<template><router-link class="back" to="/"><v-icon icon="$arrowleft" /></router-link></template>')).toBe(1)
    expect(sample('<template><a class="logo" href="/"><img alt="" src="logo.svg"></a></template>')).toBe(1)
    expect(sample('<template><RouterLink to="/"><v-img :src="logo" /></RouterLink></template>')).toBe(1)
    expect(sample('<template><a href="/" title="Home"><img src="logo.svg"></a></template>')).toBe(1)
    expect(sample('<template><router-link\n  :aria-label="t(\'button.projects.back\')"\n  to="/"\n>\n  <v-icon icon="$arrowleft" />\n</router-link></template>')).toBe(0)
    expect(sample('<template><a href="/" aria-label="My Projects"><img src="logo.svg"></a></template>')).toBe(0)
    // A link with text, a label, an interpolation or `v-text` of its own needs no name.
    expect(sample('<template><a href="/">Home</a></template>')).toBe(0)
    expect(sample('<template><a href="/"><span>Home</span></a></template>')).toBe(0)
    expect(sample('<template><router-link to="/projects">{{ t(\'heading.navbar.tab.myProjects\') }}</router-link></template>')).toBe(0)
    expect(sample('<template><a :href="item.url" v-text="item.url" /></template>')).toBe(0)
    // A link holding another one: the outer one shows the inner link's text.
    expect(sample('<template><router-link to="/a"><a href="/b" aria-label="Edit"><v-icon icon="$x" /></a>{{ item.title }}</router-link></template>')).toBe(0)
    expect(sample('<template><router-link to="/a"><router-link to="/a"><v-icon icon="$x" /></router-link>{{ item.title }}</router-link></template>')).toBe(1)
    // A link whose content is a component (a title, a status list) shows text of its own.
    expect(sample('<template><router-link to="/a"><instance-item-actions :instance="item" /></router-link></template>')).toBe(0)
    expect(sample('<template><router-link to="/a"><v-icon icon="$x" /><instance-item-actions :instance="item" /></router-link></template>')).toBe(0)
    // Other elements named `a…` are not links, a commented-out link is not a link, and a link in a style comment is not one.
    expect(sample('<template><app-bar><abbr title="x">x</abbr></app-bar></template>')).toBe(0)
    expect(sample('<template><!-- <a href="/"><v-icon icon="$x" /></a> --></template>')).toBe(0)
    expect(sample('<script>// V2 tabs are borderless `<a>`s</script>')).toBe(0)
  })

  it('has no unnamed icon-only link', () => {
    const offenders = files.flatMap(file => {
      const lines = unlabelledIconLinks(file)
      return lines.length > 0 ? [`${relative(ROOT, file)}: template line ${lines.join(', ')}`] : []
    })
    expect(offenders).toEqual([])
  })
})
