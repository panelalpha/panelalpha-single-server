import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { PropType } from 'vue'
import { computed } from 'vue'

/**
 * Props object plus a composable that replace the legacy table mixin.
 * `canBeSelected` was mixin data (`true`; `HostingTable` overrides it with `false`), so it is an option here.
 */
export const customTableProps = {
  checkedItems: { type: Array as PropType<unknown[]>, default: undefined },
}

type CustomTableState = {
  checkedItems?: unknown[]
  items?: unknown[]
}

type EmitFor<Name extends string, Value> = (event: Name, value: Value) => void

// An intersection (not overloads) so a `defineEmits` function with extra events still fits.
export type CustomTableEmit = EmitFor<'update:check-all', boolean>
  & EmitFor<'update:checked-items', unknown>
  & EmitFor<'update:sort-by', LegacySortHeader>
  & EmitFor<'update:sort-desc', boolean>

export function useCustomTable (
  props: CustomTableState,
  emit: CustomTableEmit,
  options: { canBeSelected?: boolean } = {},
) {
  const canBeSelected = options.canBeSelected ?? true

  // Legacy read `this.checkedItems.length` and threw on a missing `checkedItems`; a missing list counts as empty.
  const allSelected = computed(() => {
    const checked = props.checkedItems ?? []
    const items = props.items ?? []
    return checked.length === items.length && items.length > 0
  })

  function handleSelectAll (data: boolean): void {
    emit('update:check-all', data)
  }

  function handleSelectItem (item: unknown): void {
    emit('update:checked-items', item)
  }

  function changeSortBy (data: LegacySortHeader): void {
    emit('update:sort-by', data)
  }

  function changeSortDesc (data: boolean): void {
    emit('update:sort-desc', data)
  }

  return { allSelected, canBeSelected, handleSelectAll, handleSelectItem, changeSortBy, changeSortDesc }
}
