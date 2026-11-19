<template>
  <div
    class="fm-list"
    data-testid="fm-list"
    @contextmenu.prevent="onEmptyContextMenu"
  >
    <DataIteratorNoResultsContainer
      v-if="noResults"
      data-testid="fm-no-results"
      :search-term="store.searchTerm"
      @clear-all-filters="store.setSearchTerm('')"
    />

    <EmptyState
      v-else-if="emptyFolder"
      data-testid="fm-empty"
      :title="t('message.fileManager.emptyFolder', { defaultValue: 'This folder is empty' })"
      variant="compact"
    >
      <template #image>
        <v-icon
          class="fm-icon-fill"
          color="var(--v-gray-lighten1)"
          icon="$folderOpen"
          size="48"
        />
      </template>
    </EmptyState>

    <FmTableView
      v-else-if="store.view === 'table'"
      @item-click="onItemClick"
      @item-context-menu="onItemContextMenu"
      @item-dblclick="onItemDoubleClick"
    />

    <FmGridView
      v-else
      @item-click="onItemClick"
      @item-context-menu="onItemContextMenu"
      @item-dblclick="onItemDoubleClick"
    />

    <FmPreviewModal
      :account-id="store.accountId"
      :file="previewFile"
      @close="previewFile = null"
    />

    <FmPropertiesModal
      :item="propertiesItem"
      @close="propertiesItem = null"
    />

    <FmContextMenu
      :position="menu ? { x: menu.x, y: menu.y } : null"
      :target="menu ? menu.target : null"
      @close="menu = null"
      @select="onMenuSelect"
    />
  </div>
</template>

<script lang="ts" setup>
  // The selection lives
  // in the store, so the navbar and the InfoBlock read it from there. The editor opens for the selected file (a click before the double click selects it).
  // The player modals read the selection from the store when they open (audio: the selected audio files, the playlist).
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
  import type { FmMenuAction } from '@/views/hosting/file-manager/fm-context-menu'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { downloadUrl } from '@/views/hosting/file-manager/file-manager.api'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { openActionFor, openPdf } from '@/views/hosting/file-manager/fm-open'
  import { isAdditiveClick } from '@/views/hosting/file-manager/fm-selection'
  import FmPreviewModal from '@/views/hosting/file-manager/modals/FmPreviewModal.vue'
  import FmPropertiesModal from '@/views/hosting/file-manager/modals/FmPropertiesModal.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import FmContextMenu from './FmContextMenu.vue'
  import FmGridView from './FmGridView.vue'
  import FmTableView from './FmTableView.vue'

  interface MenuState {
    /** The item under the pointer, or null for the empty area. */
    target: FmDirectory | FmFile | null
    x: number
    y: number
  }

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const previewFile = ref<FmFile | null>(null)
  const propertiesItem = ref<FmDirectory | FmFile | null>(null)
  const menu = ref<MenuState | null>(null)

  /** A search term that matches nothing in the folder (an empty folder without a term keeps its own state). */
  const noResults = computed(() => store.searchTerm.trim() !== '' && store.visibleDirectories.length === 0 && store.visibleFiles.length === 0)

  /** A folder without items (after the hidden files filter) and without a search term. */
  const emptyFolder = computed(() => store.searchTerm.trim() === '' && store.visibleDirectories.length === 0 && store.visibleFiles.length === 0 && store.loading === 0)

  function onItemClick (item: FmDirectory | FmFile, event: MouseEvent): void {
    store.select(item, isAdditiveClick(event))
  }

  function onItemDoubleClick (item: FmDirectory | FmFile): void {
    const action = openActionFor(item)
    if (action === 'open') {
      void store.goTo(item.path)
      return
    }
    if (item.type !== 'file' || store.accountId === null) {
      return
    }
    switch (action) {
      case 'preview': {
        previewFile.value = item
        return
      }
      case 'pdf': {
        void openPdf(store.accountId, item.path)
        return
      }
      case 'edit': {
        store.openModal('editor')
        return
      }
      case 'audio': {
        store.openModal('audioPlayer')
        return
      }
      case 'video': {
        store.openModal('videoPlayer')
        return
      }
    }
  }

  /** A click on an item that is not selected selects it alone; a selected item keeps the selection. */
  function onItemContextMenu (item: FmDirectory | FmFile, event: MouseEvent): void {
    store.select(item)
    menu.value = { target: item, x: event.clientX, y: event.clientY }
  }

  function onEmptyContextMenu (event: MouseEvent): void {
    menu.value = { target: null, x: event.clientX, y: event.clientY }
  }

  /** Runs a chosen menu action on the first selected item. */
  function onMenuSelect (action: FmMenuAction): void {
    menu.value = null
    if (action === 'paste') {
      void store.paste()
      return
    }
    const entry = store.selectedItems[0]
    if (entry === undefined) {
      return
    }
    switch (action) {
      case 'open': {
        if (entry.type === 'dir') {
          void store.goTo(entry.path)
        }
        return
      }
      case 'view': {
        if (entry.type === 'file') {
          previewFile.value = entry
        }
        return
      }
      case 'download': {
        if (entry.type === 'file' && store.accountId !== null) {
          window.open(downloadUrl(store.accountId, entry.path), '_blank', 'noopener')
        }
        return
      }
      case 'edit': {
        if (entry.type === 'file') {
          store.openModal('editor')
        }
        return
      }
      case 'audioPlay': {
        store.openModal('audioPlayer')
        return
      }
      case 'videoPlay': {
        store.openModal('videoPlayer')
        return
      }
      case 'copy':
      case 'cut': {
        store.setClipboard(action)
        return
      }
      case 'properties': {
        propertiesItem.value = entry
        return
      }
      case 'rename':
      case 'zip':
      case 'unzip':
      case 'delete': {
        store.openModal(action)
        return
      }
    }
  }
</script>

<style lang="scss" scoped>
.fm-list {
  min-height: 0;
}
</style>
