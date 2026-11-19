<template>
  <div
    class="fm-tree"
    data-testid="fm-tree"
  >
    <v-treeview
      v-model:opened="opened"
      activatable
      :activated="activated"
      density="compact"
      item-title="title"
      item-value="id"
      :items="items"
      :load-children="loadChildren"
      :open-on-click="false"
      @update:activated="onActivated"
    >
      <template #prepend="{ isOpen, isActive }">
        <v-icon
          class="fm-icon-fill"
          :class="{ 'fm-tree__icon--active': isActive }"
          :icon="isOpen ? '$folderOpen' : '$folder'"
          size="20"
        />
      </template>
    </v-treeview>
  </div>
</template>

<script lang="ts" setup>
  // The tree loads a folder's subfolders when it is opened.
  import type { FmTreeItem } from '@/views/hosting/file-manager/fm-tree-items'
  import { computed, ref, watch } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { ROOT_PATH } from '@/views/hosting/file-manager/fm-path'
  import { buildTreeItems, pathToRootIds } from '@/views/hosting/file-manager/fm-tree-items'

  const store = useFileManagerStore()

  const items = computed<FmTreeItem[]>(() => buildTreeItems(store.tree))
  const opened = ref<string[]>([])
  const activated = computed<string[]>(() => (store.path === ROOT_PATH ? [] : [store.path]))

  /** The way to the current folder is opened, and folders on it that are not in the tree cache yet are loaded. */
  watch(() => store.path, path => {
    opened.value = [...new Set([...opened.value, ...pathToRootIds(path)])]
    for (const id of pathToRootIds(path)) {
      if (!store.tree[id]?.loaded) {
        void store.toggleTree(id)
      }
    }
  }, { immediate: true })

  /** Called by `VTreeview` when a folder with no loaded children is opened; `toggleTree` loads it and marks it expanded. */
  async function loadChildren (item: unknown): Promise<void> {
    const id = (item as { id?: unknown }).id
    if (typeof id === 'string') {
      await store.toggleTree(id)
    }
  }

  function onActivated (ids: unknown[]): void {
    const next = ids[0]
    if (typeof next === 'string' && next !== store.path) {
      void store.goTo(next)
    }
  }
</script>

<style lang="scss" scoped>
.fm-tree {
  padding: 4px 0;
  min-height: 100%;
  border-right: 1px solid var(--v-gray-lighten2);
}

.fm-tree :deep(.v-treeview-item) {
  font-size: 14px;
  line-height: 20px;
  color: var(--v-text-base);
}

// Below `md` the tree sits under the "Folders" toggle at full width, so it has no side edge.
@media (max-width: 767.98px) {
  .fm-tree {
    border-right: 0;
  }
}

// The treeview is a `v-list` with the surface colour, which in dark is lighter than the page behind it: the tree keeps the card colour.
.fm-tree :deep(.v-treeview) {
  background: transparent;
}

// Hover on the row itself: the global `_list.scss` unsets the overlay colour of a link item (`!important`), and an opaque
// overlay would cover the title. The active row keeps its own background (`--active:hover` below).
.fm-tree :deep(.v-list-item:hover) {
  background-color: var(--v-row-hover);
}

.fm-tree :deep(.v-list-item:hover > .v-list-item__overlay) {
  opacity: 0;
}

// Active folder: selected row, bold title, brand icon (brand text on the selected row has no 4.5:1 contrast, so only the icon is coloured).
.fm-tree :deep(.v-list-item--active),
.fm-tree :deep(.v-list-item--active:hover) {
  background-color: var(--v-row-selected);
  color: var(--v-text-base);
  font-weight: 600;
}

.fm-tree :deep(.v-list-item--active > .v-list-item__overlay) {
  opacity: 0;
}

.fm-tree__icon--active.v-icon {
  color: rgb(var(--v-theme-primary));
}
</style>
