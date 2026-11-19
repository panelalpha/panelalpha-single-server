import type { BackupItem } from './backups-list'
import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { useBackupSelection } from './use-backup-selection'

function item (id: number): BackupItem {
  return {
    id,
    name: null,
    date: '1700000000000',
    size: '1 KB',
    size_in_bytes: 1024,
    type: 'Manual',
    mode: 'full',
    convert_from_id: null,
    version: null,
    note: null,
    directory: true,
    database: true,
    async_status: {},
    items: [],
  }
}

/** A page of the list: the selection reads the page through a computed, as the view does. */
function setup (ids: number[]) {
  const page = ref<BackupItem[]>(ids.map(id => item(id)))
  const selection = useBackupSelection(computed(() => page.value))
  return { page, selection }
}

describe('useBackupSelection', () => {
  it('toggles one row by its id', () => {
    const { selection } = setup([1, 2])

    selection.handleItemCheck(item(1))
    expect(selection.checkedItems.value).toEqual([1])

    selection.handleItemCheck(item(1))
    expect(selection.checkedItems.value).toEqual([])
  })

  it('select all checks every row of the current page', () => {
    const { selection } = setup([1, 2, 3])

    selection.handleSelectAll(true)

    expect(selection.checkedItems.value).toEqual([1, 2, 3])
    expect(selection.allSelected.value).toBe(true)
  })

  it('select all keeps a selection made on another page and does not repeat its ids', () => {
    const { page, selection } = setup([1, 2])
    selection.handleItemCheck(item(9))
    selection.handleItemCheck(item(1))

    selection.handleSelectAll(true)
    expect(selection.checkedItems.value).toEqual([9, 1, 2])

    page.value = [item(2), item(3)]
    selection.handleSelectAll(true)
    expect(selection.checkedItems.value).toEqual([9, 1, 2, 3])
  })

  it('deselect all removes only the rows of the current page', () => {
    const { page, selection } = setup([1, 2])
    selection.handleItemCheck(item(7))
    selection.handleSelectAll(true)

    page.value = [item(2), item(3)]
    selection.handleSelectAll(false)

    expect(selection.checkedItems.value).toEqual([7, 1])
  })

  it('allSelected is false for an empty page and when a row of the page is not checked', () => {
    const { page, selection } = setup([])
    expect(selection.allSelected.value).toBe(false)

    page.value = [item(1), item(2)]
    selection.handleItemCheck(item(1))
    expect(selection.allSelected.value).toBe(false)
  })

  it('allSelected ignores the rows of other pages', () => {
    const { page, selection } = setup([1, 2])
    selection.handleSelectAll(true)
    selection.handleItemCheck(item(8))
    selection.handleItemCheck(item(9))

    page.value = [item(3), item(4), item(5)]

    expect(selection.allSelected.value).toBe(false)
  })

  it('clear empties the whole selection', () => {
    const { page, selection } = setup([1, 2])
    selection.handleSelectAll(true)
    page.value = [item(5)]
    selection.handleItemCheck(item(5))

    selection.clear()

    expect(selection.checkedItems.value).toEqual([])
  })
})
