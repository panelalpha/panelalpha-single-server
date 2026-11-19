import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'
import { describe, expect, it } from 'vitest'
import { fillInstallingInfo, pagePlugins, pluginDefaultSort, showTable } from './installed-plugins'

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

const base = { searchTerm: '', sortBy: pluginDefaultSort, sortDesc: false, page: 1, itemsPerPage: 8 }

describe('pagePlugins', () => {
  it('cuts the page from the sorted list and reports the full length', () => {
    const all = Array.from({ length: 10 }, (_, index) => plugin(`plugin-${String(index).padStart(2, '0')}`))

    const first = pagePlugins(all, base)
    expect(first.items).toHaveLength(8)
    expect(first.itemsTotal).toBe(10)
    expect(first.items[0]!.name).toBe('plugin-00')

    const second = pagePlugins(all, { ...base, page: 2 })
    expect(second.items.map(item => item.name)).toEqual(['plugin-08', 'plugin-09'])
  })

  it('filters by title only, case-insensitively, and takes itemsTotal after the filter', () => {
    const all = [
      plugin('akismet', { title: 'Akismet Anti-Spam' }),
      plugin('woocommerce', { title: 'WooCommerce', description: 'anti-spam helpers' }),
      plugin('hello', { title: 'Hello Dolly' }),
    ]

    const result = pagePlugins(all, { ...base, searchTerm: 'ANTI' })
    expect(result.itemsTotal).toBe(1)
    expect(result.items.map(item => item.name)).toEqual(['akismet'])
  })

  it('sorts by title ascending and descending', () => {
    const all = [plugin('b', { title: 'Beta' }), plugin('a', { title: 'alpha' }), plugin('c', { title: 'Gamma' })]

    expect(pagePlugins(all, base).items.map(item => item.title)).toEqual(['alpha', 'Beta', 'Gamma'])
    expect(pagePlugins(all, { ...base, sortDesc: true }).items.map(item => item.title)).toEqual(['Gamma', 'Beta', 'alpha'])
  })

  it('sorts by status as text', () => {
    const all = [plugin('a', { status: 'inactive' }), plugin('b', { status: 'active' })]
    const statusSort = { text: 'status', value: 'status', sortable: true }

    expect(pagePlugins(all, { ...base, sortBy: statusSort }).items.map(item => item.status)).toEqual(['active', 'inactive'])
  })

  it('compares numeric values numerically', () => {
    const all = [plugin('a', { title: '10' }), plugin('b', { title: '9' })]
    expect(pagePlugins(all, base).items.map(item => item.title)).toEqual(['9', '10'])
  })

  it('does not sort when there is no sort key', () => {
    const all = [plugin('b', { title: 'Beta' }), plugin('a', { title: 'Alpha' })]
    expect(pagePlugins(all, { ...base, sortBy: false }).items.map(item => item.name)).toEqual(['b', 'a'])
  })

  it('returns an empty page past the last one', () => {
    const result = pagePlugins([plugin('a')], { ...base, page: 3 })
    expect(result.items).toEqual([])
    expect(result.itemsTotal).toBe(1)
  })
})

describe('showTable', () => {
  it('shows the table only for the table list style on desktop', () => {
    expect(showTable(1, false)).toBe(true)
  })

  it('shows the grid for the grid list style', () => {
    expect(showTable(0, false)).toBe(false)
  })

  it('forces the grid below the breakpoint whatever the list style is', () => {
    expect(showTable(1, true)).toBe(false)
    expect(showTable(0, true)).toBe(false)
  })
})

describe('fillInstallingInfo', () => {
  const info = { akismet: { title: 'Akismet Anti-spam', description: 'Used by millions' } }

  it('fills the blank title and description of a plugin in install from the catalogue entry', () => {
    const stub = plugin('akismet', { title: '', description: '', async_status: { install: 'pending' } })

    const [filled] = fillInstallingInfo([stub], info)
    expect(filled!.title).toBe('Akismet Anti-spam')
    expect(filled!.description).toBe('Used by millions')
    expect(filled!.async_status).toEqual({ install: 'pending' })
  })

  it('keeps the fields the API already sent', () => {
    const stub = plugin('akismet', { title: 'From API', description: 'API text', async_status: { install: 'in_progress' } })

    const [kept] = fillInstallingInfo([stub], info)
    expect(kept!.title).toBe('From API')
    expect(kept!.description).toBe('API text')
  })

  it('leaves plugins out of install and without known info untouched', () => {
    const done = plugin('akismet', { title: '', description: '' })
    const other = plugin('hello', { title: '', async_status: { install: 'pending' } })

    const result = fillInstallingInfo([done, other], info)
    expect(result[0]).toBe(done)
    expect(result[1]).toBe(other)
  })
})
