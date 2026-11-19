// Contract test: the catalogue cards (onboarding template, Add New theme and plugin), the screenshot of the
// installed theme card and the card skeletons are the kit `CatalogCard`, `CatalogCardMedia` and `CatalogCardSkeleton`. A card written
// by hand again would bring back its own ribbon, hover overlay or skeleton bones, and with them a second look.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..', '..')
const ROOT = join(SRC, '..')
const PATTERN_DIR = join(SRC, 'entities', 'project', 'ui', 'catalog')
const CATALOGUE_DIRS = [
  join(SRC, 'views', 'onboarding', 'template'),
  join(SRC, 'views', 'projects', 'project', 'advanced', 'themes'),
  join(SRC, 'views', 'projects', 'project', 'plugins'),
]
const CARDS: ReadonlyArray<[string, string]> = [
  [join(SRC, 'views', 'onboarding', 'template', 'TemplateCard.vue'), '<CatalogCard'],
  [join(SRC, 'views', 'projects', 'project', 'advanced', 'themes', 'NewThemeCard.vue'), '<CatalogCard'],
  [join(SRC, 'views', 'projects', 'project', 'plugins', 'NewPluginCard.vue'), '<CatalogCard'],
  [join(SRC, 'views', 'projects', 'project', 'advanced', 'themes', 'ThemeCard.vue'), '<CatalogCardMedia'],
  [join(SRC, 'views', 'onboarding', 'template', 'TemplateCardSkeleton.vue'), '<CatalogCardSkeleton'],
  [join(SRC, 'views', 'projects', 'project', 'advanced', 'themes', 'ThemeCardSkeleton.vue'), '<CatalogCardSkeleton'],
  [join(SRC, 'views', 'projects', 'project', 'plugins', 'PluginCardSkeleton.vue'), '<CatalogCardSkeleton'],
]
// The ribbon, the two hover overlays and a skeleton bone: the markers of a hand-written catalogue card (the same as the COPIES count of research.md).
const COPY = /featured-label__text|instance-actions__content|template-card__actions|<v-skeleton-loader/
const RIBBON = /featured-label__text/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('catalogue card contract', () => {
  // One test per consumer, so a failure names the file (`expect(text, file)` is refused by `vitest/valid-expect`).
  it.each(CARDS.map(([file, tag]) => [relative(ROOT, file), file, tag]))('%s renders the pattern', (_name, file, tag) => {
    expect(readFileSync(file, 'utf8')).toContain(tag)
  })

  it('no card of the catalogue directories copies the ribbon, the overlay or the skeleton', () => {
    const offenders = CATALOGUE_DIRS
      .flatMap(directory => walk(directory))
      .filter(file => /Card[^/]*\.vue$/.test(file))
      .filter(file => COPY.test(readFileSync(file, 'utf8')))
      .map(file => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('no other component copies the Featured ribbon', () => {
    const offenders = walk(SRC)
      .filter(file => !file.startsWith(PATTERN_DIR))
      .filter(file => RIBBON.test(readFileSync(file, 'utf8')))
      .map(file => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('knows a copy it must catch', () => {
    expect(COPY.test('<span class="featured-label__text">')).toBe(true)
    expect(COPY.test('<div class="instance-actions__content text-center">')).toBe(true)
    expect(COPY.test('<v-skeleton-loader class="image" type="image" />')).toBe(true)
    expect(COPY.test('<CatalogCardSkeleton media />')).toBe(false)
  })
})
