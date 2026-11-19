import type { ComputedRef, Ref } from 'vue'
import { computed, ref } from 'vue'

// The selection half of the legacy table page mixin (`handleItemCheck`, `handleSelectAll`). The list it works
// on is the one the page shows (legacy `this.items`), so select all touches the current page only. Same shape as
// the device selection of the account profile, generic over the item and its key (legacy keys were `item.id || item.name`).

export type SelectionKey = string | number

export function useSelection<T> (items: Ref<T[]>, keyOf: (item: T) => SelectionKey) {
  const checkedItems = ref<SelectionKey[]>([])

  /** The checked items on the current page, in page order (legacy `getCheckedItems`). */
  const checkedEntries: ComputedRef<T[]> = computed(() => items.value.filter(item => checkedItems.value.includes(keyOf(item))))

  function handleItemCheck (item: T): void {
    const key = keyOf(item)
    const index = checkedItems.value.indexOf(key)
    if (index === -1) {
      checkedItems.value.push(key)
    } else {
      checkedItems.value.splice(index, 1)
    }
  }

  /** Legacy `handleSelectAll(data)`: checks every item of the page that is not yet checked, or unchecks every one that is. */
  function handleSelectAll (checked: boolean): void {
    for (const item of items.value) {
      if (checkedItems.value.includes(keyOf(item)) !== checked) {
        handleItemCheck(item)
      }
    }
  }

  /** Legacy search watcher: drops the checked keys that are no longer in the visible list. Call it after the list has updated. */
  function retainVisible (): void {
    checkedItems.value = checkedItems.value.filter(key => items.value.some(item => keyOf(item) === key))
  }

  function clear (): void {
    checkedItems.value = []
  }

  return { checkedItems, checkedEntries, handleItemCheck, handleSelectAll, retainVisible, clear }
}
