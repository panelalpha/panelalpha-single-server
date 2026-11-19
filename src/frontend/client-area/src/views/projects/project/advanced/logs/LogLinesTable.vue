<template>
  <div>
    <!-- Search runs here, on the rows we hold (`filterLogRows`): of a file log only the windows loaded so far are searched. The kit
         table gets the filtered rows, so its own filter is switched off (`custom-filter`) and it only shows no-results for an empty match. -->
    <DataTable
      :card-below="976"
      :custom-filter="matchAll"
      :default-items-per-page="LOG_DEFAULT_PER_PAGE"
      :headers="headers"
      :item-slots="itemSlots"
      item-value="id"
      :items="(shownRows as unknown as Record<string, unknown>[])"
      :items-loading="loading"
      :items-per-page="perPage"
      :loading="loadingMore"
      no-results-first
      :number-of-pages="footerPages"
      :page="page"
      :per-page-label="t('table.footer.log')"
      :possible-items-per-page="LOG_POSSIBLE_PER_PAGE"
      :search-term="searchTerm"
      skeleton="logs"
      :sort-by="sortBy"
      :sort-desc="sortDesc"
      sort-in-view
      table-testid="log-lines-table"
      @clear-filters="emit('clear-filters')"
      @update:items-per-page="changePerPage"
      @update:page="changePage"
      @update:sort-by="sortBy = $event"
      @update:sort-desc="sortDesc = $event"
    >
      <template #no-data>
        <EmptyState
          :desc="empty.description"
          :title="empty.title"
        >
          <template #image>
            <NoDataTableLogs />
          </template>
        </EmptyState>
      </template>

      <template #item.time="{ item }">
        <span class="text--gray-darken1 log-cell-nowrap">{{ asRow(item).time ?? '' }}</span>
      </template>

      <template #item.request="{ item }">
        <div class="log-cell-text">
          <div>{{ asRow(item).request ?? asRow(item).message }}</div>

          <div
            v-if="asRow(item).detail"
            class="caption text--gray-darken1"
            data-testid="log-lines-detail"
          >
            {{ asRow(item).detail }}
          </div>
        </div>
      </template>

      <template #item.status="{ item }">
        <StatusLabel
          v-if="asRow(item).status"
          :status="httpStatusColor(asRow(item).status)"
          :value="asRow(item).status"
        />
      </template>

      <template #item.level="{ item }">
        <StatusLabel
          v-if="asRow(item).level"
          :status="levelColor(asRow(item).level)"
          :value="levelLabel(asRow(item).level)"
        />
      </template>

      <template #item.size="{ item }">
        <span class="log-cell-nowrap">{{ formatLogSize(asRow(item).size) }}</span>
      </template>

      <template #item.stage="{ item }">
        <span>{{ asRow(item).stage ?? '' }}</span>
      </template>

      <template #item.message="{ item }">
        <span class="log-cell-text">{{ asRow(item).message }}</span>
      </template>

      <template #mobile="{ item }">
        <MobileTableField
          v-for="header in headers"
          :key="header.value"
          :label="header.label as string"
        >
          <template v-if="header.value === 'time'">
            <span class="text--gray-darken1">{{ asRow(item).time ?? '' }}</span>
          </template>

          <template v-else-if="header.value === 'request'">
            <div class="log-cell-text">
              <div>{{ asRow(item).request ?? asRow(item).message }}</div>

              <div
                v-if="asRow(item).detail"
                class="caption text--gray-darken1"
              >
                {{ asRow(item).detail }}
              </div>
            </div>
          </template>

          <template v-else-if="header.value === 'status'">
            <StatusLabel
              v-if="asRow(item).status"
              :status="httpStatusColor(asRow(item).status)"
              :value="asRow(item).status"
            />
          </template>

          <template v-else-if="header.value === 'level'">
            <StatusLabel
              v-if="asRow(item).level"
              :status="levelColor(asRow(item).level)"
              :value="levelLabel(asRow(item).level)"
            />
          </template>

          <template v-else-if="header.value === 'size'">
            <span class="p-3">{{ formatLogSize(asRow(item).size) }}</span>
          </template>

          <template v-else-if="header.value === 'stage'">
            <span class="p-3">{{ asRow(item).stage ?? '' }}</span>
          </template>

          <template v-else-if="header.value === 'message'">
            <span class="log-cell-text">{{ asRow(item).message }}</span>
          </template>

          <template v-else>
            <span class="p-3">{{ rawValue(asRow(item), header.value) }}</span>
          </template>
        </MobileTableField>
      </template>
    </DataTable>
  </div>
</template>

<script lang="ts" setup>
  // Table of log lines: one component for the webserver access log, the error log, the PHP log and the deploy
  // run. The browser cuts the rows into pages of 15, 50 or 100, like every table here. A file log (webserver, PHP) comes from the API in
  // windows of the file, newest first: `hasMore` says an older window exists, and a page past the loaded rows asks for it (`load-more`);
  // the host appends its rows and the table moves to the page. The Time column of the deploy run sorts by `sortKey`.
  import type { LogKind, LogRow } from './log-lines'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataTableLogs from '@/shared/ui/illustrations/NoDataTableLogs.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import {
    filterLogRows,
    formatLogSize,
    httpStatusColor,
    levelColor,
    levelLabel,
    LOG_DEFAULT_PER_PAGE,
    LOG_HEADER_DEFAULTS,
    LOG_POSSIBLE_PER_PAGE,
    logHeaders,
    logPageCount,
    sortLogRows,
  } from './log-lines-table'

  const props = withDefaults(defineProps<{
    kind: LogKind
    rows: LogRow[]
    loading?: boolean
    /** An older window of the file exists (webserver, PHP); the footer offers one page more and asks for it with `load-more`. */
    hasMore?: boolean
    /** The older window is on its way: the rows stay, the table shows its progress bar. */
    loadingMore?: boolean
    searchTerm?: string
    /** Replace the default empty-state texts of the kind. */
    emptyTitle?: string
    emptyDescription?: string
  }>(), {
    loading: false,
    hasMore: false,
    loadingMore: false,
    searchTerm: '',
    emptyTitle: undefined,
    emptyDescription: undefined,
  })

  const emit = defineEmits<{
    'load-more': []
    'clear-filters': []
  }>()

  const { t } = useTranslation()

  // The page and its size are held here: the hosts (deploy viewer, webserver and PHP tabs) do not hold them, so a page passed back as a
  // prop would stay 1 and the footer buttons would do nothing.
  const page = ref(1)
  const perPage = ref(LOG_DEFAULT_PER_PAGE)

  // Sorting is held here and applied to the rows (`sort-in-view`); only the deploy Time header sorts, ascending first, file order before a click.
  const sortBy = ref<LegacySortHeader | false>(false)
  const sortDesc = ref(false)

  // `label` is the translated header text: the kit shows `item.label` before it looks up `table.header.<text>`.
  const headers = computed(() => logHeaders(props.kind).map(header => ({
    ...header,
    label: t(`table.header.${header.text}`, { defaultValue: LOG_HEADER_DEFAULTS[header.text] ?? header.text }),
  })))

  const itemSlots = computed(() => headers.value.map(header => header.value).filter(key => key !== 'ip'))

  const shownRows = computed(() => {
    const filtered = filterLogRows(props.rows, props.searchTerm)
    return sortLogRows(filtered, sortBy.value ? (sortDesc.value ? 'desc' : 'asc') : null)
  })

  // Pages of the loaded rows, plus one for the older window while the file has one. A search pages only the loaded rows (it asks for nothing).
  const loadedPages = computed(() => logPageCount(shownRows.value.length, perPage.value))
  const canLoadMore = computed(() => props.hasMore && props.searchTerm.trim() === '')
  const footerPages = computed(() => canLoadMore.value ? loadedPages.value + 1 : undefined)

  // A page past the loaded rows waits here until the window arrives; a failed or empty load gives up (the page stays where it was).
  // The move runs after the render: V4 counts its pages from rows it filters in an effect, so a page set in the same tick as the new rows
  // would be clamped to the old count.
  const pendingPage = ref<number | null>(null)
  let rowsAtRequest = 0

  function requestMore (target: number): void {
    pendingPage.value = target
    rowsAtRequest = props.rows.length
    emit('load-more')
  }

  function changePage (value: number): void {
    if (canLoadMore.value && value > loadedPages.value) {
      requestMore(value)
    } else {
      page.value = value
    }
  }

  function changePerPage (value: number | string): void {
    perPage.value = Number(value)
    page.value = 1
  }

  watch(() => props.loadingMore, loadingMore => {
    const target = pendingPage.value
    if (loadingMore || target === null) {
      return
    }
    const grew = props.rows.length > rowsAtRequest
    if (grew && target > loadedPages.value && canLoadMore.value) {
      // The window was shorter than a page: ask for the next one.
      requestMore(target)
      return
    }
    pendingPage.value = null
    if (grew) {
      page.value = Math.min(target, loadedPages.value)
    }
  }, { flush: 'post' })

  // Another file or run, or a reload after the file rotated (rows replaced, not appended), starts again on page 1.
  watch(() => props.rows[0], (first, previous) => {
    if (first !== previous) {
      pendingPage.value = null
      page.value = 1
    }
  })

  // Empty-state copy per kind (existing keys): access → webserver, error → WordPress error log, php → PHP, deploy → "no lines".
  const empty = computed(() => {
    if (props.emptyTitle !== undefined) {
      return { title: props.emptyTitle, description: props.emptyDescription }
    }
    switch (props.kind) {
      case 'access': {
        return { title: t('message.emptyTable.webserverLogs.title'), description: t('message.emptyTable.webserverLogs.description') }
      }
      case 'php': {
        return { title: t('message.emptyTable.phpLogs.title'), description: t('message.emptyTable.phpLogs.description') }
      }
      case 'deploy': {
        return { title: t('deployLogs.noLines'), description: undefined }
      }
      default: {
        return { title: t('message.emptyTable.wpErrorLogs.title'), description: t('message.emptyTable.wpErrorLogs.description') }
      }
    }
  })

  function matchAll (): boolean {
    return true
  }

  function asRow (item: unknown): LogRow {
    return item as LogRow
  }

  function rawValue (row: LogRow, key: string): string {
    const value = (row as unknown as Record<string, unknown>)[key]
    return value == null ? '' : String(value)
  }
</script>

<style lang="scss" scoped>
// The same columns in every tab and on every page: fixed widths, Request / Message take the rest. With `table-layout: fixed` the first row
// sets the widths, and that row is the kit header (`TableCustomSort`, one `td.item--<text>` per column), which takes no `width` of its own.
:deep(table) {
  table-layout: fixed;
}

// Time: the access log stamp (`09/Nov/2026:11:04:58 +0000`) with a gap before IP; Status and Size only fit a chip and a short size.
:deep(.custom-sort .item--time) {
  width: 270px;
}

:deep(.custom-sort .item--ip) {
  width: 170px;
}

:deep(.custom-sort .item--status) {
  width: 90px;
}

:deep(.custom-sort .item--size) {
  width: 100px;
}

:deep(.custom-sort .item--level) {
  width: 120px;
}

:deep(.custom-sort .item--stage) {
  width: 140px;
}

// The kit makes the last header cell a flex box (right-aligned Actions of other tables). A flex `td` is no table cell, so the browser wraps it
// in an anonymous cell without a width and the fixed layout ignores the width of that column. Here it stays a cell: Size is right-aligned
// by its `headerAlign: 'end'`, Message (the last column of the other kinds) is left-aligned like its cells.
:deep(.custom-sort .sort-item:last-child) {
  display: table-cell;
  vertical-align: middle;
}

// The right-aligned Size header ends where its values end: `_tables.scss` pads the last cell of the header row 24px and of a body row
// 12px, both `!important`.
:deep(.custom-sort .item--size) {
  padding-right: 12px !important;
}

// Only the cell content: a PHP entry has several lines (`\n` in `message`), a request or a message may hold long unbroken text.
.log-cell-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.log-cell-nowrap {
  white-space: nowrap;
}
</style>
