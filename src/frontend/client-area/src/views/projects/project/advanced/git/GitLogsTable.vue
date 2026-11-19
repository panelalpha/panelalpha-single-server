<template>
  <!-- On the kit `DataTable`: the table is the card, its
       title sits in the `top` slot. Server paging: `items` is the current page, `total` the count. -->
  <DataTable
    :card-below="1400"
    :headers="HEADERS"
    :item-slots="['action', 'commit', 'status', 'date']"
    :items="(items as unknown as Record<string, unknown>[])"
    :items-loading="loading"
    :items-per-page="perPage"
    :items-total="total"
    :page="page"
    :per-page-label="t('table.footer.log')"
    :possible-items-per-page="POSSIBLE_PER_PAGE"
    server
    :sort-by="false"
    @update:items-per-page="onPerPageChange"
    @update:page="emit('update:page', $event)"
  >
    <template #top>
      <slot name="top" />
    </template>

    <template #no-data>
      <EmptyState
        class="git-logs-empty"
        :desc="t('message.emptyTable.gitLogs.description')"
        :title="t('message.emptyTable.gitLogs.title')"
      >
        <template #image>
          <NoDataTableLogs />
        </template>
      </EmptyState>
    </template>

    <template #item.action="{ item }">
      <div class="d-flex flex-column">
        <div class="text--gray-darken2 font-weight-medium">
          {{ logActionLabel(asLog(item).action, t, exists) }}
        </div>

        <div
          v-if="logBranchChange(asLog(item))"
          class="caption text--gray-darken1 branch-change"
        >
          {{ logBranchChange(asLog(item)) }}
        </div>
      </div>
    </template>

    <template #item.commit="{ item }">
      <v-tooltip
        v-if="logCommitSummary(asLog(item))"
        close-delay="150"
        location="bottom"
        open-delay="150"
      >
        <template #activator="{ props: activatorProps }">
          <div
            class="caption text--gray-darken1 text-truncate commit-cell"
            v-bind="activatorProps"
          >
            <span
              v-if="asLog(item).commit_hash"
              class="font-weight-medium"
            >{{ shortHash(asLog(item).commit_hash) }}</span>

            <span
              v-if="asLog(item).commit_message"
              :class="asLog(item).commit_hash ? 'ml-2' : ''"
            >
              {{ asLog(item).commit_message }}
            </span>
          </div>
        </template>

        <span>{{ logCommitSummary(asLog(item)) }}</span>
      </v-tooltip>
    </template>

    <template #item.status="{ item }">
      <v-tooltip
        v-if="hasErrorTooltip(asLog(item))"
        close-delay="150"
        location="bottom"
        open-delay="150"
      >
        <template #activator="{ props: activatorProps }">
          <StatusLabel
            v-bind="activatorProps"
            class="cursor-pointer"
            :status="logStatusColor(asLog(item).status)"
            :value="logStatusLabel(asLog(item).status, t, exists)"
          />
        </template>

        <span>{{ logErrorTooltip(asLog(item)) }}</span>
      </v-tooltip>

      <StatusLabel
        v-else
        :status="logStatusColor(asLog(item).status)"
        :value="logStatusLabel(asLog(item).status, t, exists)"
      />
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
              class="mb-0 text--gray-darken1 text-right d-block"
              v-bind="activatorProps"
            >
              {{ fromNow(asLog(item).created_at) }}
            </span>
          </template>

          <span>{{ formatDate(asLog(item).created_at, { time: true }) }}</span>
        </v-tooltip>
      </div>
    </template>

    <template #mobile="{ item }">
      <MobileTableField
        :label="t('table.header.action')"
      >
        <div class="d-flex flex-column">
          <div class="text--gray-darken2 font-weight-medium">
            {{ logActionLabel(asLog(item).action, t, exists) }}
          </div>

          <div
            v-if="logBranchChange(asLog(item))"
            class="caption text--gray-darken1 branch-change"
          >
            {{ logBranchChange(asLog(item)) }}
          </div>
        </div>
      </MobileTableField>

      <MobileTableField
        :label="t('table.header.commit')"
      >
        <div class="d-flex flex-column">
          <v-tooltip
            v-if="logCommitSummary(asLog(item))"
            close-delay="150"
            location="bottom"
            open-delay="150"
          >
            <template #activator="{ props: activatorProps }">
              <div
                class="caption text--gray-darken1 text-truncate commit-cell"
                v-bind="activatorProps"
              >
                <span
                  v-if="asLog(item).commit_hash"
                  class="font-weight-medium"
                >{{ shortHash(asLog(item).commit_hash) }}</span>

                <span
                  v-if="asLog(item).commit_message"
                  :class="asLog(item).commit_hash ? 'ml-2' : ''"
                >
                  {{ asLog(item).commit_message }}
                </span>
              </div>
            </template>

            <span>{{ logCommitSummary(asLog(item)) }}</span>
          </v-tooltip>
        </div>
      </MobileTableField>

      <MobileTableField
        :label="t('table.header.status')"
      >
        <v-tooltip
          v-if="hasErrorTooltip(asLog(item))"
          close-delay="150"
          location="bottom"
          open-delay="150"
        >
          <template #activator="{ props: activatorProps }">
            <StatusLabel
              v-bind="activatorProps"
              class="cursor-pointer"
              :status="logStatusColor(asLog(item).status)"
              :value="logStatusLabel(asLog(item).status, t, exists)"
            />
          </template>

          <span>{{ logErrorTooltip(asLog(item)) }}</span>
        </v-tooltip>

        <StatusLabel
          v-else
          :status="logStatusColor(asLog(item).status)"
          :value="logStatusLabel(asLog(item).status, t, exists)"
        />
      </MobileTableField>

      <MobileTableField
        :label="t('table.header.date')"
      >
        <v-tooltip
          close-delay="150"
          location="bottom"
          open-delay="150"
        >
          <template #activator="{ props: activatorProps }">
            <span
              class="mb-0 text--gray-darken1"
              v-bind="activatorProps"
            >
              {{ fromNow(asLog(item).created_at) }}
            </span>
          </template>

          <span>{{ formatDate(asLog(item).created_at, { time: true }) }}</span>
        </v-tooltip>
      </MobileTableField>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { GitLog } from './git-status'
  // Labels and the error tooltip come from `git-status.ts`.
  import type { DataTableHeader } from '@/shared/ui/data-table/data-table'
  import type { Translate } from '@/shared/ui/modal/action-modal'
  import i18next from 'i18next'
  import { useTranslation } from 'i18next-vue'
  import { fromNow } from '@/shared/time/from-now'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataTableLogs from '@/shared/ui/illustrations/NoDataTableLogs.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import {
    hasErrorTooltip,
    logActionLabel,
    logBranchChange,
    logCommitSummary,
    logErrorTooltip,
    logStatusColor,
    logStatusLabel,
    shortHash,
  } from './git-status'

  withDefaults(defineProps<{
    items: GitLog[]
    total: number
    page: number
    perPage: number
    loading?: boolean
  }>(), {
    loading: false,
  })

  const emit = defineEmits<{
    'update:page': [value: number]
    'update:per-page': [value: number]
  }>()

  const { t: translateKey } = useTranslation()
  const t: Translate = (key, options) => String(translateKey(key, options as never))
  const exists = (key: string): boolean => i18next.exists(key)
  const formatDate = useDateFormat()

  const POSSIBLE_PER_PAGE: number[][] = [[5, 15, 50, 100]]

  // The date column is the only right-aligned one. The sort row is `TableCustomSort`,
  // so the headers only feed the column alignment and the mobile card.
  const HEADERS: DataTableHeader[] = [
    { text: 'action', value: 'action', sortable: false, align: 'start' },
    { text: 'commit', value: 'commit', sortable: false, align: 'start' },
    { text: 'status', value: 'status', sortable: false, align: 'start' },
    { text: 'date', value: 'date', sortable: false, align: 'end' },
  ]

  function asLog (item: unknown): GitLog {
    return item as GitLog
  }

  function onPerPageChange (value: number | string): void {
    emit('update:per-page', Number(value))
  }
</script>

<style lang="scss" scoped>
.commit-cell {
  max-width: 520px;
}

.branch-change {
  overflow-wrap: anywhere;
}
</style>
