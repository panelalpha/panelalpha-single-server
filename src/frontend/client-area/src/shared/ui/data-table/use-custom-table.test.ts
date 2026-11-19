import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { useCustomTable } from './use-custom-table'

describe('useCustomTable', () => {
  it('computes allSelected like CustomTableMixin.js:13-15', () => {
    const props = reactive({ checkedItems: [] as unknown[], items: [1, 2] as unknown[] })
    const { allSelected } = useCustomTable(props, vi.fn())
    expect(allSelected.value).toBe(false)
    props.checkedItems = [1]
    expect(allSelected.value).toBe(false)
    props.checkedItems = [1, 2]
    expect(allSelected.value).toBe(true)
  })

  it('is false for an empty list and treats a missing checkedItems as empty', () => {
    const empty = reactive({ checkedItems: [] as unknown[], items: [] as unknown[] })
    expect(useCustomTable(empty, vi.fn()).allSelected.value).toBe(false)
    const missing = reactive({ items: [1] as unknown[] })
    expect(useCustomTable(missing, vi.fn()).allSelected.value).toBe(false)
  })

  it('canBeSelected defaults to true (mixin data) and can be turned off', () => {
    expect(useCustomTable({}, vi.fn()).canBeSelected).toBe(true)
    expect(useCustomTable({}, vi.fn(), { canBeSelected: false }).canBeSelected).toBe(false)
  })

  it('emits the four legacy events', () => {
    const emit = vi.fn()
    const table = useCustomTable({}, emit)
    table.handleSelectAll(true)
    table.handleSelectItem({ id: 1 })
    table.changeSortBy({ value: 'name' })
    table.changeSortDesc(false)
    expect(emit.mock.calls).toEqual([
      ['update:check-all', true],
      ['update:checked-items', { id: 1 }],
      ['update:sort-by', { value: 'name' }],
      ['update:sort-desc', false],
    ])
  })
})
