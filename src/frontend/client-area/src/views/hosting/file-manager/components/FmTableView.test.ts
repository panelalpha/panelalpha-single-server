import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmTableView from './FmTableView.vue'

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  thumbnail: vi.fn(),
}))

function folder (path: string, timestamp = 0): FmDirectory {
  return { type: 'dir', path, basename: path.split('/').at(-1) ?? path, dirname: '', timestamp }
}

function file (path: string, size: number, extension = 'txt', timestamp = 0): FmFile {
  const name = path.split('/').at(-1) ?? path
  return { type: 'file', path, basename: name, dirname: '', filename: name, extension, size, timestamp }
}

function setup (folderPath = '') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useFileManagerStore()
  store.path = folderPath
  store.directories = [folder(`${folderPath ? `${folderPath}/` : ''}zeta`, 30), folder(`${folderPath ? `${folderPath}/` : ''}alpha`, 10)]
  store.files = [
    file(`${folderPath ? `${folderPath}/` : ''}small.txt`, 10, 'txt', 20),
    file(`${folderPath ? `${folderPath}/` : ''}big.bin`, 9000, 'bin', 5),
    file(`${folderPath ? `${folderPath}/` : ''}.env`, 1, 'env', 1),
  ]
  return { pinia, store }
}

function rowNames (wrapper: { findAll: (selector: string) => { text: () => string }[] }) {
  return wrapper.findAll('tbody tr').map(row => row.text())
}

describe('FmTableView', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('lists folders before files, sorted by name ascending by default', async () => {
    const { pinia } = setup()
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })

    const names = rowNames(wrapper)
    expect(names[0]).toContain('alpha')
    expect(names[1]).toContain('zeta')
    expect(names.findIndex(name => name.includes('big.bin'))).toBeLessThan(names.findIndex(name => name.includes('small.txt')))
    wrapper.unmount()
  })

  it('sorts by a column on click and flips the direction on the active column', async () => {
    const { pinia, store } = setup()
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })

    await wrapper.get('.fm-table__head--size').trigger('click')
    expect(store.sort).toEqual({ field: 'size', direction: 'up' })
    expect(wrapper.get('.fm-table__head--size').attributes('aria-sort')).toBe('ascending')
    // Rows: alpha, zeta, .env (1 B), small.txt (10 B), big.bin (9000 B).
    expect(rowNames(wrapper)[4]).toContain('big.bin')

    await wrapper.get('.fm-table__head--size').trigger('click')
    expect(store.sort).toEqual({ field: 'size', direction: 'down' })
    expect(wrapper.get('.fm-table__head--size').attributes('aria-sort')).toBe('descending')
    expect(rowNames(wrapper)[2]).toContain('big.bin')
    wrapper.unmount()
  })

  it('has no row .. at any level (Up is in the navbar)', async () => {
    const { pinia } = setup('docs')
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })
    expect(wrapper.find('[data-testid="fm-table-up"]').exists()).toBe(false)
    expect(wrapper.emitted('level-up')).toBeUndefined()
    wrapper.unmount()
  })

  it('hides dot-files when showHidden is off', async () => {
    const { pinia, store } = setup()
    store.toggleHidden()
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })

    expect(rowNames(wrapper).some(name => name.includes('.env'))).toBe(false)
    wrapper.unmount()
  })

  it('marks the selected rows with aria-selected', async () => {
    const { pinia, store } = setup()
    store.select({ type: 'file', path: 'big.bin' })
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })
    await flushPromises()

    const selected = wrapper.findAll('tbody tr').filter(row => row.attributes('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]!.text()).toContain('big.bin')
    wrapper.unmount()
  })

  it('emits item-click with the mouse event and item-dblclick for a row', async () => {
    const { pinia } = setup()
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })
    const row = wrapper.findAll('tbody tr')[0]!

    await row.trigger('click', { ctrlKey: true })
    await row.trigger('dblclick')

    expect(wrapper.emitted('item-click')?.[0]?.[0]).toMatchObject({ type: 'dir', path: 'alpha' })
    expect((wrapper.emitted('item-click')?.[0]?.[1] as MouseEvent).ctrlKey).toBe(true)
    expect(wrapper.emitted('item-dblclick')?.[0]?.[0]).toMatchObject({ type: 'dir', path: 'alpha' })
    wrapper.unmount()
  })
  describe('below md (phone)', () => {
    const width = window.innerWidth
    beforeEach(() => {
      window.innerWidth = 500
    })
    afterEach(() => {
      window.innerWidth = width
    })

    it('shows only the Name and Size columns, header and cells in step', async () => {
      const { pinia } = setup()
      const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })

      const heads = wrapper.findAll('thead th')
      expect(heads).toHaveLength(2)
      expect(wrapper.find('.fm-table__head--type').exists()).toBe(false)
      expect(wrapper.find('.fm-table__head--date').exists()).toBe(false)
      expect(wrapper.findAll('tbody tr')[0]!.findAll('td')).toHaveLength(2)
      wrapper.unmount()
    })
  })

  it('shows four columns from md', async () => {
    const { pinia } = setup()
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })

    expect(wrapper.findAll('thead th')).toHaveLength(4)
    expect(wrapper.findAll('tbody tr')[0]!.findAll('td')).toHaveLength(4)
    wrapper.unmount()
  })

  // The date is shown in full (no ellipsis). jsdom does no layout, so the test checks the cell class and the rule in the stylesheet.
  it('gives every date cell the fm-table__date class and keeps that column out of the ellipsis rule', async () => {
    const { pinia } = setup()
    const wrapper = await mountKit(FmTableView, { global: { plugins: [pinia] } })

    for (const row of wrapper.findAll('tbody tr')) {
      expect(row.findAll('td')[3]!.classes()).toContain('fm-table__date')
    }
    wrapper.unmount()

    const source = readFileSync(resolve(__dirname, 'FmTableView.vue'), 'utf8')
    expect(source).toMatch(/\.fm-table__head--date\s*\{\s*min-width:\s*206px;/)
    expect(source).toMatch(/\.fm-table__row td\.fm-table__date\s*\{[^}]*min-width:\s*206px;[^}]*max-width:\s*none;[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;/)
  })
})
