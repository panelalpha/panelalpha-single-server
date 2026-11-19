// Contract test: the Read more modals of the theme and the plugin pages render the kit `ReadMoreModal`.
// A Read more card written by hand again would bring back its own frame, description styles and buttons, and with them a second look.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..', '..')
const ROOT = join(SRC, '..')
const PATTERN = join(SRC, 'views', 'projects', 'project', 'ui', 'ReadMoreModal.vue')
const CONSUMERS = [
  join(SRC, 'views', 'projects', 'project', 'advanced', 'themes', 'ThemeReadMoreModal.vue'),
  join(SRC, 'views', 'projects', 'project', 'plugins', 'PluginReadMoreModal.vue'),
]
// The card class and the description quote rule: the markers of a hand-written Read more card.
const COPY = /readme-card|deep\(blockquote\)/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

const label = (path: string): string => relative(ROOT, path).split(sep).join('/')

describe('read more modal contract (kit-read-more-modal)', () => {
  // One test per consumer, so a failure names the file (`expect(text, file)` is refused by `vitest/valid-expect`).
  it.each(CONSUMERS.map(file => [label(file), file]))('%s renders the pattern', (_name, file) => {
    expect(readFileSync(file, 'utf8')).toContain('<ReadMoreModal')
  })

  it('no other component copies the Read more card', () => {
    const offenders = walk(SRC)
      .filter(file => file !== PATTERN && COPY.test(readFileSync(file, 'utf8')))
      .map(file => label(file))
    expect(offenders).toEqual([])
  })
})
