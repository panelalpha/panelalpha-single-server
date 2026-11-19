<template>
  <MobileTableCard card-testid="backups-mobile-item">
    <template #select>
      <checkbox
        :model-value="checked"
        @update:model-value="emit('update:checked')"
      />
    </template>

    <div class="mobile-table-item__group">
      <MobileTableField
        v-for="header in displayHeaders"
        :key="header.value"
        :label="header.title"
        @sort="handleSort(header)"
      >
        <template v-if="header.value === 'date'">
          <div class="p-3">
            <span class="font-weight-bold">{{ dateCell().date }}</span>{{ dateCell().timeAfter }}
          </div>
        </template>

        <template v-else-if="header.value === 'type'">
          <StatusLabel
            :status="typeStatus(item.type)"
            :value="item.type"
          />
        </template>

        <template v-else-if="header.value === 'database' || header.value === 'directory'">
          <v-icon
            v-if="flagged(header)"
            class="ms-4"
            color="primary"
            icon="$checkcircle"
            size="20"
          />
        </template>

        <template v-else>
          <span class="p-3">{{ formatValue(cellValue(header)) }}</span>
        </template>
      </MobileTableField>
    </div>

    <div class="mobile-table-item__group">
      <div class="mobile-table-item__actions">
        <AppButton
          :aria-label="t('button.backup.download')"
          data-testid="backups-mobile-download"
          kind="row-action"
          @click="emit('action-button-download', item)"
        >
          <v-icon
            icon="$update"
            size="24"
          />
        </AppButton>

        <AppButton
          :aria-label="t('button.restoreBackup')"
          data-testid="backups-mobile-restore"
          kind="row-action"
          @click="emit('action-button-restore', item)"
        >
          <v-icon
            icon="$restore"
            size="24"
          />
        </AppButton>

        <AppButton
          :aria-label="t('button.deleteBackup')"
          data-testid="backups-mobile-delete"
          kind="row-action"
          @click="emit('action-button-delete', item)"
        >
          <v-icon
            icon="$thrash"
            size="24"
          />
        </AppButton>
      </div>
    </div>
  </MobileTableCard>
</template>

<script lang="ts" setup>
  import type { BackupHeader, BackupItem } from './backups-list'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { EMPTY_DATE, formatTime } from '@/shared/time/date-format'
  import { useDateFormat } from '@/shared/time/use-date-format'
  // The row shown below 1200 px; header click emits `update:sortBy` only. Only download, restore and delete, no async states.
  // The selection checkbox is the first block of the card (`checked` / `update:checked`). The date uses the session format
  // (`useDateFormat`), as the desktop row does.
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import MobileTableCard from '@/shared/ui/data-table/MobileTableCard.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  const props = withDefaults(defineProps<{
    headers?: BackupHeader[]
    item: BackupItem
    checked?: boolean
  }>(), {
    headers: () => [],
    checked: false,
  })

  const emit = defineEmits<{
    'update:checked': []
    'update:sort-by': [header: LegacySortHeader]
    'action-button-download': [item: BackupItem]
    'action-button-restore': [item: BackupItem]
    'action-button-delete': [item: BackupItem]
  }>()

  const { t } = useTranslation()
  const formatDate = useDateFormat()

  // The checkbox and the actions column are not rows of the mobile item.
  const displayHeaders = computed(() => props.headers.filter(header => header.value !== 'select' && header.value !== 'actions'))

  // The date in bold, then `HH:mm`; the dash alone for an empty date.
  function dateCell (): { date: string, timeAfter: string } {
    const date = formatDate(props.item.date)
    return { date, timeAfter: date === EMPTY_DATE ? '' : ` ${formatTime(props.item.date)}` }
  }

  // Automatic is primary on mobile, Manual purple (desktop uses success for Automatic).
  function typeStatus (type: string): StatusLabelStatus | undefined {
    if (type === 'Automatic') {
      return 'primary'
    }
    if (type === 'Manual') {
      return 'purple'
    }
    return undefined
  }

  // Only a sortable header emits.
  function handleSort (header: BackupHeader): void {
    if (header.sortable) {
      emit('update:sort-by', header)
    }
  }

  function flagged (header: BackupHeader): boolean {
    return header.value === 'database' ? Boolean(props.item.database) : Boolean(props.item.directory)
  }

  function cellValue (header: BackupHeader): string | null | undefined {
    if (header.value === 'size') {
      return props.item.size
    }
    if (header.value === 'note') {
      return props.item.note
    }
    if (header.value === 'version') {
      return props.item.version
    }
    return undefined
  }

  // An empty value shows `---`.
  function formatValue (value: string | null | undefined): string {
    if (!value) {
      return '---'
    }
    return value
  }
</script>

<style lang="scss" scoped>
// Scoped rules are unlayered, so they beat the Vuetify table rules (`@layer vuetify-components`) without `!important`.
:deep(td),
tr {
  width: 100%;
  min-width: 100%;
  max-width: 100%;
}

// The V2 checkbox keeps its (empty) label slot, which makes the control ~6px wider than the 22px box plus its 8px margin.
.checkbox :deep(.v-input) {
  min-width: 38px;
}

// V2 icon buttons are 14px; V4 `size="small"` sets 12px.
.mobile-table-item__actions .v-btn {
  font-size: 14px;
}

// The legacy card measures a 10px right margin on each action button (the V2 `.v-btn` rules), so the three icons sit 45px apart.
.mobile-table-item .mobile-table-item__actions .v-btn {
  margin-right: 10px;
}
</style>
