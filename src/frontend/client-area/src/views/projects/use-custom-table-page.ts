import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useInstancesStore } from './instances.store'

// Selection (kept in `useInstancesStore`), the table-only data (`tableItems`) and the sub-row sort (`sortSubinstances`)
// as pure functions plus a thin composable.

/**
 * Every item becomes a group `{ ...item, subInstances }` whose first entry is the item itself
 * (the main row) and whose others are its staging apps (the sub-rows). Entries without an id repeat or are missing are skipped.
 */
export function buildTableItems (items: InstanceResource[]): InstanceResource[] {
  const tableItems: InstanceResource[] = []

  for (const item of items) {
    const rawSubInstances = Array.isArray(item?.subInstances) ? item.subInstances : []

    const seenIds = new Set<number>()
    const subInstances: InstanceResource[] = [{ ...item, subInstances: [] }]
    if (item?.id != null) {
      seenIds.add(item.id)
    }

    for (const subItem of rawSubInstances) {
      if (!subItem) {
        continue
      }
      if (subItem.id != null && seenIds.has(subItem.id)) {
        continue
      }

      subInstances.push({ ...subItem, subInstances: [] })
      if (subItem.id != null) {
        seenIds.add(subItem.id)
      }
    }

    tableItems.push({ ...item, subInstances })
  }

  return tableItems
}

/**
 * The sub-rows (never the main row) are sorted by title or status. Legacy compares
 * `sortBy.text` with the capitalised "Title" / "Status", which the current header keys (`name`, `status`) never are, so in practice
 * the order stays as the API sent it.
 */
export function sortSubinstances (
  items: InstanceResource[],
  sortBy: Pick<LegacySortHeader, 'text'> | false | undefined,
  sortDesc: boolean,
): InstanceResource[] {
  const list = Array.isArray(items) ? items : []
  const text = sortBy ? sortBy.text : undefined

  return list.map(group => {
    const groupSubInstances = Array.isArray(group?.subInstances) ? group.subInstances : []
    if (groupSubInstances.length <= 1) {
      return group
    }

    const [main, ...rest] = groupSubInstances as [InstanceResource, ...InstanceResource[]]

    // eslint-disable-next-line unicorn/no-array-sort -- `toSorted` is not in the app tsconfig lib (es2022); `rest` is already a copy
    const sortedRest = rest.sort((item, item2) => {
      if (text === 'Title') {
        const compare = (item.title ?? '').localeCompare(item2.title ?? '')
        return sortDesc ? -compare : compare
      }
      if (text === 'Status') {
        const a = item.status.value
        const b = item2.status.value
        if (a > b) {
          return sortDesc ? -1 : 1
        }
        if (a < b) {
          return sortDesc ? 1 : -1
        }
        return 0
      }
      return 0
    })

    return { ...group, subInstances: [main, ...sortedRest] }
  })
}

export function useCustomTablePage () {
  const store = useInstancesStore()
  const { items, checkedItems, sortBy, sortDesc } = storeToRefs(store)

  const tableItems = computed(() => sortSubinstances(buildTableItems(items.value), sortBy.value, sortDesc.value))

  return {
    tableItems,
    checkedItems,
    handleItemCheck: store.handleItemCheck,
    handleSelectAll: store.handleSelectAll,
  }
}
