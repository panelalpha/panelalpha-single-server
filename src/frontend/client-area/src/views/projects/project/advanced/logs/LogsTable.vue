<template>
  <!-- On the kit `DataTable`. The columns and cells are local (one consumer).
       Desktop rows from 1400 px (literal, as legacy); below that the card. -->
  <DataTable
    :card-below="1400"
    :default-items-per-page="LOGS_PAGE_SIZE"
    :headers="headers"
    :item-slots="['user', 'action', 'date']"
    :items="(items as unknown as Record<string, unknown>[])"
    :items-loading="itemsLoading"
    :items-per-page="itemsPerPage"
    :items-total="itemsTotal"
    no-results-first
    :page="shownPage"
    :per-page-label="t('table.footer.log')"
    :possible-items-per-page="possibleItemsPerPage"
    :search-term="searchTerm"
    server
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    @clear-filters="emit('clear-filters')"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <!-- No log entries yet (a search with no match is the kit no-results, not this). Same empty state as Git logs and Reseller Logs. -->
    <template #no-data>
      <EmptyState
        data-testid="instance-logs-empty"
        :desc="t('message.emptyTable.instanceLogs.description', { defaultValue: 'Actions taken in this project will be listed here.' })"
        :title="t('message.emptyTable.instanceLogs.title', { defaultValue: 'No logs yet' })"
      >
        <template #image>
          <NoDataTableLogs />
        </template>
      </EmptyState>
    </template>

    <template #item.user="{ item }">
      <user-item :user="asLog(item).user" />
    </template>

    <template #item.action="{ item }">
      <log-item :action="asLog(item)" />
    </template>

    <template #item.date="{ item }">
      <div class="text-right">
        <v-tooltip
          close-delay="150"
          location="bottom"
          open-delay="150"
        >
          <template #activator="{ props: activatorProps }">
            <span
              v-bind="activatorProps"
              class="mb-0 text-right text--gray-darken1"
            >
              {{ relativeDate(asLog(item).date) }}
            </span>
          </template>

          <span>{{ absoluteDate(asLog(item).date) }}</span>
        </v-tooltip>
      </div>
    </template>

    <template #mobile="{ item }">
      <MobileTableField>
        <div class="d-flex align-center justify-space-between">
          <user-item :user="asLog(item).user" />

          <v-tooltip
            class="ml-auto"
            close-delay="150"
            location="bottom"
            open-delay="150"
          >
            <template #activator="{ props: activatorProps }">
              <span
                v-bind="activatorProps"
                class="mb-0 text-right text--gray-darken1"
              >
                {{ relativeDate(asLog(item).date) }}
              </span>
            </template>

            <span>{{ absoluteDate(asLog(item).date) }}</span>
          </v-tooltip>
        </div>
      </MobileTableField>

      <MobileTableField>
        <log-item :action="asLog(item)" />
      </MobileTableField>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  // The markup follows
  // `connect-ai/McpActivityLog.vue`. The table holds no search term of its own: a search with no rows emits `clear-filters` and the view resets the page state.
  import type { InstanceLogRow } from '@/entities/project/instance-logs.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import LogItem from '@/entities/project/ui/logs/LogItem.vue'
  import UserItem from '@/entities/project/ui/logs/UserItem.vue'
  import { fromNow } from '@/shared/time/from-now'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataTableLogs from '@/shared/ui/illustrations/NoDataTableLogs.vue'
  import { LOGS_PAGE_SIZE } from './logs-table'

  const props = defineProps<{
    items: InstanceLogRow[]
    itemsLoading: boolean
    itemsPerPage: number | string
    itemsTotal: number
    page: number
    possibleItemsPerPage: Array<Array<number | string>>
    searchTerm: string
    sortBy: LegacySortHeader | false
    sortDesc: boolean
    headers: LegacySortHeader[]
  }>()

  const emit = defineEmits<{
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'clear-filters': []
  }>()

  const { t } = useTranslation()

  // V4 server paging moves `page` back to the last page when `items-length` is smaller (and emits it, which would reload the view). Legacy did not;
  // the table shows the page it was given, so it never asks V4 to clamp it (a view on page 2 of an empty log keeps page 2).
  const shownPage = computed(() => Math.min(props.page, Math.max(1, Math.ceil(props.itemsTotal / Number(props.itemsPerPage)))))
  const formatDate = useDateFormat()

  function asLog (item: unknown): InstanceLogRow {
    return item as InstanceLogRow
  }

  // Legacy `moment(date).fromNow()` and the `YYYY-MM-DD HH:mm` tooltip (here the configured date format with time).
  function relativeDate (date: string | number): string {
    return fromNow(new Date(date))
  }

  function absoluteDate (date: string | number): string {
    return formatDate(date, { time: true })
  }
</script>
