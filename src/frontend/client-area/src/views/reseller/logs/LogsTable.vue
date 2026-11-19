<template>
  <div>
    <PageTitle
      :title="t('heading.reseller.page.logs')"
      title-testid="reseller-logs-title"
    >
      <template #filters>
        <data-iterator-filter-controls
          class="my-hostings-search"
          :full-width-lg="false"
          full-width-md
          :full-width-search="false"
          :search-term="searchTerm"
          show-search-term
          @update:search-term="handleSearchTermChange"
        />
      </template>
    </PageTitle>

    <v-container class="px-0 py-3">
      <v-row>
        <v-col cols="12">
          <data-table
            announce-sort
            class="logs-table"
            :default-items-per-page="RESELLER_LOGS_PER_PAGE"
            :headers="LOG_TABLE_HEADERS"
            :item-slots="LOG_CELL_KEYS"
            item-value="id"
            :items="(logs as unknown as Record<string, unknown>[])"
            :items-loading="fetchingLogs"
            :items-per-page="itemsPerPage"
            :items-total="itemsTotal"
            :page="page"
            :per-page-label="t('table.footer.log')"
            :possible-items-per-page="possibleItemsPerPage"
            :search-term="searchTerm"
            server
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            :table-paging-events="false"
            @clear-filters="clearFilters"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          >
            <template #no-data>
              <data-iterator-no-results-container
                v-if="searchTerm"
                :search-term="searchTerm"
                @clear-all-filters="clearFilters"
              />

              <EmptyState
                v-else
                data-testid="reseller-logs-empty"
                :desc="t('reseller.logs.noLogsDesc')"
                :title="t('reseller.logs.noLogs')"
                title-tag="h6"
                variant="cell"
              >
                <template #image>
                  <no-data-table-logs />
                </template>
              </EmptyState>
            </template>

            <template
              v-for="header in RESELLER_LOG_HEADERS"
              :key="header.value"
              #[`item.${header.value}`]="{ item }"
            >
              <logs-table-cell
                :header="header"
                :item="asLog(item)"
              />
            </template>

            <template #mobile="{ item }">
              <MobileTableField
                v-for="header in RESELLER_LOG_HEADERS"
                :key="header.value"
                :label="t(`table.header.${header.text}`)"
              >
                <logs-table-cell
                  :header="header"
                  is-mobile
                  :item="asLog(item)"
                />
              </MobileTableField>
            </template>
          </data-table>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // The page owns the state and the server call: title row, card,
  // loading skeleton, the empty / no-results states, the sort header, the desktop / mobile rows and the footer (always shown with rows).
  // A change of page, size, sort or term reloads once through the page state (legacy watchers fetched twice)
  // and only the newest response counts (legacy had no guard).
  import type { ResellerLogRow } from '@/views/reseller/reseller.api'
  import { useTranslation } from 'i18next-vue'
  import { onMounted, ref } from 'vue'
  import { listResellerInstancesLogs } from '@/views/reseller/reseller.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataTableLogs from '@/shared/ui/illustrations/NoDataTableLogs.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { DATE_HEADER, RESELLER_LOG_HEADERS, RESELLER_LOGS_PER_PAGE, RESELLER_LOGS_POSSIBLE_PER_PAGE } from './logs-table'
  import LogsTableCell from './LogsTableCell.vue'

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // Legacy starts with `fetchingLogs: false`: the empty state flashes before the first GET.
  const fetchingLogs = ref(false)
  const logs = ref<ResellerLogRow[]>([])
  const itemsTotal = ref(0)

  const {
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    clearFilters,
    changePage,
    changePerPage,
    handleSearchTermChange,
    changeSortBy,
    changeSortDesc,
  } = useDataIteratorPageState({
    load: () => fetchLogs(),
    itemsPerPage: RESELLER_LOGS_PER_PAGE,
    possibleItemsPerPage: RESELLER_LOGS_POSSIBLE_PER_PAGE,
    sortBy: DATE_HEADER,
    sortDesc: true,
  })

  // The cell slots of the table: one per column, the keys of `RESELLER_LOG_HEADERS`.
  const LOG_CELL_KEYS = RESELLER_LOG_HEADERS.map(header => header.value)
  // `DATE_HEADER.align` ('end') is for the sort; the legacy cells of every column stayed left (`text-start`), so the table gets the
  // columns without it.
  const LOG_TABLE_HEADERS = RESELLER_LOG_HEADERS.map(header => ({ ...header, align: undefined }))

  // The V4 slot hands the row as a plain record; the items are `ResellerLogRow`.
  function asLog (item: unknown): ResellerLogRow {
    return item as ResellerLogRow
  }

  // Only the newest request counts, for a success and for an error alike; a stale one neither writes, alerts nor clears the skeleton.
  let latestResellerLogsRequest = 0

  async function fetchLogs (): Promise<void> {
    const request = ++latestResellerLogsRequest
    fetchingLogs.value = true
    try {
      const response = await listResellerInstancesLogs({
        page: page.value,
        perPage: Number(itemsPerPage.value),
        sortBy: sortBy.value ? sortBy.value.value : DATE_HEADER.value,
        sortDir: sortDesc.value ? 'desc' : 'asc',
        searchTerm: searchTerm.value,
      })
      if (request !== latestResellerLogsRequest) {
        return
      }
      logs.value = response.items
      itemsTotal.value = response.total
    } catch (error) {
      if (request !== latestResellerLogsRequest) {
        return
      }
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (request === latestResellerLogsRequest) {
        fetchingLogs.value = false
      }
    }
  }

  onMounted(() => {
    void fetchLogs()
  })
</script>

<style lang="scss" src="./LogsTable.scss" />
