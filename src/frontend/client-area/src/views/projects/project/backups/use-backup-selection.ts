import type { BackupItem } from './backups-list'
import { computed, type Ref, ref } from 'vue'

// The selection of the backups, wired as `use-device-selection.ts`. The
// select-all works on the rows of the current page only (`this.items` is the page slice in legacy), so
// the selection of other pages stays. The selection keys are the backup ids, as legacy `checkedItems` does.

export function useBackupSelection (pageItems: Readonly<Ref<readonly BackupItem[]>>) {
  const checkedItems = ref<number[]>([])

  // For the sort header: every row of the page is checked, and not for an empty page. Deviation from the legacy
  // length compare: a selection on another page must not tick the header of this one.
  const allSelected = computed(() => pageItems.value.length > 0
    && pageItems.value.every(item => checkedItems.value.includes(item.id)))

  function handleItemCheck (item: Pick<BackupItem, 'id'>): void {
    const index = checkedItems.value.indexOf(item.id)
    if (index === -1) {
      checkedItems.value.push(item.id)
    } else {
      checkedItems.value.splice(index, 1)
    }
  }

  /** Select all on the current page: check the rows that are not yet, or uncheck the rows of this page only. */
  function handleSelectAll (checked: boolean): void {
    for (const item of pageItems.value) {
      const index = checkedItems.value.indexOf(item.id)
      if (checked && index === -1) {
        checkedItems.value.push(item.id)
      } else if (!checked && index !== -1) {
        checkedItems.value.splice(index, 1)
      }
    }
  }

  /** Empties the whole selection (after a successful mass delete). */
  function clear (): void {
    checkedItems.value = []
  }

  return { checkedItems, allSelected, handleItemCheck, handleSelectAll, clear }
}
