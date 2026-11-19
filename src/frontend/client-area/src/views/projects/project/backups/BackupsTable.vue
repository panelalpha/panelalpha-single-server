<template>
  <DataTable
    :actions-sort="false"
    :all-selected="allSelected"
    :card-below="1200"
    card-testid="backups-mobile-item"
    :checked-items="checkedItems"
    :class="hasVersion ? 'data-table--has-version' : ''"
    data-testid="backups-table"
    header-when-searching
    :headers="headers"
    :item-slots="['date', 'database', 'directory', 'type', 'note']"
    item-value="id"
    :items="(itemsLoading ? [] : items) as unknown as Record<string, unknown>[]"
    :items-loading="itemsLoading"
    :items-per-page="itemsPerPage"
    :items-total="itemsLength"
    no-results-first
    :page="page"
    :possible-items-per-page="possibleItemsPerPage"
    :search-term="searchTerm"
    :selectable="canBeSelected"
    server
    skeleton="backups"
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    @clear-filters="emit('clear-filters')"
    @update:check-all="emit('select-all', $event)"
    @update:checked-items="emit('update:checked-items', asRow($event))"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <!-- The `no-data` slot: the search that matches nothing is the table's no-results container; the empty list shows its create action here. -->
    <template #no-data>
      <ErrorCard
        v-if="loadError !== null"
        data-testid="backups-load-error"
        :message="loadError"
        retryable
        @retry="emit('retry')"
      />

      <!-- The empty block of the kit `EmptyState` (`table`), with the create action in its slot. -->
      <EmptyState
        v-else
        data-testid="backups-empty"
        :desc="t('message.emptyTable.backups.description')"
        :title="t('message.emptyTable.backups.title')"
        title-tag="h4"
      >
        <template #image>
          <backups-table-illustration />
        </template>

        <template #action>
          <PageAddButton
            data-testid="backups-empty-add"
            :disabled="createDisabled"
            :label="t('button.createBackup')"
            @click="emit('add-new')"
          />
        </template>
      </EmptyState>
    </template>

    <template #item.date="{ item }">
      <span class="font-weight-bold">{{ dateCell(item).date }}</span>{{ dateCell(item).timeAfter }}
    </template>

    <template #item.database="{ item }">
      <template v-if="custom">
        <BackupDataCheck
          v-if="hasData(asRow(item))"
          :item="asRow(item)"
        />
      </template>

      <v-icon
        v-else-if="asRow(item).database"
        class="ms-4"
        color="primary"
        icon="$checkcircle"
        size="20"
      />
    </template>

    <template #item.directory="{ item }">
      <v-icon
        v-if="custom ? hasCode(asRow(item)) : asRow(item).directory"
        class="ms-4"
        color="primary"
        icon="$checkcircle"
        size="20"
      />
    </template>

    <template #item.type="{ item }">
      <StatusLabel
        :status="typeStatus(asRow(item).type)"
        :value="asRow(item).type"
      />
    </template>

    <template #item.note="{ item }">
      <div class="item-notes">
        <span class="p-4 font-weight-light">{{ asRow(item).note }}</span>
      </div>
    </template>

    <!-- While an action runs or after it failed, the row shows its status in place of the buttons. -->
    <template #actions="{ row }">
      <template v-if="!asyncView(row)">
        <AppButton
          v-if="asRow(row).mode === 'incremental'"
          :aria-label="t('button.backup.convertToFull')"
          kind="row-action"
          :tooltip="t('button.backup.convertToFull')"
          @click="emit('action-button-convert-to-full', asRow(row))"
        >
          <v-icon icon="$merge" />
        </AppButton>

        <AppButton
          :aria-label="t('button.backup.download')"
          kind="row-action"
          :tooltip="t('button.backup.download')"
          @click="emit('action-button-download', asRow(row))"
        >
          <v-icon icon="$update" />
        </AppButton>

        <AppButton
          :aria-label="t('button.restoreBackup')"
          kind="row-action"
          :tooltip="t('button.restoreBackup')"
          @click="emit('action-button-restore', asRow(row))"
        >
          <v-icon icon="$restore" />
        </AppButton>

        <!-- On a server with its own backup system only manual backups can be deleted here. -->
        <AppButton
          v-if="!(usesOwnBackupSystem && asRow(row).type !== 'Manual')"
          :aria-label="t('button.deleteBackup')"
          kind="row-action"
          :tooltip="t('button.deleteBackup')"
          @click="emit('action-button-delete', asRow(row))"
        >
          <v-icon icon="$thrash" />
        </AppButton>
      </template>

      <template v-else>
        <div class="d-flex align-center">
          <loader
            v-if="!asyncView(row)?.failed"
            class="mr-2"
            color="primary"
            no-margins
            :size="16"
          />

          <v-icon
            v-else
            class="mr-1"
            color="error"
            icon="$alerterror"
            size="20"
          />

          <b class="nowrap">
            {{ t(asyncView(row)?.key ?? '') }}

            <span
              v-if="asyncView(row)?.failed"
              class="try-again"
              @click="emit('action-button-repeat', asRow(row))"
            >
              {{ t('button.try') }}
            </span>
          </b>
        </div>
      </template>
    </template>

    <template #mobile="{ item }">
      <backups-mobile-fields
        :custom="custom"
        :headers="headers"
        :item="asRow(item)"
        @update:sort-by="emit('update:sort-by', $event)"
      />
    </template>

    <template #mobile-actions="{ row }">
      <AppButton
        :aria-label="t('button.backup.download')"
        data-testid="backups-mobile-download"
        kind="row-action"
        @click="emit('action-button-download', asRow(row))"
      >
        <v-icon icon="$update" />
      </AppButton>

      <AppButton
        :aria-label="t('button.restoreBackup')"
        data-testid="backups-mobile-restore"
        kind="row-action"
        @click="emit('action-button-restore', asRow(row))"
      >
        <v-icon icon="$restore" />
      </AppButton>

      <AppButton
        :aria-label="t('button.deleteBackup')"
        data-testid="backups-mobile-delete"
        kind="row-action"
        @click="emit('action-button-delete', asRow(row))"
      >
        <v-icon icon="$thrash" />
      </AppButton>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { BackupHeader, BackupItem } from './backups-list'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { EMPTY_DATE, formatTime } from '@/shared/time/date-format'
  import { useDateFormat } from '@/shared/time/use-date-format'
  // The desktop row cells, the empty block and the mobile card, and the sort header (now in the table).
  // The table frame, the header, the skeleton and the footer are the kit `DataTable`. The selection
  // is the view's (`use-backup-selection.ts`): the table shows the checkboxes and the header box, and emits the row or the page toggle. The
  // page is sliced and sorted by the view, so this table shows the rows it is given.
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import BackupsTableIllustration from '@/shared/ui/illustrations/BackupsTableIllustration.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { hasCode, hasData } from './backup-parts'
  import BackupDataCheck from './BackupDataCheck.vue'
  import { asyncMessageKey, asyncState } from './backups-list'
  import BackupsMobileFields from './BackupsMobileFields.vue'

  const props = withDefaults(defineProps<{
    headers?: BackupHeader[]
    items?: BackupItem[]
    itemsLoading?: boolean
    itemsLength?: number
    itemsPerPage?: number | string
    page?: number
    possibleItemsPerPage?: Array<Array<number | string>>
    searchTerm?: string
    sortBy?: LegacySortHeader | false
    sortDesc?: boolean
    usesOwnBackupSystem?: boolean
    /** Message of the last failed list request; null when the last load worked (a failure is not an empty list). */
    loadError?: string | null
    /** The empty-state create button is off (no backup store, or the manual limit is reached). */
    createDisabled?: boolean
    checkedItems?: number[]
    allSelected?: boolean
    canBeSelected?: boolean
    /** A custom project: the Code and Data columns read `parts`. */
    custom?: boolean
  }>(), {
    headers: () => [],
    items: () => [],
    itemsLoading: false,
    itemsLength: 0,
    itemsPerPage: 8,
    page: 1,
    possibleItemsPerPage: () => [[8, 16, 24]],
    searchTerm: '',
    sortBy: false,
    sortDesc: true,
    usesOwnBackupSystem: false,
    loadError: null,
    createDisabled: false,
    checkedItems: () => [],
    allSelected: false,
    canBeSelected: true,
    custom: false,
  })

  const emit = defineEmits<{
    'add-new': []
    'retry': []
    'clear-filters': []
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:checked-items': [item: BackupItem]
    'select-all': [checked: boolean]
    'action-button-download': [item: BackupItem]
    'action-button-convert-to-full': [item: BackupItem]
    'action-button-repeat': [item: BackupItem]
    'action-button-restore': [item: BackupItem]
    'action-button-delete': [item: BackupItem]
  }>()

  const { t } = useTranslation()
  const formatDate = useDateFormat()

  const hasVersion = computed(() => props.headers.some(header => header.value === 'version'))

  // The table passes the raw row (no `raw` wrapper), typed loosely by Vuetify.
  function asRow (item: unknown): BackupItem {
    return item as BackupItem
  }

  // The status line of a row whose action is in progress or failed: the message key, and whether the action failed (the `try` link).
  // `null` for a row without a blocking action, which shows its buttons.
  function asyncView (item: unknown): { key: string, failed: boolean } | null {
    const state = asyncState(asRow(item))
    if (!state) {
      return null
    }
    return { key: asyncMessageKey(state), failed: state.status === 'failed' }
  }

  // The date in the configured format, then `HH:mm`. An empty or
  // unparsable date shows only the dash. `timeAfter` carries the separating space, since the template would drop it.
  function dateCell (item: unknown): { date: string, timeAfter: string } {
    const row = asRow(item)
    const date = formatDate(row.date)
    return { date, timeAfter: date === EMPTY_DATE ? '' : ` ${formatTime(row.date)}` }
  }

  // Desktop: Automatic is success, Manual purple.
  function typeStatus (type: string): StatusLabelStatus | undefined {
    if (type === 'Automatic') {
      return 'success'
    }
    if (type === 'Manual') {
      return 'purple'
    }
    return undefined
  }
</script>

<style
  lang="scss"
  scoped
  src="./BackupsTable.scss"
/>
