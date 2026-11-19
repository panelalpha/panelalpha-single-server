<template>
  <div>
    <PageTitle
      :title="t('heading.connectAi.activityLog')"
      title-testid="connect-ai-activity-title"
    >
      <template #filters>
        <v-select
          v-model="filterToken"
          class="connect-ai-activity-log__filter"
          clearable
          data-testid="connect-ai-activity-filter"
          density="compact"
          hide-details
          :items="tokenNames"
          :label="t('heading.connectAi.filterByToken')"
          variant="outlined"
          @update:model-value="onFilterChange"
        />
      </template>
    </PageTitle>

    <v-container class="px-0 py-3">
      <v-row>
        <v-col cols="12">
          <v-card
            class="data-table"
            :class="loading ? 'data-table--loading' : ''"
            data-testid="connect-ai-logs"
            elevation="4"
          >
            <EmptyState
              v-if="!loading && logs.length === 0"
              class="px-6 py-14"
              data-testid="connect-ai-logs-empty"
              :desc="t('heading.connectAi.noActivityLogs')"
              :title="t('heading.connectAi.noActivityLogsTitle')"
              title-tag="h6"
              variant="cell"
            >
              <template #image>
                <no-data-table-logs />
              </template>
            </EmptyState>

            <v-data-table-server
              v-else
              class="elevation-0 custom-data-table"
              :headers="v4Headers"
              :hide-default-body="loading"
              hide-default-footer
              hide-default-header
              :items="logs"
              :items-length="total"
              :items-per-page="LOGS_PER_PAGE"
              :page="page"
            >
              <template
                v-if="!mobile && logs.length > 0"
                #thead
              >
                <tr class="custom-sort">
                  <td
                    v-for="header in LOG_HEADERS"
                    :key="header.value"
                    class="sort-item px-4"
                    :class="{ 'text-right': header.align === 'end' }"
                  >
                    <div
                      class="custom-sort__item"
                      :class="{ 'justify-end': header.align === 'end' }"
                    >
                      {{ header.text ? t(header.text) : '' }}
                    </div>
                  </td>
                </tr>
              </template>

              <template
                v-if="loading"
                #tbody
              >
                <template v-if="lgAndDown">
                  <logs-table-item-skeleton-mobile
                    v-for="skeleton in 5"
                    :key="skeleton"
                  />
                </template>

                <template v-else>
                  <logs-table-skeleton-item :cols="4" />
                </template>
              </template>

              <template
                v-if="mobile"
                #item="{ item }"
              >
                <MobileTableCard>
                  <MobileTableField
                    v-for="header in LOG_HEADERS"
                    :key="header.value"
                    :label="t(header.text)"
                  >
                    <mcp-activity-log-table-cell
                      :header="header"
                      is-mobile
                      :item="item"
                    />
                  </MobileTableField>
                </MobileTableCard>
              </template>

              <template
                v-else
                #item="{ item }"
              >
                <tr>
                  <td
                    v-for="header in LOG_HEADERS"
                    :key="header.value"
                    :class="{ 'text-right': header.align === 'end' }"
                  >
                    <mcp-activity-log-table-cell
                      :header="header"
                      :item="item"
                    />
                  </td>
                </tr>
              </template>

              <template #bottom>
                <div>
                  <v-divider v-if="showLogsFooter(pages)" />

                  <data-iterator-footer
                    v-if="showLogsFooter(pages)"
                    v-model:page="page"
                    :items-per-page="LOGS_PER_PAGE"
                    :number-of-pages="pages"
                    :per-page-label="t('table.footer.log')"
                    :possible-items-per-page="POSSIBLE_LOGS_PER_PAGE"
                  />
                </div>
              </template>
            </v-data-table-server>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // The activity log with a token filter and server pagination (20 per page).
  // The filter names come from the view's own one-shot `GET /mcp-tokens`, duplicates kept. An error alerts and leaves the empty state.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { listActivityLogs, listTokens, type McpActivityLog } from '@/entities/mcp/mcp.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
  import MobileTableCard from '@/shared/ui/data-table/MobileTableCard.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataTableLogs from '@/shared/ui/illustrations/NoDataTableLogs.vue'
  import LogsTableItemSkeletonMobile from '@/shared/ui/skeletons/LogsTableItemSkeletonMobile.vue'
  import LogsTableSkeletonItem from '@/shared/ui/skeletons/LogsTableSkeletonItem.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { LOG_HEADERS, logPages, LOGS_PER_PAGE, POSSIBLE_LOGS_PER_PAGE, showLogsFooter } from './mcp-activity-log'
  import McpActivityLogTableCell from './McpActivityLogTableCell.vue'

  const { t } = useTranslation()
  const { lgAndDown, mobile } = useDisplay()
  const alerts = useAlertsStore()

  const loading = ref(false)
  const logs = ref<McpActivityLog[]>([])
  const total = ref(0)
  const filterToken = ref<string | null>(null)
  const tokenNames = ref<string[]>([])
  const page = ref(1)

  const pages = computed(() => logPages(total.value))

  // V2 headers `{ text, value }` become V4 columns `{ title, key }`.
  const v4Headers = LOG_HEADERS.map(header => ({ title: header.text, key: header.value, sortable: false }))

  async function fetchLogs (): Promise<void> {
    loading.value = true
    try {
      const response = await listActivityLogs({ page: page.value, ...(filterToken.value ? { token_name: filterToken.value } : {}) })
      logs.value = response.data || []
      total.value = response.total || 0
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loading.value = false
    }
  }

  async function fetchTokenNames (): Promise<void> {
    try {
      tokenNames.value = (await listTokens()).map(token => token.name)
    } catch {
      // Legacy swallows it: the filter just has no options.
    }
  }

  // The filter resets to page 1 (the page watcher fetches), otherwise fetch directly.
  function onFilterChange (): void {
    if (page.value !== 1) {
      page.value = 1
      return
    }
    void fetchLogs()
  }

  watch(page, (value, oldValue) => {
    if (value !== oldValue) {
      void fetchLogs()
    }
  })

  onMounted(() => {
    void fetchLogs()
    void fetchTokenNames()
  })
</script>

<style lang="scss" scoped src="@/shared/ui/data-table/TableCustomSort.scss" />

<style lang="scss" scoped>
.connect-ai-activity-log__filter {
  max-width: 280px;

  // V2 `.v-input` of an outlined field carries the 4px radius (V4 puts it on the field only).
  border-radius: 4px;
}
</style>
