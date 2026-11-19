<template>
  <div
    class="fm-info"
    data-testid="fm-info"
  >
    <span class="fm-info__count">
      <template v-if="selectedCount > 0">
        {{ t('message.fileManager.info.selected') }}
        <span class="fm-info__value">{{ selectedCount }}</span>
        {{ t('message.fileManager.info.filesSize') }}
        <span class="fm-info__value">{{ formatBytes(selectedSize) }}</span>
      </template>

      <template v-else>
        {{ t('message.fileManager.info.folders') }}
        <span class="fm-info__value">{{ store.visibleDirectories.length }}</span>
        {{ t('message.fileManager.info.files') }}
        <span class="fm-info__value">{{ store.visibleFiles.length }}</span>
        {{ t('message.fileManager.info.filesSize') }}
        <span class="fm-info__value">{{ formatBytes(totalSize) }}</span>
      </template>
    </span>

    <span class="fm-info__icons">
      <v-progress-circular
        v-if="store.loading > 0"
        color="primary"
        data-testid="fm-info-loading"
        indeterminate
        size="16"
        width="2"
      />

      <AppButton
        v-if="store.clipboard !== null"
        :aria-label="t('heading.hosting.fileManager.clipboard.title')"
        data-testid="fm-info-clipboard"
        kind="toolbar"
        :tooltip="t('heading.hosting.fileManager.clipboard.title')"
        @click="emit('open-clipboard')"
      >
        <v-icon icon="$clipboard" />
      </AppButton>

      <AppButton
        :aria-label="t('heading.hosting.fileManager.status.title')"
        :color="store.errors.length > 0 ? 'error' : 'success'"
        data-testid="fm-info-status"
        kind="toolbar"
        :tooltip="t('heading.hosting.fileManager.status.title')"
        @click="emit('open-status')"
      >
        <v-icon icon="$infoCircle" />
      </AppButton>
    </span>
  </div>
</template>

<script lang="ts" setup>
  // The progress bar of the upload (commented out in legacy) is not ported.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { formatBytes } from '@/shared/format/format-bytes'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const emit = defineEmits<{
    'open-clipboard': []
    'open-status': []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const totalSize = computed(() => store.visibleFiles.reduce((sum, file) => sum + file.size, 0))

  const selectedCount = computed(() => store.selection.directories.length + store.selection.files.length)

  const selectedSize = computed(() => {
    const selected = new Set(store.selection.files)
    return store.visibleFiles.filter(file => selected.has(file.path)).reduce((sum, file) => sum + file.size, 0)
  })
</script>

<style lang="scss" scoped>
.fm-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 0 0 auto;
  padding: 8px 12px;
  border-top: 1px solid var(--v-gray-lighten2);
  font-size: 13px;
  color: var(--v-gray-darken1);
}

.fm-info__count {
  color: var(--v-gray-darken1);
}

.fm-info__value {
  color: var(--v-text-darken2);
  margin-left: 4px;
  margin-right: 8px;
}

.fm-info__icons {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
