<template>
  <v-table
    class="fm-table"
    data-testid="fm-table"
    density="compact"
  >
    <thead>
      <tr>
        <th
          v-for="column in visibleColumns"
          :key="column.field"
          :aria-sort="ariaSort(column.field)"
          class="fm-table__head"
          :class="`fm-table__head--${column.field}`"
          @click="store.sortBy(column.field)"
        >
          {{ t(column.label) }}
          <v-icon
            v-if="store.sort.field === column.field"
            class="fm-table__sort fm-icon-fill"
            :icon="store.sort.direction === 'up' ? '$arrowup' : '$arrowdown'"
            size="14"
          />
        </th>
      </tr>
    </thead>

    <tbody>
      <tr
        v-for="directory in store.visibleDirectories"
        :key="`d-${directory.path}`"
        :aria-selected="store.isSelected(directory)"
        class="fm-table__row"
        :class="{ 'fm-table__row--selected': store.isSelected(directory) }"
        @click="emit('item-click', directory, $event)"
        @contextmenu.prevent.stop="emit('item-context-menu', directory, $event)"
        @dblclick="emit('item-dblclick', directory)"
      >
        <td class="fm-table__name">
          <v-icon
            class="fm-table__icon fm-table__icon--dir fm-icon-fill"
            :icon="fileTypeInfo(directory).icon"
            size="20"
          />
          {{ directory.basename }}
        </td>

        <td class="fm-table__muted">
          —
        </td>

        <td v-if="mdAndUp">
          {{ t('message.fileManager.table.folder', { defaultValue: 'Folder' }) }}
        </td>

        <td
          v-if="mdAndUp"
          class="fm-table__date"
        >
          {{ formatDate(directory.timestamp * 1000, { time: true }) }}
        </td>
      </tr>

      <tr
        v-for="file in store.visibleFiles"
        :key="`f-${file.path}`"
        :aria-selected="store.isSelected(file)"
        class="fm-table__row"
        :class="{ 'fm-table__row--selected': store.isSelected(file) }"
        @click="emit('item-click', file, $event)"
        @contextmenu.prevent.stop="emit('item-context-menu', file, $event)"
        @dblclick="emit('item-dblclick', file)"
      >
        <td class="fm-table__name">
          <v-icon
            class="fm-table__icon fm-icon-fill"
            :icon="fileTypeInfo(file).icon"
            size="20"
          />
          {{ file.basename }}
        </td>

        <td>{{ formatBytes(file.size) }}</td>

        <td v-if="mdAndUp">
          {{ file.extension }}
        </td>

        <td
          v-if="mdAndUp"
          class="fm-table__date"
        >
          {{ formatDate(file.timestamp * 1000, { time: true }) }}
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<script lang="ts" setup>
  // Rows are plain `tr` (not HostingTable: it has pagination and legacy checkboxes).
  // The lists come sorted and filtered from the store; this component only shows them and reports clicks.
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
  import type { FmSortField } from '@/views/hosting/file-manager/fm-sort'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { fileTypeInfo } from '@/views/hosting/file-manager/fm-file-type'
  import { formatBytes } from '@/shared/format/format-bytes'
  import { useDateFormat } from '@/shared/time/use-date-format'

  const emit = defineEmits<{
    'item-click': [item: FmDirectory | FmFile, event: MouseEvent]
    'item-dblclick': [item: FmDirectory | FmFile]
    'item-context-menu': [item: FmDirectory | FmFile, event: MouseEvent]
  }>()

  const { t } = useTranslation()
  const formatDate = useDateFormat()
  const { mdAndUp } = useDisplay()
  const store = useFileManagerStore()

  const columns: ReadonlyArray<{ field: FmSortField, label: string }> = [
    { field: 'name', label: 'table.header.name' },
    { field: 'size', label: 'table.header.size' },
    { field: 'type', label: 'table.header.type' },
    { field: 'date', label: 'table.header.date' },
  ]

  /** Below `md` only Name and Size are shown (the cells are not rendered, so `th` and `td` stay in step). */
  const visibleColumns = computed(() => (mdAndUp.value ? columns : columns.filter(column => column.field === 'name' || column.field === 'size')))

  function ariaSort (field: FmSortField): 'ascending' | 'descending' | 'none' {
    if (store.sort.field !== field) {
      return 'none'
    }
    return store.sort.direction === 'up' ? 'ascending' : 'descending'
  }
</script>

<style lang="scss" scoped>
// Plain table: no `DataTable` pattern and no pagination.
.fm-table {
  background: transparent;
}

.fm-table :deep(th),
.fm-table :deep(td) {
  padding: 0 12px 0 0;
}

.fm-table :deep(th:first-child),
.fm-table :deep(td:first-child) {
  padding-left: 24px;
}

.fm-table :deep(th:last-child),
.fm-table :deep(td:last-child) {
  padding-right: 24px;
}

.fm-table__head {
  height: 56px;
  color: var(--v-text-base);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.fm-table__head:hover,
.fm-table__head[aria-sort='ascending'],
.fm-table__head[aria-sort='descending'] {
  color: var(--v-primary-darken1);
}

@media (max-width: 767.98px) {
  .fm-table :deep(th:first-child),
  .fm-table :deep(td:first-child) {
    padding-left: 16px;
  }

  .fm-table :deep(th:last-child),
  .fm-table :deep(td:last-child) {
    padding-right: 16px;
  }
}

.fm-table__head--name {
  width: 55%;
}

.fm-table__head--size,
.fm-table__head--type {
  width: 12%;
  min-width: 96px;
}

// The date is always shown in full (e.g. "10/26/2026, 12:12:43 PM" is about 182 px plus a 24 px gap): the column has a fixed minimum,
// and the cell has no ellipsis or `max-width: 1px`. The ellipsis stays in Name, which gives up the space.
.fm-table__head--date {
  min-width: 206px;
}

.fm-table__muted {
  color: var(--v-gray-darken1);
}

.fm-table__row {
  cursor: pointer;
}

.fm-table__row:hover {
  background-color: var(--v-row-hover);
}

.fm-table__row--selected,
.fm-table__row--selected:hover {
  background-color: var(--v-row-selected);
}

// Selection: the name is bold (brand color text on this background has no 4.5:1 contrast).
.fm-table__row--selected .fm-table__name {
  font-weight: 700;
}

.fm-table__row td {
  height: 48px;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 1px;
  user-select: none;
}

.fm-table__row td.fm-table__date {
  min-width: 206px;
  max-width: none;
  overflow: visible;
  text-overflow: clip;
}

.fm-table__row:not(:last-child) td {
  border-bottom: 1px solid var(--v-gray-lighten2);
}

.fm-table__name {
  width: 55%;
}

.fm-table__icon.v-icon {
  color: var(--v-gray-darken1);
  margin-right: 8px;
}

.fm-table__icon--dir.v-icon {
  color: rgb(var(--v-theme-primary));
}

.fm-table__sort {
  margin-left: 6px;
}
</style>
