<template>
  <v-card
    class="data-table"
    :class="[
      itemsLoading ? 'data-table--loading' : '',
      selectable ? 'data-table--selectable' : '',
      rowSize === 'lg' ? 'data-table--row-lg' : '',
    ]"
    elevation="4"
  >
    <component
      :is="server ? VDataTableServer : VDataTable"
      class="elevation-0 custom-data-table"
      :data-testid="tableTestid"
      :expanded="expandable ? expandedItems : undefined"
      :headers="v4Headers"
      :hide-default-body="itemsLoading"
      hide-default-footer
      hide-default-header
      :item-value="itemValue"
      :items="(items as Record<string, unknown>[])"
      :items-per-page="tablePagingEvents ? Number(itemsPerPage ?? 10) : localItemsPerPage"
      :loading="loading"
      :page="tablePagingEvents ? page : localPage"
      :row-props="rowProps"
      :search="searchTerm"
      :sort-by="sortInView ? undefined : toV4SortBy(sortBy, sortDesc)"
      v-bind="modeProps"
      @update:items-per-page="onTableItemsPerPage"
      @update:page="onTablePage"
    >
      <template
        v-if="!isCard && (items.length > 0 || (headerWhenSearching && Boolean(searchTerm)))"
        #thead
      >
        <!-- Legacy V2 `header` slot put the row straight into <table>, no <thead> (V2 genHeaders); V4 renders #thead raw too. -->
        <table-custom-sort
          v-if="!itemsLoading"
          :all-selected="allChecked"
          :announce-sort="announceSort"
          :can-be-selected="selectable"
          :data-testid="headerTestid"
          :headers="headers"
          :is-mobile="isCard"
          :sort-by="sortBy"
          :sort-desc="sortDesc"
          @select-all="emit('update:check-all', $event)"
          @update:sort-by="emit('update:sort-by', $event)"
          @update:sort-desc="emit('update:sort-desc', $event)"
        />
      </template>

      <template
        v-if="itemsLoading"
        #tbody
      >
        <template v-if="lgAndDown">
          <template v-if="skeleton === 'logs'">
            <logs-table-item-skeleton-mobile
              v-for="item in 5"
              :key="item"
              :data-testid="skeletonTestid"
            />
          </template>

          <template v-else>
            <table-skeleton-mobile
              v-for="item in 5"
              :key="item"
              :data-testid="skeletonTestid"
              :variant="skeletonVariants.mobile"
            />
          </template>
        </template>

        <template v-else-if="skeleton === 'logs'">
          <logs-table-sort-skeleton />
          <logs-table-skeleton-item :data-testid="skeletonTestid" />
        </template>

        <template v-else>
          <table-skeleton-sort :variant="skeletonVariants.sort" />

          <table-skeleton-row
            :data-testid="skeletonTestid"
            :variant="skeletonVariants.row"
          />
        </template>
      </template>

      <!-- Legacy `no-data` / `no-results` slots: V4 has one empty slot; empty `items` is no-data, a search that matches nothing is no-results. -->
      <template #no-data>
        <slot
          v-if="showNoResults && $slots['no-results']"
          name="no-results"
        />

        <data-iterator-no-results-container
          v-else-if="showNoResults"
          :data-testid="noResultsTestid"
          :search-term="searchTerm"
          @clear-all-filters="emit('clear-filters')"
        />

        <slot
          v-else-if="items.length === 0"
          name="no-data"
        />
      </template>

      <template
        v-if="$slots.top"
        #top
      >
        <slot name="top" />
      </template>

      <template #item.actions="{ item }">
        <div
          class="d-flex actions-row"
          :data-testid="actionsTestid"
        >
          <slot
            name="actions"
            v-bind="actionSlotProps(item)"
          />
        </div>
      </template>

      <template
        v-if="selectable"
        #item.select="{ item }"
      >
        <div class="select-all">
          <checkbox
            :disabled="!isSelectable(item)"
            :model-value="isChecked(item)"
            @update:model-value="emit('update:checked-items', item)"
          />
        </div>
      </template>

      <!-- Cells the caller renders by column key (`item.<key>`), for every column but the actions. -->
      <template
        v-for="name in cellSlots"
        :key="name"
        #[`item.${name}`]="{ item }"
      >
        <slot
          :item="item"
          :name="`item.${name}`"
        />
      </template>

      <!-- `isCard` alone keeps the card as it was; a grouped or expandable table renders the row itself, with the group header
           before it and the details row after it (`#expanded-row`, V4 renders it only for the open row). The header sits in a `v-for`
           so a row without one leaves no comment node in the DOM. -->
      <template
        v-if="isCard || structured"
        #item="{ item, props: rowSlotProps, columns }"
      >
        <tr
          v-for="label in groupHeaderOf(item)"
          :key="label"
          class="data-table__group"
        >
          <td :colspan="columns.length">
            <div class="data-table__group-label">
              <slot
                :item="item"
                :label="label"
                name="group-header"
              >
                {{ label }}
              </slot>
            </div>
          </td>
        </tr>

        <MobileTableCard
          v-if="isCard"
          :actions-label="actionsLabel"
          :actions-testid="actionsTestid"
          :card-testid="cardTestid"
          :variant="mobileVariant"
          v-bind="dataTableRowProps(item, mobileVariant === 'compact' ? rowClass : undefined, rowAttrs, expandFor(item))"
          @actions-sort="actionsSort && emit('update:sort-by', headers[1] as LegacySortHeader)"
        >
          <slot
            v-if="mobileVariant !== 'compact'"
            :headers="headers"
            :item="item"
            name="mobile"
          />

          <template
            v-for="part in compactParts"
            :key="part"
            #[part]
          >
            <slot
              :headers="headers"
              :item="item"
              :name="`mobile-${part}`"
            />
          </template>

          <template
            v-if="selectable"
            #select
          >
            <checkbox
              :disabled="!isSelectable(item)"
              :model-value="isChecked(item)"
              @update:model-value="emit('update:checked-items', item)"
            />
          </template>

          <template
            v-if="$slots['mobile-actions'] || $slots.actions"
            #actions
          >
            <!-- Legacy passed no row here, so a mobile Edit or Delete got `undefined` as the line.
                 The row goes in as on desktop; the layout does not change. -->
            <slot
              v-if="$slots['mobile-actions']"
              name="mobile-actions"
              v-bind="actionSlotProps(item)"
            />

            <slot
              v-else
              name="actions"
              v-bind="actionSlotProps(item)"
            />
          </template>
        </MobileTableCard>

        <!-- The row of the default V4 path, given the same cell slots (V4 hands the table's slots to its own row, not to a `#item` one). -->
        <VDataTableRow
          v-else
          v-bind="rowSlotProps"
        >
          <template #item.actions="{ item: cell }">
            <div
              class="d-flex actions-row"
              :data-testid="actionsTestid"
            >
              <slot
                name="actions"
                v-bind="actionSlotProps(asRow(cell))"
              />
            </div>
          </template>

          <template
            v-if="selectable"
            #item.select="{ item: cell }"
          >
            <div class="select-all">
              <checkbox
                :disabled="!isSelectable(asRow(cell))"
                :model-value="isChecked(asRow(cell))"
                @update:model-value="emit('update:checked-items', asRow(cell))"
              />
            </div>
          </template>

          <template
            v-for="name in cellSlots"
            :key="name"
            #[`item.${name}`]="{ item: cell }"
          >
            <slot
              :item="asRow(cell)"
              :name="`item.${name}`"
            />
          </template>
        </VDataTableRow>
      </template>

      <template
        v-if="expandable"
        #expanded-row="{ item, columns }"
      >
        <tr
          :id="expandedId(item)"
          class="data-table__expanded"
        >
          <td :colspan="columns.length">
            <div class="data-table__expanded-body">
              <slot
                :item="item"
                name="expanded"
              />
            </div>
          </td>
        </tr>
      </template>

      <template
        v-if="(items.length > 0 || footerWhenEmpty) && !hideFooter"
        #bottom="{ pageCount, itemsLength, itemsPerPage: perPage, page: currentPage, items: pageItems }"
      >
        <div :data-testid="footerTestid">
          <data-iterator-footer
            :default-items-per-page="defaultItemsPerPage"
            :items-per-page="perPage"
            :list-style="listStyle"
            :number-of-pages="numberOfPages ?? footerPageCount(footerPages, pageCount, itemsLength, pageItems.length)"
            :page="currentPage"
            :per-page-label="perPageLabel"
            :possible-items-per-page="possibleItemsPerPage"
            @update:items-per-page="onFooterItemsPerPage"
            @update:page="onFooterPage"
          />
        </div>
      </template>
    </component>
  </v-card>
</template>

<script lang="ts" setup>
  import type { DataTableRowAttrs, DataTableRowExpand } from './data-table'
  // The one table of the app: the frame of the legacy `HostingTable` for every table of it. One look for all; props and slots only for what a table does differently
  // (columns, cells, actions, mobile card, paging, empty state).
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useId, useSlots, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { VDataTable, VDataTableRow, VDataTableServer } from 'vuetify/components/VDataTable'
  import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import { toV4SortBy } from '@/shared/ui/data-iterator/sort-model'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import LogsTableItemSkeletonMobile from '@/shared/ui/skeletons/LogsTableItemSkeletonMobile.vue'
  import LogsTableSkeletonItem from '@/shared/ui/skeletons/LogsTableSkeletonItem.vue'
  import LogsTableSortSkeleton from '@/shared/ui/skeletons/LogsTableSortSkeleton.vue'
  import TableSkeletonMobile from '@/shared/ui/skeletons/TableSkeletonMobile.vue'
  import TableSkeletonRow from '@/shared/ui/skeletons/TableSkeletonRow.vue'
  import TableSkeletonSort from '@/shared/ui/skeletons/TableSkeletonSort.vue'
  import { dataTableProps, dataTableRowProps, footerPageCount, groupHeaderBefore, isCardWidth, rowMarkerClass, SKELETON_VARIANTS, toV4Headers } from './data-table'
  import MobileTableCard from './MobileTableCard.vue'
  import TableCustomSort from './TableCustomSort.vue'
  import { useCustomTable } from './use-custom-table'

  const props = defineProps(dataTableProps)

  const COMPACT_PARTS = ['title', 'status', 'full', 'meta', 'meta-end'] as const

  // Legacy declared `update:check-all` / `update:checked-items` / `update:sort-by` / `update:sort-desc` through
  // the mixin and forwarded the table's own `update:sortBy` / `update:sortDesc` / `update:page` /
  // `update:items-per-page` / `clearFilters` through `$listeners`. The kebab-case `update:sort-by` / `update:sort-desc`
  // are the same events (a host's `@update:sortBy` / `@update:sortDesc` listener receives them in Vue 3).
  const emit = defineEmits<{
    'update:check-all': [value: boolean]
    'update:checked-items': [value: unknown]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'clear-filters': []
    'update:expanded-key': [value: string | number | null]
  }>()

  const { t } = useTranslation()
  const slots = useSlots()
  const { mobile, lgAndDown, width } = useDisplay()

  const { allSelected } = useCustomTable(props, emit, { canBeSelected: false })

  // The named slots of the `compact` card the host filled (`mobile-title`, ...); a card gets only these, so an empty one leaves no element.
  const compactParts = computed(() => props.mobileVariant === 'compact' ? COMPACT_PARTS.filter(part => slots[`mobile-${part}`]) : [])

  const v4Headers = computed(() => toV4Headers(props.headers))
  // `actions` is always the `#actions` slot in `div.actions-row`; an `item.actions` cell slot would replace that wrapper.
  const cellSlots = computed(() => props.itemSlots.filter(name => name !== 'actions'))
  // The actions field of a mobile card reads like the desktop header: its ready `label` (Containers) or the shared key.
  const actionsLabel = computed(() => {
    const label = props.headers.find(header => header.value === 'actions')?.label
    return typeof label === 'string' && label.trim() ? label : t('table.header.actions')
  })
  const isCard = computed(() => isCardWidth(props.cardBelow, width.value, mobile.value))
  const skeletonVariants = computed(() => SKELETON_VARIANTS[props.skeleton])
  const allChecked = computed(() => props.allSelected ?? allSelected.value)
  // Server mode: V4 neither cuts nor sorts nor filters; the footer counts `itemsTotal` (or the rows given). Client mode filters and sorts.
  const modeProps = computed(() => props.server
    ? { itemsLength: props.itemsTotal ?? props.items.length }
    : { customFilter: props.customFilter, customKeySort: props.customKeySort, filterKeys: props.filterKeys })
  // A search term shows no-results; with `noResultsFirst` also over an empty list (the server and the config tables ask for that).
  const showNoResults = computed(() => Boolean(props.searchTerm) && (props.noResultsFirst || props.items.length > 0))

  function isChecked (item: Record<string, unknown>): boolean {
    const value = props.selectValue ? props.selectValue(item) : item[props.selectKey]
    return (props.checkedItems ?? []).includes(value)
  }

  function isSelectable (item: Record<string, unknown>): boolean {
    return props.itemSelectable ? props.itemSelectable(item) : true
  }

  function rowClass (item: Record<string, unknown>): string | undefined {
    return [props.itemClass?.(item), rowMarkerClass(props.rowMarker?.(item), Boolean(props.rowMarker))].filter(Boolean).join(' ') || undefined
  }

  // The actions slots get the cells of the row as before and the row itself as `row` (Containers and Databases read the row through it).
  function actionSlotProps (item: Record<string, unknown>): Record<string, unknown> {
    return { ...item, row: item }
  }

  function rowProps ({ item }: { item: Record<string, unknown> }): DataTableRowAttrs {
    return dataTableRowProps(item, rowClass, props.rowAttrs, expandFor(item))
  }

  // Groups and the details row. The table keeps the key of the open row itself, so a host that binds no `expandedKey` still works;
  // a host that does gets `update:expanded-key` and can close the row (a filter change) by setting it to `null`.
  const structured = computed(() => Boolean(props.groupLabel) || props.expandable)
  const openKey = ref<string | number | null>(props.expandedKey)
  // V4 types `expanded` as strings but compares it with the `itemValue` of the row, so a numeric id has to stay a number.
  const expandedItems = computed(() => (openKey.value === null ? [] : [openKey.value]) as string[])
  // Header of the group a row starts, keyed by the row itself (the items are in display order, see `groupLabel`).
  const groupHeaders = computed(() => {
    const map = new Map<Record<string, unknown>, string | undefined>()
    const list = props.items as Record<string, unknown>[]
    for (const [index, item] of list.entries()) {
      map.set(item, groupHeaderBefore(list, index, props.groupLabel))
    }
    return map
  })

  watch(() => props.expandedKey, value => {
    openKey.value = value
  })
  // A row that leaves `items` (another page, a filter, a refetch without it) takes its open details with it; a refetch that keeps it does not.
  watch(() => props.items, list => {
    if (props.expandable && openKey.value !== null && !(list as Record<string, unknown>[]).some(item => rowKey(item) === openKey.value)) {
      setOpen(null)
    }
  })

  // What a V4 row slot hands over for `item` is typed `unknown`; the rows are the objects of `items`.
  function asRow (item: unknown): Record<string, unknown> {
    return item as Record<string, unknown>
  }

  function rowKey (item: Record<string, unknown>): string | number {
    return item[props.itemValue ?? 'id'] as string | number
  }

  function setOpen (key: string | number | null): void {
    openKey.value = key
    emit('update:expanded-key', key)
  }

  // The id of the details row carries the id of this table, so two expandable tables with the same row keys never share an `id`. Only an
  // expandable table takes one: `useId` advances the app-wide counter, so taking it in every table would shift the ids Vuetify gives
  // later elements (a `v-menu` activator) and change the DOM of tables that do not expand.
  const tableId = props.expandable ? useId() : ''

  function expandedId (item: Record<string, unknown>): string {
    return `data-table-${tableId}-expanded-${rowKey(item)}`
  }

  function expandFor (item: Record<string, unknown>): DataTableRowExpand | undefined {
    if (!props.expandable) {
      return undefined
    }
    const key = rowKey(item)
    const open = openKey.value === key
    return { open, controls: open ? expandedId(item) : undefined, toggle: () => setOpen(open ? null : key) }
  }

  // `v-for` over zero or one label: a row without a group header renders nothing there.
  function groupHeaderOf (item: Record<string, unknown>): string[] {
    const label = groupHeaders.value.get(item)
    return label === undefined ? [] : [label]
  }

  // `tablePagingEvents` off: the table keeps its page and per-page in local refs (a search that trims the pages stays here) and only
  // the footer clicks reach the host.
  const localPage = ref(props.page ?? 1)
  const localItemsPerPage = ref(Number(props.itemsPerPage ?? 10))
  watch(() => props.page, value => {
    localPage.value = value ?? 1
  })
  watch(() => props.itemsPerPage, value => {
    localItemsPerPage.value = Number(value ?? 10)
  })

  // `keepPageOnSearch`: V4 sets page 1 when the search changes (`useOptions`), before any clamp to the last page. Only that first event after
  // a new term is dropped: dropping it sets `lastSearch`, so a clamp to the last page in the same render passes. A term that moves no page
  // sends no event, so the post-render watcher sets `lastSearch` then.
  let lastSearch = props.searchTerm
  watch(() => props.searchTerm, value => {
    lastSearch = value
  }, { flush: 'post' })

  function onTablePage (value: number): void {
    if (props.keepPageOnSearch && value === 1 && props.searchTerm !== lastSearch) {
      lastSearch = props.searchTerm
      return
    }
    if (props.tablePagingEvents) {
      emit('update:page', value)
    } else {
      localPage.value = value
    }
  }

  function onTableItemsPerPage (value: number | string): void {
    if (props.tablePagingEvents) {
      emit('update:items-per-page', value)
    } else {
      localItemsPerPage.value = Number(value)
    }
  }

  function onFooterPage (value: number): void {
    localPage.value = value
    emit('update:page', value)
  }

  function onFooterItemsPerPage (value: number | string): void {
    localItemsPerPage.value = Number(value)
    emit('update:items-per-page', value)
  }
</script>

<style lang="scss" scoped>
// One look for every table: the legacy `HostingTable` styles plus the type and row height the FTP and Cron tables restated.
// The unused `.params` rule is omitted and `.custom-sort .sort-item:last-child` lives once, in TableCustomSort.scss.
.v-card {
  border-radius: 8px;
}

// V4 `.v-table` sets its own 14px / 1.25 type on the root; V2 set it on the cells only, so legacy rows inherit 16px / 24px.
.data-table :deep(.v-data-table) {
  font-size: 1rem;
  line-height: 1.5;
  --v-table-row-height: 48px;
}

.data-table .actions-row {
  gap: 12px;
  justify-content: flex-start;
}

.data-table .actions-row:last-child {
  justify-content: flex-end;
}

// `_tables.scss` puts 10px between neighbouring `.v-btn`s, but each V2 `v-tooltip` rendered its own wrapper between the row buttons, so
// they were never siblings and only the 12px gap counted; V4 tooltips render nothing there.
.data-table :deep(.actions-row .v-btn + .v-btn) {
  margin-left: 0;
}

// V2 `.v-btn` took the 24px body line height of the empty cell (`.v-data-table__empty-wrapper`); the V4 cell is 20px, so the button of the
// empty state restates the measured legacy 24px.
.data-table :deep(.no-data .v-btn) {
  line-height: 24px;
}

// A row of two lines (`rowSize="lg"`). The variable stands on the inner `.v-data-table`, which declares the 48px, so it is set there.
.data-table--row-lg :deep(.v-data-table) {
  --v-table-row-height: 64px;
}

// Group header and details row. The global `.data-table tbody td` rules give every cell 6px of vertical and
// 12 / 24px of horizontal padding with `!important`, so the height of these rows comes from the inner `div`; `height: auto` because a V4
// `td` height is a minimum. The row background is transparent with `!important` there (`_tables.scss`), so the fill sits on the cell.
.data-table .data-table__group > td,
.data-table .data-table__expanded > td {
  height: auto;
  background: var(--v-table-group-bg);
}

.data-table .data-table__group > td {
  font-size: 12px;
  line-height: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--v-gray-darken1);
}

.data-table .data-table__group-label {
  padding: 4px 0 3px;
}

.data-table .data-table__expanded-body {
  padding: 10px 12px 14px 0;
}

// A row that opens a details row: a pointer (the mobile card has no V4 `--clickable` class), the shade of the group on hover and while
// open, a focus ring.
.data-table :deep(tr[aria-expanded]) {
  cursor: pointer;
}

.data-table :deep(tr[aria-expanded]:hover > td),
.data-table :deep(tr[aria-expanded='true'] > td) {
  background: var(--v-table-group-bg);
}

.data-table :deep(tr[aria-expanded]:focus-visible) {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

// V4 gives the `text` bone a 16px margin on every side; V2 only a 6px bottom margin. The item skeletons restate it, the sort row
// did not, so its 44px loader made the header 57px instead of 52px (`hosting-cron-loading`).
.data-table :deep(thead.sort .v-skeleton-loader__text) {
  margin: 0 0 6px;
}

// Status bar of a row (legacy `.item-bordered::after` of Themes, Plugins and the catalogues): 4px on the left edge of the row, the full row height.
.data-table :deep(tr[class*='item-bordered--'] > td:first-child) {
  position: relative;
}

.data-table :deep(tr[class*='item-bordered--'] > td:first-child::after) {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background-color: var(--v-gray-lighten2);
}

[dir='rtl'] .data-table :deep(tr[class*='item-bordered--'] > td:first-child::after) {
  left: auto;
  right: 0;
}

.data-table :deep(tr.item-bordered--green > td:first-child::after) {
  background-color: rgb(var(--v-deploy-accent));
}

.data-table :deep(tr.item-bordered--red > td:first-child::after) {
  background-color: var(--v-row-bar-red);
}

.data-table :deep(tr.item-bordered--yellow > td:first-child::after) {
  background-color: var(--v-featured-border);
}
</style>
