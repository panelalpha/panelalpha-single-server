import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

/**
 * The table columns and, filtered by `sortable`, the options of the sort dropdown.
 * `text` is a copy key suffix (`form.option.<text>` in the dropdown, `table.header.<text>` in the table header).
 */
export interface InstanceKey extends LegacySortHeader {
  text: string
  groupable?: boolean
  align?: string
  customClass?: string
  isShowed?: boolean
}

export function buildInstanceKeys (collaborateEnabled: boolean): InstanceKey[] {
  return [
    { text: '', value: 'select', sortable: false },
    { text: 'name', value: 'name', groupable: true, sortable: true, align: 'start', customClass: 'title' },
    { text: 'status', groupable: true, sortable: false, value: 'subInstances[0].status.value' },
    // No per-project visitor count to sort on.
    { text: 'visitors', groupable: true, sortable: false, value: 'visitors' },
    { text: 'bandwidth', groupable: true, sortable: true, value: 'bandwidth' },
    { text: 'storage', groupable: true, sortable: true, value: 'storage' },
    { text: 'tags', value: 'tags', sortable: false },
    { text: 'shares', value: 'shares', sortable: false, align: 'center' },
    { text: 'collaborate', value: 'collaborate', sortable: false, align: 'center', isShowed: collaborateEnabled },
    { text: 'newest', value: 'created_at', sortable: true, align: 'center' },
    { text: 'actions', value: 'actions', sortable: false, align: 'end' },
  ]
}
