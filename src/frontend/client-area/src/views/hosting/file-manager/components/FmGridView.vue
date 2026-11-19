<template>
  <div
    class="fm-grid"
    data-testid="fm-grid"
  >
    <div class="fm-grid__items">
      <div
        v-for="directory in store.visibleDirectories"
        :key="`d-${directory.path}`"
        class="fm-grid-item"
        :class="{ active: store.isSelected(directory) }"
        :title="directory.basename"
        @click="emit('item-click', directory, $event)"
        @contextmenu.prevent.stop="emit('item-context-menu', directory, $event)"
        @dblclick="emit('item-dblclick', directory)"
      >
        <div class="fm-grid-item__icon">
          <v-icon
            class="fm-grid-item__glyph fm-grid-item__glyph--dir fm-icon-fill"
            :icon="fileTypeInfo(directory).icon"
            size="40"
          />
        </div>

        <div class="fm-grid-item__info">
          {{ directory.basename }}
        </div>
      </div>

      <div
        v-for="file in store.visibleFiles"
        :key="`f-${file.path}`"
        class="fm-grid-item"
        :class="{ active: store.isSelected(file) }"
        :title="file.basename"
        @click="emit('item-click', file, $event)"
        @contextmenu.prevent.stop="emit('item-context-menu', file, $event)"
        @dblclick="emit('item-dblclick', file)"
      >
        <div class="fm-grid-item__icon">
          <FmThumbnail
            v-if="fileTypeInfo(file).previewable && store.accountId !== null"
            :account-id="store.accountId"
            :file="file"
          />

          <v-icon
            v-else
            class="fm-grid-item__glyph fm-icon-fill"
            :icon="fileTypeInfo(file).icon"
            size="40"
          />
        </div>

        <div class="fm-grid-item__info">
          {{ file.basename }}
        </div>

        <div class="fm-grid-item__info">
          {{ formatBytes(file.size) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Tiles come from the store lists; only image tiles load a thumbnail (FmThumbnail).
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { fileTypeInfo } from '@/views/hosting/file-manager/fm-file-type'
  import { formatBytes } from '@/shared/format/format-bytes'
  import FmThumbnail from './FmThumbnail.vue'

  const emit = defineEmits<{
    'item-click': [item: FmDirectory | FmFile, event: MouseEvent]
    'item-dblclick': [item: FmDirectory | FmFile]
    'item-context-menu': [item: FmDirectory | FmFile, event: MouseEvent]
  }>()

  const store = useFileManagerStore()

</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.fm-grid {
  padding-top: 16px;
}

.fm-grid__items {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
}

.fm-grid-item {
  width: 125px;
  padding: 12px 6px;
  margin: 0 16px 16px 0;
  border: 1px solid var(--v-gray-lighten2);
  border-radius: 8px;
  font-size: 13px;
  line-height: 18px;
  color: var(--v-text-base);
  text-align: center;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.fm-grid-item:hover {
  background-color: var(--v-row-hover);
}

.fm-grid-item.active,
.fm-grid-item.active:hover {
  background-color: var(--v-row-selected);
  border-color: rgb(var(--v-theme-primary));
  box-shadow: v.$box-shadow-elevation-4;
}

.fm-grid-item.active .fm-grid-item__info:first-of-type {
  font-weight: 700;
}

.fm-grid-item__icon {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 88px;
}

.fm-grid-item__glyph.v-icon {
  color: var(--v-gray-darken1);
}

.fm-grid-item__glyph--dir.v-icon {
  color: rgb(var(--v-theme-primary));
}

.fm-grid-item__info {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
