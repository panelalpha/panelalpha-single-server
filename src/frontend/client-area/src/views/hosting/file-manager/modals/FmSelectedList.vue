<template>
  <ul
    class="fm-selected-list"
    data-testid="fm-selected-list"
  >
    <li
      v-for="item in items"
      :key="`${item.type}-${item.path}`"
      class="fm-selected-list__row"
    >
      <v-icon
        class="fm-selected-list__icon"
        :icon="fileTypeInfo(item).icon"
        size="18"
      />

      <span class="fm-selected-list__name">{{ item.basename }}</span>

      <span
        v-if="item.type === 'file'"
        class="fm-selected-list__size"
      >{{ formatBytes(item.size) }}</span>
    </li>
  </ul>
</template>

<script lang="ts" setup>
  // The selected folders and files with their icon and, for files, the size.
  // The list is the selection of the store (folders first), so the delete and zip modals show the same items.
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
  import { fileTypeInfo } from '@/views/hosting/file-manager/fm-file-type'
  import { formatBytes } from '@/shared/format/format-bytes'

  defineProps<{
    items: (FmDirectory | FmFile)[]
  }>()
</script>

<style lang="scss" scoped>
.fm-selected-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  list-style: none;
}

.fm-selected-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fm-selected-list__icon {
  color: var(--v-gray-lighten1);
}

.fm-selected-list__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-selected-list__size {
  flex: 0 0 auto;
  color: var(--v-gray-lighten1);
}
</style>
