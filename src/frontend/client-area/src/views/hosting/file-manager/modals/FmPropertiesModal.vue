<template>
  <app-dialog
    :model-value="item !== null"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="emit('close')"
  >
    <basic-modal
      v-if="item"
      custom-class="fm-properties"
      data-testid="fm-properties"
      :title="t('heading.hosting.fileManager.properties.title')"
      @modal-close="emit('close')"
    >
      <template #custom>
        <dl class="fm-properties__rows">
          <div
            v-for="row in rows"
            :key="row.key"
            class="fm-properties__row"
            :data-testid="`fm-properties-${row.key}`"
          >
            <dt class="fm-properties__label">
              {{ t(row.label) }}
            </dt>

            <dd class="fm-properties__value">
              {{ row.value }}
            </dd>

            <CopyTextButton :text="row.value" />
          </div>
        </dl>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // Without the disk, URL and access rows of legacy.
  // The size and the date are formatted as in legacy. Copy goes through the kit button (not execCommand).
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { formatBytes } from '@/shared/format/format-bytes'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const props = defineProps<{
    item: FmDirectory | FmFile | null
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const formatDate = useDateFormat()

  interface PropertiesRow {
    key: string
    label: string
    value: string
  }

  const rows = computed<PropertiesRow[]>(() => {
    const entry = props.item
    if (entry === null) {
      return []
    }
    const list: PropertiesRow[] = [
      { key: 'name', label: 'table.header.name', value: entry.basename },
      { key: 'path', label: 'message.fileManager.properties.path', value: entry.path },
    ]
    if (entry.type === 'file') {
      list.push({ key: 'size', label: 'table.header.size', value: formatBytes(entry.size) })
    }
    list.push({ key: 'modified', label: 'message.fileManager.properties.modified', value: formatDate(entry.timestamp * 1000, { time: true }) })
    return list
  })
</script>

<style lang="scss" scoped>
.fm-properties {
  width: 560px;
  max-width: 100%;
}

.fm-properties__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 0.3rem 0;
}

.fm-properties__label {
  flex: 0 0 90px;
  font-weight: 700;
}

.fm-properties__label::after {
  content: ':';
}

.fm-properties__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
