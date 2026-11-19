import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isSameLabel } from './label-menu'
import { getLabels } from './labels.api'

/**
 * State of the account labels: the `GET /labels` answer that the list filter and the label menus
 * read, and the local edits after an assign, unassign, create or delete.
 */
export const useLabelsStore = defineStore('labels', () => {
  const availableLabels = ref<LabelChipItem[]>([])

  /** Reads `GET /labels` (cached) into the store; a failure is ignored. */
  async function loadLabels (): Promise<void> {
    try {
      availableLabels.value = await getLabels()
    } catch {
      // A failure is ignored.
    }
  }

  /** Appends the label to the account list after a create. */
  function addUserLabel (label: LabelChipItem): void {
    availableLabels.value = [...availableLabels.value, label]
  }

  /** Removes the label from the account list, by id when both sides have one. */
  function removeUserLabel (label: LabelChipItem): void {
    availableLabels.value = availableLabels.value.filter(item => !isSameLabel(item, label))
  }

  /**
   * Writes `in_use` on the matching item in place. Legacy mutates the
   * objects, so the cached `/labels` answer follows, and so does this one.
   */
  function updateLabelInUse (label: LabelChipItem, inUse: boolean): void {
    for (const item of availableLabels.value) {
      if (isSameLabel(item, label)) {
        item.in_use = inUse
      }
    }
  }

  return {
    availableLabels,
    loadLabels,
    addUserLabel,
    removeUserLabel,
    updateLabelInUse,
  }
})
