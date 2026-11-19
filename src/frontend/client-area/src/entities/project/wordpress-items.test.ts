import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import { describe, expect, it } from 'vitest'
import {
  cardDescription,
  itemAsyncState,
  pageCatalogue,
  patchCatalogueStatus,
  ratingLabel,
  replaceByName,
  starPercent,
  visibleCatalogue,
} from './wordpress-items'

// The Add New sort headers the plugins feature offers (`newPluginDefaultSort` and `newPluginSortKeys` in `views/projects/project/plugins`).
const NO_SORT: LegacySortHeader = { text: 'sort.noSort', value: '', sortable: true }
const POPULAR: LegacySortHeader = { text: 'sort.popular', value: 'active_installs', sortable: true }
const RATED: LegacySortHeader = { text: 'sort.rated', value: 'rating', sortable: true }
const RECENT: LegacySortHeader = { text: 'sort.recent', value: 'last_updated', sortable: true }

function repo (slug: string, overrides: Partial<RepositoryPlugin> = {}): RepositoryPlugin {
  return {
    id: slug,
    type: 'plugin',
    name: slug,
    slug,
    version: '1.0.0',
    short_description: '',
    status: 'publish',
    tested: '6.5',
    rating: 0,
    active_installs: 0,
    last_updated: '2026-01-01',
    ...overrides,
  }
}

function installed (name: string): InstalledPlugin {
  return { name, title: name, description: '', version: '1.0.0', status: 'active' }
}

function plugin (name: string, overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    name,
    title: name,
    description: '',
    version: '1.0.0',
    status: 'inactive',
    ...overrides,
  }
}

const options = { sortBy: false as const, sortDesc: true, page: 1, itemsPerPage: 8 }

describe('pageCatalogue', () => {
  it('drops the installed plugins and reports the total before that filter', () => {
    const all = [repo('akismet'), repo('hello-dolly'), repo('jetpack')]
    const page = pageCatalogue(all, [installed('hello-dolly')], options)

    expect(page.items.map(item => item.slug)).toEqual(['akismet', 'jetpack'])
    expect(page.itemsTotal).toBe(3)
    expect(visibleCatalogue(all, [installed('hello-dolly')])).toHaveLength(2)
  })

  it('cuts the page after the filter and the sort', () => {
    const all = Array.from({ length: 10 }, (_, index) => repo(`plugin-${index}`))

    const second = pageCatalogue(all, [], { ...options, page: 2 })

    expect(second.items.map(item => item.slug)).toEqual(['plugin-8', 'plugin-9'])
    expect(second.itemsTotal).toBe(10)
  })

  it('sorts the version column by numeric segments', () => {
    const all = [repo('a', { version: '1.9.0' }), repo('b', { version: '1.10.0' }), repo('c', { version: '9.0' }), repo('d', { version: '10.0' })]
    const sortBy = { text: 'version', value: 'version' } as unknown as typeof NO_SORT

    const asc = pageCatalogue(all, [], { ...options, sortBy, sortDesc: false })
    const desc = pageCatalogue(all, [], { ...options, sortBy, sortDesc: true })

    expect(asc.items.map(item => item.slug)).toEqual(['a', 'b', 'c', 'd'])
    expect(desc.items.map(item => item.slug)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('keeps the catalogue order when sortBy has an empty value (noSort)', () => {
    const all = [repo('b', { active_installs: 1 }), repo('a', { active_installs: 9 })]

    const page = pageCatalogue(all, [], { ...options, sortBy: NO_SORT, sortDesc: false })

    expect(page.items.map(item => item.slug)).toEqual(['b', 'a'])
  })

  it('sorts recent by last_updated, newest first when descending', () => {
    const all = [
      repo('old', { last_updated: '2024-01-01' }),
      repo('new', { last_updated: '2026-03-01' }),
      repo('mid', { last_updated: '2025-06-01' }),
    ]

    const page = pageCatalogue(all, [], { ...options, sortBy: RECENT, sortDesc: true })

    expect(page.items.map(item => item.slug)).toEqual(['new', 'mid', 'old'])
  })

  it('sorts numbers numerically, not as text', () => {
    const all = [repo('small', { active_installs: 9 }), repo('big', { active_installs: 100 })]

    const ascending = pageCatalogue(all, [], { ...options, sortBy: POPULAR, sortDesc: false })

    expect(ascending.items.map(item => item.slug)).toEqual(['small', 'big'])
  })

  it('puts a missing value last whatever the direction', () => {
    const all = [repo('none', { rating: undefined as unknown as number }), repo('low', { rating: 10 }), repo('high', { rating: 90 })]

    const descending = pageCatalogue(all, [], { ...options, sortBy: RATED, sortDesc: true })
    const ascending = pageCatalogue(all, [], { ...options, sortBy: RATED, sortDesc: false })

    expect(descending.items.map(item => item.slug)).toEqual(['high', 'low', 'none'])
    expect(ascending.items.map(item => item.slug)).toEqual(['low', 'high', 'none'])
  })
})

describe('starPercent and ratingLabel', () => {
  it('maps the 0 to 100 rating to a star fill and the rating out of five', () => {
    expect(starPercent(90)).toBe(0.9)
    expect(starPercent(150)).toBe(1)
    expect(ratingLabel(90)).toBe(4.5)
    expect(ratingLabel(100)).toBe(5)
  })
})

describe('patchCatalogueStatus', () => {
  it('sets the async status on the entry whose slug is the payload name (legacy install event)', () => {
    const all = [repo('akismet'), repo('hello-dolly')]
    const patched = patchCatalogueStatus(all, { name: 'hello-dolly', async_status: { install: 'pending' } })

    expect(patched[1]?.async_status).toEqual({ install: 'pending' })
    expect(patched[0]).toBe(all[0])
    expect(all[1]?.async_status).toBeUndefined()
  })

  it('matches the payload slug too', () => {
    const patched = patchCatalogueStatus([repo('akismet')], { name: 'Akismet Anti-spam', slug: 'akismet', async_status: { install: 'pending' } })

    expect(patched[0]?.async_status).toEqual({ install: 'pending' })
  })

  it('returns the same list without a match', () => {
    const all = [repo('akismet')]

    expect(patchCatalogueStatus(all, { name: 'other', async_status: { install: 'pending' } })).toBe(all)
  })
})

describe('itemAsyncState', () => {
  it('reports installing while the install is pending or running', () => {
    expect(itemAsyncState(plugin('a', { async_status: { install: 'pending' } }))).toBe('installing')
    expect(itemAsyncState(plugin('a', { async_status: { install: 'in_progress' } }))).toBe('installing')
  })

  it('reports updating while the update is pending or running', () => {
    expect(itemAsyncState(plugin('a', { async_status: { update: 'in_progress' } }))).toBe('updating')
  })

  it('returns null when nothing is in progress or the status is missing', () => {
    expect(itemAsyncState(plugin('a', { async_status: { install: 'finished', update: 'failed' } }))).toBeNull()
    expect(itemAsyncState(plugin('a'))).toBeNull()
  })
})

describe('replaceByName', () => {
  it('replaces the plugin with the same name and keeps the others', () => {
    const all = [plugin('a'), plugin('b')]
    const updated = plugin('b', { status: 'active' })

    const result = replaceByName(all, updated)
    expect(result[1]).toEqual(updated)
    expect(result[0]).toBe(all[0])
    expect(all[1]!.status).toBe('inactive')
  })

  it('merges a partial payload over the plugin, keeping the fields it does not carry', () => {
    const all = [plugin('b', { title: 'Bee', version: '1.2.0' })]

    const result = replaceByName(all, { name: 'b', async_status: { update: 'finished' } } as InstalledPlugin)

    expect(result[0]).toMatchObject({ name: 'b', title: 'Bee', version: '1.2.0', status: 'inactive', async_status: { update: 'finished' } })
  })

  it('leaves the list unchanged when no plugin has the name', () => {
    const all = [plugin('a')]
    expect(replaceByName(all, plugin('z'))).toEqual(all)
  })
})

describe('cardDescription', () => {
  it('shows a description of up to 100 characters whole, without Read More', () => {
    const exact = 'a'.repeat(100)
    expect(cardDescription(exact)).toEqual({ text: exact, hasReadMore: false })
    expect(cardDescription('Short text')).toEqual({ text: 'Short text', hasReadMore: false })
  })

  it('cuts a longer description at the last space before the 100th character and adds Read More', () => {
    const text = `${'word '.repeat(19)}tail-that-goes-past-the-limit and more words here`
    const result = cardDescription(text)

    expect(result.hasReadMore).toBe(true)
    expect(result.text).toBe(`${'word '.repeat(19).slice(0, -1)} `)
    expect(result.text!.length).toBeLessThanOrEqual(100)
  })

  it('reads a missing description as empty instead of throwing', () => {
    expect(cardDescription(null)).toEqual({ text: '', hasReadMore: false })
    expect(cardDescription(undefined)).toEqual({ text: '', hasReadMore: false })
  })

  it('renders nothing for a long description without a space in the first 100 characters, as legacy does', () => {
    expect(cardDescription('x'.repeat(150))).toEqual({ text: undefined, hasReadMore: true })
  })
})
