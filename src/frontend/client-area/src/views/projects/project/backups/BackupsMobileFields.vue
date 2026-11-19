<template>
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
        <template v-if="custom">
          <template v-if="header.value === 'database' ? hasData(item) : hasCode(item)">
            <BackupDataCheck
              v-if="header.value === 'database'"
              :item="item"
            />

            <v-icon
              v-else
              class="ms-4"
              color="primary"
              icon="$checkcircle"
              size="20"
            />
          </template>
        </template>

        <v-icon
          v-else-if="flagged(header)"
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
</template>

<script lang="ts" setup>
  import type { BackupHeader, BackupItem } from './backups-list'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
  import { computed } from 'vue'
  import { EMPTY_DATE, formatTime } from '@/shared/time/date-format'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { hasCode, hasData } from './backup-parts'
  import BackupDataCheck from './BackupDataCheck.vue'
  // Fields of the Backups mobile card (kit DataTable `#mobile`). The card, the checkbox and the
  // action buttons come from the table. The fields are the copy of `BackupsTableResponsiveItem.vue`.

  const props = withDefaults(defineProps<{
    headers?: BackupHeader[]
    item: BackupItem
    /** A custom project: the Code and Data columns read `parts`. */
    custom?: boolean
  }>(), {
    headers: () => [],
    custom: false,
  })

  const emit = defineEmits<{
    'update:sort-by': [header: LegacySortHeader]
  }>()

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
