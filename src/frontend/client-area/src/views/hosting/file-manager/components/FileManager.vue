<template>
  <div class="fm-root">
    <FmNavbar />

    <div class="fm-body">
      <v-row
        class="fm-body__row ma-0"
        no-gutters
      >
        <v-col
          class="fm-body__tree pa-0"
          cols="12"
          md="3"
        >
          <FmFolderTree v-if="mdAndUp" />

          <template v-else>
            <button
              :aria-expanded="treeOpen"
              class="fm-tree-toggle"
              data-testid="fm-tree-toggle"
              type="button"
              @click="treeOpen = !treeOpen"
            >
              {{ t('heading.fileManager.folders', { defaultValue: 'Folders' }) }}
              <v-icon
                class="fm-tree-toggle__chevron fm-icon-fill"
                :class="{ 'fm-tree-toggle__chevron--open': treeOpen }"
                icon="$chevrondown"
                size="20"
              />
            </button>

            <FmFolderTree v-show="treeOpen" />
          </template>
        </v-col>

        <v-col
          class="fm-body__manager pa-0"
          cols="12"
          md="9"
        >
          <div
            class="fm-manager"
            data-testid="fm-manager"
          >
            <FmBreadcrumb />

            <FmManager />
          </div>
        </v-col>
      </v-row>
    </div>

    <FmInfoBlock
      @open-clipboard="store.openModal('clipboard')"
      @open-status="store.openModal('status')"
    />

    <!-- Every modal is mounted only while it is open, and only one is open at a time. -->
    <FmNewFileModal
      v-if="store.activeModal === 'newFile'"
      @close="store.closeModal()"
    />

    <FmNewFolderModal
      v-if="store.activeModal === 'newFolder'"
      @close="store.closeModal()"
    />

    <FmUploadModal
      v-if="store.activeModal === 'upload'"
      @close="store.closeModal()"
    />

    <FmDeleteModal
      v-if="store.activeModal === 'delete'"
      @close="store.closeModal()"
    />

    <FmRenameModal
      v-if="store.activeModal === 'rename'"
      @close="store.closeModal()"
    />

    <FmZipModal
      v-if="store.activeModal === 'zip'"
      @close="store.closeModal()"
    />

    <FmUnzipModal
      v-if="store.activeModal === 'unzip'"
      @close="store.closeModal()"
    />

    <FmClipboardModal
      v-if="store.activeModal === 'clipboard'"
      open
      @close="store.closeModal()"
    />

    <FmStatusModal
      v-if="store.activeModal === 'status'"
      @close="store.closeModal()"
    />

    <FmEditorModal
      v-if="store.activeModal === 'editor'"
      @close="store.closeModal()"
    />

    <FmAudioPlayerModal
      v-if="store.activeModal === 'audioPlayer'"
      :items="audioFiles"
      @close="store.closeModal()"
    />

    <FmVideoPlayerModal
      v-if="store.activeModal === 'videoPlayer' && videoFile"
      :file="videoFile"
      @close="store.closeModal()"
    />
  </div>
</template>

<script lang="ts" setup>
  // Root of the native File Manager, mounted in the card `div.file-manager` (global styles, 700px). Opens the account on mount and on
  // a change of account, and resets the store on unmount. The modals are opened through `store.openModal` (navbar, context menu, info block).
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { audioItems } from '@/views/hosting/file-manager/fm-playlist'
  import FmAudioPlayerModal from '@/views/hosting/file-manager/modals/FmAudioPlayerModal.vue'
  import FmClipboardModal from '@/views/hosting/file-manager/modals/FmClipboardModal.vue'
  import FmDeleteModal from '@/views/hosting/file-manager/modals/FmDeleteModal.vue'
  import FmEditorModal from '@/views/hosting/file-manager/modals/FmEditorModal.vue'
  import FmNewFileModal from '@/views/hosting/file-manager/modals/FmNewFileModal.vue'
  import FmNewFolderModal from '@/views/hosting/file-manager/modals/FmNewFolderModal.vue'
  import FmRenameModal from '@/views/hosting/file-manager/modals/FmRenameModal.vue'
  import FmStatusModal from '@/views/hosting/file-manager/modals/FmStatusModal.vue'
  import FmUnzipModal from '@/views/hosting/file-manager/modals/FmUnzipModal.vue'
  import FmUploadModal from '@/views/hosting/file-manager/modals/FmUploadModal.vue'
  import FmVideoPlayerModal from '@/views/hosting/file-manager/modals/FmVideoPlayerModal.vue'
  import FmZipModal from '@/views/hosting/file-manager/modals/FmZipModal.vue'
  import FmBreadcrumb from './FmBreadcrumb.vue'
  import FmFolderTree from './FmFolderTree.vue'
  import FmInfoBlock from './FmInfoBlock.vue'
  import FmManager from './FmManager.vue'
  import FmNavbar from './FmNavbar.vue'

  const props = defineProps<{
    accountId: number
  }>()

  const { t } = useTranslation()
  const { mdAndUp } = useDisplay()
  const store = useFileManagerStore()

  /** Below `md` the tree is a collapsible panel, closed by default. */
  const treeOpen = ref(false)

  /** The audio player plays the audio files of the selection, in its order. */
  const audioFiles = computed(() => audioItems(store.selectedItems))
  /** The video player shows the first selected item when it is a file. */
  const videoFile = computed(() => {
    const item = store.selectedItems[0]
    return item?.type === 'file' ? item : null
  })

  watch(() => props.accountId, accountId => {
    void store.open(accountId)
  }, { immediate: true })

  // Unmount of the host (e.g. a diagnostic account or another service) empties the store.
  onBeforeUnmount(() => store.reset())
</script>

<style lang="scss" scoped>
.fm-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

// `$…` icon components draw a fixed 24 px svg, so `v-icon size` sets only the box; `fm-icon-fill` makes the glyph follow it.
.fm-root :deep(.fm-icon-fill > svg),
.fm-root :deep(.fm-icon-fill > div),
.fm-root :deep(.fm-icon-fill > div > svg) {
  width: 100%;
  height: 100%;
}

.fm-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.fm-body__row {
  height: 100%;
}

@media (min-width: 768px) {
  .fm-body__tree,
  .fm-body__manager {
    height: 100%;
    overflow: auto;
  }
}

// Below `md` the card grows with its content; in browser fullscreen the card is forced to 100% height, so the body scrolls.
@media (max-width: 767.98px) {
  .fm-root {
    height: auto;
  }

  // Not `:global(...) .fm-root`: the SFC compiler keeps only the `:global()` part of such a selector.
  .file-manager:fullscreen .fm-root {
    height: 100%;
  }

  .file-manager:fullscreen .fm-body {
    overflow: auto;
  }
}

.fm-tree-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 16px;
  font-size: 14px;
  line-height: 20px;
  color: var(--v-text-base);
  border-bottom: 1px solid var(--v-gray-lighten2);
}

.fm-tree-toggle__chevron {
  transition: transform 0.2s;
}

.fm-tree-toggle__chevron--open {
  transform: rotate(180deg);
}

.fm-manager {
  min-height: 100%;
}
</style>
