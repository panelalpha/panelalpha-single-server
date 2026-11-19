import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { dataIteratorProps, useDataIterator } from './use-data-iterator'

describe('use-data-iterator', () => {
  it('keeps the DataIteratorMixin prop defaults', () => {
    expect(dataIteratorProps.possibleItemsPerPage.default()).toEqual([[4, 8, 16]])
    expect(dataIteratorProps.sortDesc.default).toBe(true)
    expect(dataIteratorProps.listStyle.default).toBe(0)
    expect(dataIteratorProps.searchTerm.default).toBe('')
    expect(dataIteratorProps.sortBy.default).toBe(false)
    expect(dataIteratorProps.items.default()).toEqual([])
    expect(Object.keys(dataIteratorProps).toSorted()).toEqual([
      'items', 'itemsPerPage', 'itemsTotal', 'keys', 'listStyle', 'loading', 'page',
      'possibleItemsPerPage', 'searchTerm', 'sortBy', 'sortDesc',
    ])
  })

  it('computes numberOfPages as ceil(itemsTotal / itemsPerPage)', () => {
    const state = reactive({ itemsTotal: 17, itemsPerPage: 8 })
    const { numberOfPages } = useDataIterator(state)
    expect(numberOfPages.value).toBe(3)
    state.itemsTotal = 16
    expect(numberOfPages.value).toBe(2)
    state.itemsTotal = 0
    expect(numberOfPages.value).toBe(0)
  })

  it('keeps the legacy NaN / Infinity results for missing or zero inputs', () => {
    // Legacy has no guard; DataIteratorFooter falls back to length 1 only for falsy values
    expect(useDataIterator(reactive({ itemsPerPage: 8 })).numberOfPages.value).toBeNaN()
    expect(useDataIterator(reactive({ itemsTotal: 17 })).numberOfPages.value).toBeNaN()
    expect(useDataIterator(reactive({ itemsTotal: 17, itemsPerPage: 0 })).numberOfPages.value).toBe(Infinity)
  })

  it('returns keys for filteredKeys only when sortBy is set', () => {
    const keys = [{ text: 'Name', value: 'name', sortable: true }]
    const state = reactive<{ sortBy: false | typeof keys[number], keys: typeof keys }>({ sortBy: keys[0]!, keys })
    const { filteredKeys } = useDataIterator(state)
    expect(filteredKeys.value).toEqual(keys)
    state.sortBy = false
    expect(filteredKeys.value).toBe(false)
  })
})
