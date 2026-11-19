import { describe, expect, it, vi } from 'vitest'
import { useDataIteratorPageState } from './use-data-iterator-page-state'

const header = { text: 'ip', value: 'ip_address', sortable: true }

describe('useDataIteratorPageState', () => {
  it('starts on page 1 with 10 of [10, 20, 30], no sort and sortDesc true', () => {
    const state = useDataIteratorPageState({ load: vi.fn() })

    expect(state.page.value).toBe(1)
    expect(state.itemsPerPage.value).toBe(10)
    expect(state.possibleItemsPerPage).toEqual([[10, 20, 30]])
    expect(state.sortBy.value).toBe(false)
    expect(state.sortDesc.value).toBe(true)
    expect(state.searchTerm.value).toBe('')
  })

  it('reloads on page, per-page, sort and search changes when server provided', () => {
    const load = vi.fn()
    const state = useDataIteratorPageState({ load })

    state.changePage(3)
    state.changePerPage(20)
    state.changeSortBy(header)
    state.changeSortDesc(false)
    state.handleSearchTermChange('abc')

    expect(load).toHaveBeenCalledTimes(5)
  })

  it('does not reload when not server provided, but still updates the state', () => {
    const load = vi.fn()
    const state = useDataIteratorPageState({ load, serverProvided: false })

    state.changePage(2)
    state.changeSortBy(header)

    expect(load).not.toHaveBeenCalled()
    expect(state.sortBy.value).toEqual(header)
  })

  it('resets the page to 1 on per-page, sort and search changes, not on a page change', () => {
    const state = useDataIteratorPageState({ load: vi.fn() })

    state.changePage(4)
    expect(state.page.value).toBe(4)

    state.changePerPage(30)
    expect(state.page.value).toBe(1)
    expect(state.itemsPerPage.value).toBe(30)

    state.changePage(2)
    state.changeSortBy(header)
    expect(state.page.value).toBe(1)

    state.changePage(2)
    state.changeSortDesc(false)
    expect(state.page.value).toBe(1)
    expect(state.sortDesc.value).toBe(false)

    state.changePage(2)
    state.handleSearchTermChange('x')
    expect(state.page.value).toBe(1)
    expect(state.searchTerm.value).toBe('x')
  })

  it('clearFilters empties the search term', () => {
    const load = vi.fn()
    const state = useDataIteratorPageState({ load })
    state.handleSearchTermChange('x')
    load.mockClear()

    state.clearFilters()

    expect(state.searchTerm.value).toBe('')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
