import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GO_SORT_KEYS } from '@/views/onboarding/go/go-catalog.api'
import { THEME_SORT_KEYS } from '@/views/onboarding/template/template-model'
import { buildInstanceKeys } from '@/views/projects/instance-keys'
import { newestHeader, sortOptions } from '@/views/projects/instance-sort'
import { themeDefaultSort, themeSortKeys } from '@/views/projects/project/advanced/themes/installed-themes'
import { newThemeDefaultSort, newThemeSortKeys } from '@/views/projects/project/advanced/themes/new-themes'
import { pluginDefaultSort, pluginSortKeys } from '@/views/projects/project/plugins/installed-plugins'
import { newPluginDefaultSort, newPluginSortKeys } from '@/views/projects/project/plugins/new-plugins'
import { getItemLabel, getSelectionLabel } from '@/shared/ui/form/select-label'

// `SelectDropdown` shows the `text` of an item as `form.option.<text>`, so a sort option whose `text` is missing from the
// English bundle leaves the raw key on the screen (`form.option.Newest` on My Projects after a create, for one).

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT_AREA = join(here, '../..')

type Flat = Record<string, string>

function flatten (node: unknown, prefix = '', out: Flat = {}): Flat {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out)
    }
  } else if (prefix) {
    out[prefix] = String(node)
  }
  return out
}

const bundle = flatten(JSON.parse(readFileSync(join(CLIENT_AREA, 'parity/fixtures/translation.en.json'), 'utf8')))

/** i18next answers a missing key with the key itself, which is what the user then reads. */
const t = (key: string): string => bundle[key] ?? key

const selectLabel = (value: unknown, items: readonly unknown[]): string => String(getSelectionLabel(value, { items, t }))

interface SortControl {
  /** The label the user reads the dropdown under. */
  name: string
  /** The view that renders the dropdown (a `DataIteratorFilterControls` with both `keys` and `sort-by`). */
  view: string
  items: readonly LegacySortHeader[]
  /** The option the screen starts on. */
  start: LegacySortHeader
}

const CONTROLS: SortControl[] = [
  { name: 'My Projects', view: 'projects/InstancesView.vue', items: sortOptions(buildInstanceKeys(false)), start: newestHeader() },
  { name: 'Installed Themes', view: 'projects/project/advanced/themes/ThemesView.vue', items: themeSortKeys, start: themeDefaultSort },
  { name: 'Available Themes', view: 'projects/project/advanced/themes/ThemesView.vue', items: newThemeSortKeys, start: newThemeDefaultSort },
  { name: 'Installed Plugins', view: 'projects/project/plugins/PluginsView.vue', items: pluginSortKeys, start: pluginDefaultSort },
  { name: 'Available Plugins', view: 'projects/project/plugins/PluginsView.vue', items: newPluginSortKeys, start: newPluginDefaultSort },
  { name: 'Onboarding themes', view: 'onboarding/modals/OnboardingChooseTemplateModal.vue', items: THEME_SORT_KEYS, start: THEME_SORT_KEYS[0]! },
  { name: 'PanelAlpha GO! catalog', view: 'onboarding/modals/OnboardingGoCatalogModal.vue', items: GO_SORT_KEYS, start: GO_SORT_KEYS[0]! },
]

const optionKey = (item: LegacySortHeader): string => `form.option.${String(item.text)}`

/** Every `.vue` under `src/views` that renders a sort dropdown. */
function sortControlViews (): string[] {
  const found: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.name.endsWith('.vue')) {
        const source = readFileSync(path, 'utf8')
        if (filterControlTags(source).some(tag => /:(?:sort-by|sortBy)/i.test(tag))) {
          found.push(relative(join(CLIENT_AREA, 'src/views'), path))
        }
      }
    }
  }
  walk(join(CLIENT_AREA, 'src/views'))
  return found
}

/** The `<data-iterator-filter-controls …>` tags of a view with their attributes; a tag ends at the first `>` outside quotes. */
function filterControlTags (source: string): string[] {
  const tags: string[] = []
  const marker = /<(?:data-iterator-filter-controls|DataIteratorFilterControls)/g
  let match = marker.exec(source)
  while (match) {
    let quote = ''
    let index = match.index + match[0].length
    for (; index < source.length; index++) {
      const char = source[index]
      if (quote) {
        quote = char === quote ? '' : char
      } else if (char === '"' || char === '\'') {
        quote = char
      } else if (char === '>') {
        break
      }
    }
    tags.push(source.slice(match.index, index))
    marker.lastIndex = index
    match = marker.exec(source)
  }
  return tags
}

describe('sort dropdown labels', () => {
  it('offers every option with a text the English bundle translates', () => {
    const missing = CONTROLS.flatMap(control => control.items
      .filter(item => !(optionKey(item) in bundle))
      .map(item => `${control.name}: ${optionKey(item)}`))
    expect(missing).toEqual([])
  })

  it('renders every option with a translated label', () => {
    const raw = CONTROLS.flatMap(control => control.items
      .map(item => `${control.name}: ${String(getItemLabel(item, { items: control.items, t }))}`)
      .filter(label => label.includes('form.option.')))
    expect(raw).toEqual([])
  })

  it('starts on an option of its own list, translated', () => {
    const broken = CONTROLS
      .map(control => ({ name: control.name, key: optionKey(control.start), label: selectLabel(control.start, control.items) }))
      .filter(start => !(start.key in bundle) || start.label.includes('form.option.'))
      .map(start => `${start.name}: ${start.key} -> ${start.label}`)
    expect(broken).toEqual([])
  })

  it('reads "Newest" on My Projects and "Most Rated" on Available Themes', () => {
    const projects = CONTROLS.find(control => control.name === 'My Projects')!
    const themes = CONTROLS.find(control => control.name === 'Available Themes')!
    expect(selectLabel(projects.start, projects.items)).toBe('Newest')
    expect(selectLabel(themes.start, themes.items)).toBe('Most Rated')
  })

  it('knows every view that renders a sort dropdown', () => {
    expect([...new Set(sortControlViews())].toSorted()).toEqual([...new Set(CONTROLS.map(control => control.view))].toSorted())
  })
})
