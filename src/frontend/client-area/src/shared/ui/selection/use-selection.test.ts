import { describe, expect, it } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import { useSelection } from './use-selection'

interface Row { name: string, title: string }

function rows (...names: string[]): Row[] {
  return names.map(name => ({ name, title: name.toUpperCase() }))
}

describe('useSelection', () => {
  it('toggles one item by its key and keeps the checked entries in list order', () => {
    const items = ref(rows('akismet', 'hello-dolly', 'jetpack'))
    const selection = useSelection(items, row => row.name)

    selection.handleItemCheck(items.value[2]!)
    selection.handleItemCheck(items.value[0]!)
    expect(selection.checkedItems.value).toEqual(['jetpack', 'akismet'])
    expect(selection.checkedEntries.value.map(row => row.name)).toEqual(['akismet', 'jetpack'])

    selection.handleItemCheck(items.value[2]!)
    expect(selection.checkedItems.value).toEqual(['akismet'])
  })

  it('select all checks every item of the current list and deselect unchecks them, leaving other keys alone', () => {
    const items = ref(rows('a', 'b', 'c'))
    const selection = useSelection(items, row => row.name)
    selection.checkedItems.value.push('elsewhere')

    selection.handleSelectAll(true)
    expect(selection.checkedItems.value).toEqual(['elsewhere', 'a', 'b', 'c'])

    selection.handleSelectAll(false)
    expect(selection.checkedItems.value).toEqual(['elsewhere'])
  })

  it('select all only touches the list it was given (the page), not the whole data set', () => {
    const page = ref(rows('a', 'b'))
    const selection = useSelection(page, row => row.name)

    selection.handleSelectAll(true)
    page.value = rows('c', 'd')
    selection.handleSelectAll(true)

    expect(selection.checkedItems.value).toEqual(['a', 'b', 'c', 'd'])
  })

  it('retainVisible drops the checked keys that left the visible list and keeps the rest', () => {
    const items = ref(rows('a', 'b', 'c'))
    const selection = useSelection(items, row => row.name)
    selection.handleSelectAll(true)

    items.value = rows('b', 'c', 'd')
    selection.retainVisible()

    expect(selection.checkedItems.value).toEqual(['b', 'c'])
    expect(selection.checkedEntries.value.map(row => row.name)).toEqual(['b', 'c'])
  })

  it('clear empties the selection', () => {
    const items = ref(rows('a', 'b'))
    const selection = useSelection(items, row => row.name)
    selection.handleSelectAll(true)

    selection.clear()

    expect(selection.checkedItems.value).toEqual([])
    expect(selection.checkedEntries.value).toEqual([])
  })

  it('accepts numeric keys', () => {
    const items = ref([{ id: 4 }, { id: 9 }])
    const selection = useSelection(items, item => item.id)

    selection.handleSelectAll(true)

    expect(selection.checkedItems.value).toEqual([4, 9])
  })

  it('keeps the selection to the page when the host runs retainVisible on every page change (Plugins host)', async () => {
    const items = ref(rows('akismet', 'hello-dolly'))
    const selection = useSelection(items, row => row.name)
    watch(items, selection.retainVisible)

    selection.handleSelectAll(true)
    items.value = rows('jetpack')
    await nextTick()

    expect(selection.checkedItems.value).toEqual([])
    selection.handleSelectAll(false)
    expect(selection.checkedEntries.value).toEqual([])

    selection.handleItemCheck(items.value[0]!)
    items.value = rows('jetpack', 'woocommerce')
    await nextTick()

    expect(selection.checkedItems.value).toEqual(['jetpack'])
  })
})
