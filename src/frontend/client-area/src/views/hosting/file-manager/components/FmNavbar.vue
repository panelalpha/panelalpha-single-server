<template>
  <div
    ref="root"
    class="fm-navbar"
    data-testid="fm-navbar"
  >
    <div class="fm-navbar__group">
      <template
        v-for="(group, index) in leftGroups"
        :key="index"
      >
        <span
          v-if="index > 0"
          class="fm-navbar__divider"
        />

        <AppButton
          v-for="item in group"
          :key="item.key"
          :aria-label="t(item.label, { defaultValue: item.defaultValue })"
          :disabled="item.disabled"
          kind="toolbar"
          :tooltip="t(item.label, { defaultValue: item.defaultValue })"
          @click="item.run"
        >
          <v-icon :icon="item.icon" />
        </AppButton>
      </template>
    </div>

    <div class="fm-navbar__group">
      <DataIteratorSearch
        :aria-label="t('form.placeholder.search')"
        class="fm-navbar__search"
        data-testid="fm-search"
        :model-value="store.searchTerm"
        :reset-key="store.path"
        @update:model-value="store.setSearchTerm"
      />

      <span class="fm-navbar__divider" />

      <ListGridSwitch
        v-model:list-style="listStyle"
        class="fm-navbar__switch"
        :grid-label="t('button.fileManager.grid')"
        :list-label="t('button.fileManager.table')"
      />

      <span class="fm-navbar__divider" />

      <AppButton
        :active="store.showHidden"
        :aria-label="t('button.fileManager.hiddenFiles')"
        kind="toolbar"
        :tooltip="t('button.fileManager.hiddenFiles')"
        @click="store.toggleHidden()"
      >
        <v-icon :icon="store.showHidden ? '$eye' : '$eyeclosed'" />
      </AppButton>

      <AppButton
        :active="fullScreen"
        :aria-label="t('button.fileManager.fullScreen')"
        kind="toolbar"
        :tooltip="t('button.fileManager.fullScreen')"
        @click="toggleFullScreen"
      >
        <v-icon icon="$fullscreen" />
      </AppButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The buttons open their modals through the store (the screen mounts them, see FileManager.vue).
  // Copy and cut show a notice (only the navbar shows it, not the context menu).
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { parentPath, ROOT_PATH } from '@/views/hosting/file-manager/fm-path'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ListGridSwitch from '@/shared/ui/buttons/ListGridSwitch.vue'
  import DataIteratorSearch from '@/shared/ui/data-iterator/DataIteratorSearch.vue'

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const root = ref<HTMLElement | null>(null)
  const fullScreen = ref(false)

  const hasSelection = computed(() => store.selection.directories.length + store.selection.files.length > 0)

  const CLIPBOARD_NOTICE = {
    copy: 'message.fileManager.notification.copyToClipboard',
    cut: 'message.fileManager.notification.cutToClipboard',
  } as const

  /** Copy or cut the selection, then the notice. An empty selection does nothing. */
  function toClipboard (type: 'copy' | 'cut'): void {
    if (!hasSelection.value) {
      return
    }
    store.setClipboard(type)
    useAlertsStore().addAlert({ success: true, successMessage: t(CLIPBOARD_NOTICE[type]) })
  }

  /** The folder above, recorded in the history like a folder opened by a double click. */
  function levelUp (): void {
    void store.goTo(parentPath(store.path))
  }

  interface NavbarItem {
    key: string
    label: string
    defaultValue?: string
    icon: string
    disabled?: boolean
    run?: () => void
  }

  const navigation = computed<NavbarItem[]>(() => [
    { key: 'back', label: 'button.back', icon: '$arrowleft', disabled: store.historyPointer === 0, run: () => void store.back() },
    {
      key: 'forward',
      label: 'button.fileManager.forward',
      icon: '$arrowright',
      disabled: store.historyPointer >= store.history.length - 1,
      run: () => void store.forward(),
    },
    {
      key: 'up',
      label: 'button.fileManager.up',
      defaultValue: 'Up',
      icon: '$arrowup',
      disabled: store.path === ROOT_PATH,
      run: levelUp,
    },
    { key: 'refresh', label: 'button.fileManager.refresh', icon: '$restore', run: () => void store.refresh() },
  ])

  const creation = computed<NavbarItem[]>(() => [
    { key: 'newFile', label: 'button.fileManager.newFile', icon: '$fileLine', run: () => store.openModal('newFile') },
    { key: 'newFolder', label: 'button.fileManager.newFolder', icon: '$folderPlus', run: () => store.openModal('newFolder') },
    { key: 'upload', label: 'button.fileManager.upload', icon: '$uploadLine', run: () => store.openModal('upload') },
  ])

  const selectionActions = computed<NavbarItem[]>(() => [
    {
      key: 'delete',
      label: 'button.delete',
      icon: '$trashLine',
      disabled: !hasSelection.value,
      run: () => store.openModal('delete'),
    },
    { key: 'copy', label: 'button.copy', icon: '$copy', disabled: !hasSelection.value, run: () => toClipboard('copy') },
    { key: 'cut', label: 'button.fileManager.cut', icon: '$cut', disabled: !hasSelection.value, run: () => toClipboard('cut') },
    {
      key: 'paste',
      label: 'button.fileManager.paste',
      icon: '$paste',
      disabled: store.clipboard === null,
      run: () => void store.paste(),
    },
  ])

  // Groups of the left side, separated by a divider: history, creating, selection and clipboard.
  const leftGroups = computed<NavbarItem[][]>(() => [navigation.value, creation.value, selectionActions.value])

  // `ListGridSwitch` model: 0 is the grid, 1 is the list (the table).
  const listStyle = computed<number>({
    get: () => (store.view === 'grid' ? 0 : 1),
    set: value => store.setView(value === 0 ? 'grid' : 'table'),
  })

  /** The fullscreen element is the card of the File Manager (`.file-manager`), as legacy used the `.fm` root. */
  function card (): HTMLElement | null {
    return root.value?.closest<HTMLElement>('.file-manager') ?? null
  }

  function toggleFullScreen (): void {
    const element = card()
    if (!element) {
      return
    }
    if (document.fullscreenElement === element) {
      void document.exitFullscreen()
    } else {
      void element.requestFullscreen()
    }
  }

  function syncFullScreen (): void {
    fullScreen.value = document.fullscreenElement !== null && document.fullscreenElement === card()
  }

  onMounted(() => document.addEventListener('fullscreenchange', syncFullScreen))
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', syncFullScreen))
</script>

<style lang="scss" scoped>
.fm-navbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 12px;
  flex: 0 0 auto;
}

.fm-navbar__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.fm-navbar__divider {
  width: 1px;
  height: 24px;
  margin: 0 8px;
  background-color: var(--v-gray-lighten2);
}

.fm-navbar__search {
  width: 220px;
  max-width: 100%;
}

// Below `md` the search takes its own row under the buttons.
@media (max-width: 767.98px) {
  // The buttons wrap into rows, so a divider could be left alone at the start of a row.
  .fm-navbar__divider {
    display: none;
  }

  .fm-navbar__group:last-child {
    flex: 1 0 100%;
  }

  .fm-navbar__search {
    order: 10;
    flex: 1 0 100%;
    width: 100%;
  }
}

// The switch has its own left margin; in the toolbar the gap of the group is enough.
.fm-navbar__switch {
  display: flex;
  align-items: center;
  gap: 4px;

  :deep(.v-btn) {
    margin-left: 0;
  }
}
</style>
