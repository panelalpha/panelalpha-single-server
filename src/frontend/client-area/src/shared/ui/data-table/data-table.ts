import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { TableSkeletonMobileVariant, TableSkeletonRowVariant, TableSkeletonSortVariant } from '@/shared/ui/skeletons/table-skeleton'
import type { PropType } from 'vue'
import { dataIteratorProps } from '@/shared/ui/data-iterator/use-data-iterator'
import { customTableProps } from './use-custom-table'

/** A V2 table header (`{ text, value, sortable }`) with the layout keys V4 columns take. */
export type DataTableHeader = LegacySortHeader & {
  align?: 'start' | 'center' | 'end'
  width?: number | string
}

/** How the footer counts pages: from the filtered list (`filtered`) or from the rows of the current page (`page`). */
export type DataTableFooterPages = 'filtered' | 'page'

/** A V4 column: V2 `text` / `value` become `title` / `key`. */
export interface DataTableColumn {
  title?: string
  key: string
  sortable?: boolean
  align?: 'start' | 'center' | 'end'
  width?: number | string
}

/** Status bar of a row (legacy `.item-bordered--*`): installed themes and plugins, catalogue featured rows. */
export type DataTableRowMarker = 'gray' | 'green' | 'red' | 'yellow'
/** Height of a row: 48px (`default`) or 64px (`lg`, a row with a second line). */
export type DataTableRowSize = 'default' | 'lg'
/** The mobile card: label and value fields (`default`) or the grid card without labels (`compact`, named slots). */
export type DataTableMobileVariant = 'default' | 'compact'
/** Skeleton of a loading table; each name picks the header, row and mobile variants of the `TableSkeleton*` pattern. */
export type DataTableSkeleton = 'logs' | 'config' | 'plugin' | 'backups'

export const SKELETON_VARIANTS: Record<DataTableSkeleton, { sort: TableSkeletonSortVariant, row: TableSkeletonRowVariant, mobile: TableSkeletonMobileVariant }> = {
  logs: { sort: 'logs', row: 'logs', mobile: 'logs' },
  config: { sort: 'config', row: 'config', mobile: 'config' },
  plugin: { sort: 'plugin', row: 'plugin', mobile: 'logs' },
  backups: { sort: 'backups', row: 'backups', mobile: 'backups' },
}

/** Row classes of the status bar: `item-bordered` on every row of a table with markers, plus the colour class. */
export function rowMarkerClass (marker: DataTableRowMarker | undefined, enabled: boolean): string | undefined {
  if (!enabled) {
    return undefined
  }
  return marker ? `item-bordered item-bordered--${marker}` : 'item-bordered'
}

/** A table with `cardBelow` shows the mobile card below that width; without it below the Vuetify `mobile` breakpoint. */
export function isCardWidth (cardBelow: number | undefined, width: number, mobile: boolean): boolean {
  return cardBelow ? width < cardBelow : mobile
}

/** The props `DataTable` takes, as an object so a preset (`HostingTable`) declares the same ones. */
export const dataTableProps = {
  ...dataIteratorProps,
  ...customTableProps,
  // A number or a number as text (a page hands over what its page state holds); `DataTable` reads it with `Number(...)`, default 10.
  itemsPerPage: { type: [Number, String] as PropType<number | string>, default: undefined },
  headers: { type: Array as PropType<DataTableHeader[]>, default: () => [] },
  // Column keys whose cells the caller renders through `item.<key>` slots.
  itemSlots: { type: Array as PropType<string[]>, default: () => [] },
  // The footer is on by default; a table without pagination hides it.
  hideFooter: { type: Boolean, default: false },
  itemsLoading: { type: Boolean, default: false },
  itemClass: { type: Function as PropType<(item: Record<string, unknown>) => string | undefined>, default: undefined },
  // Page count of the footer: `filtered` counts the whole filtered list, `page` the rows of the current page (both give 0 for a search that matches nothing).
  footerPages: { type: String as PropType<DataTableFooterPages>, default: 'filtered' },
  // How a search term matches a cell (V4 `custom-filter`); without it V4 matches the text of the cell value.
  customFilter: { type: Function as PropType<(value: unknown, query: string, item?: unknown) => boolean>, default: undefined },
  // Attributes of a row (desktop `tr` and mobile card), e.g. a `data-testid` for tests; no `class` key unless it is set.
  rowAttrs: { type: Function as PropType<(item: Record<string, unknown>) => Record<string, string>>, default: undefined },
  // `data-testid` of the no-results container, of the `div.actions-row` of a desktop row and of the actions field of a mobile card.
  noResultsTestid: { type: String, default: undefined },
  actionsTestid: { type: String, default: undefined },
  // `data-testid` of the table itself (the card takes the one of the host, through fallthrough).
  tableTestid: { type: String, default: undefined },
  // The label of the actions field of a mobile card sorts by the second column; a table where it does nothing turns it off.
  actionsSort: { type: Boolean, default: true },
  // Server paging: V4 `VDataTableServer` takes the rows of the page as given and does not cut, sort or filter them.
  server: { type: Boolean, default: false },
  // Mobile card below this width (legacy thresholds per table); without it the card shows below the Vuetify `mobile` breakpoint.
  cardBelow: { type: Number, default: undefined },
  // Skeleton of a loading table (header, rows and mobile card variants).
  skeleton: { type: String as PropType<DataTableSkeleton>, default: 'logs' },
  // Keys the search term matches (V4 `filterKeys`); client mode only.
  filterKeys: { type: [Array, String] as PropType<string[] | string>, default: undefined },
  // Custom sort per key (V4 `customKeySort`); client mode only.
  customKeySort: { type: Object as PropType<Record<string, (a: unknown, b: unknown) => number>>, default: undefined },
  // Key of the row value (V4 `item-value`).
  itemValue: { type: String, default: undefined },
  // Show the no-results container also over an empty list when a search term is set.
  noResultsFirst: { type: Boolean, default: false },
  // Label before the row count of the footer (`DataIteratorFooter` `perPageLabel`).
  perPageLabel: { type: String, default: undefined },
  // Show a checkbox column and the select-all checkbox (checked rows come from `checkedItems`, matched by `selectKey`).
  selectable: { type: Boolean, default: false },
  selectKey: { type: String, default: 'id' },
  // Select-all state; without it the state comes from `checkedItems` and `items`.
  allSelected: { type: Boolean, default: undefined },
  // Status bar colour of a row (`item-bordered--<marker>`); without it no row has a bar.
  rowMarker: { type: Function as PropType<(item: Record<string, unknown>) => DataTableRowMarker | undefined>, default: undefined },
  // `data-testid` of the mobile card of every row.
  cardTestid: { type: String, default: undefined },
  // The host sorts the items itself (V2 order): the header shows `sortBy`, the table does not sort.
  sortInView: { type: Boolean, default: false },
  // `true`: every page and per-page change of the table reaches the host. `false`: the table keeps its own changes (a search that
  // trims the pages) and only the footer clicks reach the host (a host that refetches on every page change it gets).
  tablePagingEvents: { type: Boolean, default: true },
  // `true`: a change of `searchTerm` keeps the page (V4 resets it to 1); the page moves only when the filtered rows no longer reach it (V4 clamps it).
  keepPageOnSearch: { type: Boolean, default: false },
  // Page count of the footer from the host (an API `last_page`); without it the table counts (`footerPages`).
  numberOfPages: { type: Number, default: undefined },
  // The footer also under an empty list.
  footerWhenEmpty: { type: Boolean, default: false },
  // The header row also under an empty list while a search term is set (a server table that is given only the rows of the page).
  headerWhenSearching: { type: Boolean, default: false },
  // Size the footer treats as the default (hidden at one page); without it the first per-page option (`DataIteratorFooter`).
  defaultItemsPerPage: { type: Number, default: undefined },
  // `data-testid` of the footer wrapper and of the header row.
  footerTestid: { type: String, default: undefined },
  headerTestid: { type: String, default: undefined },
  // `aria-sort` and the `columnheader` role on the header cells (TableCustomSort `announceSort`).
  announceSort: { type: Boolean, default: false },
  // Selection value of a row when it is not one key (Devices: `device_id`, else `name`); without it `item[selectKey]`.
  selectValue: { type: Function as PropType<(item: Record<string, unknown>) => unknown>, default: undefined },
  // A row for which it returns false has a disabled checkbox (desktop and mobile card); without it every row is selectable.
  itemSelectable: { type: Function as PropType<(item: Record<string, unknown>) => boolean>, default: undefined },
  // `data-testid` of every skeleton row of a loading table (Tasks `tasks-skeleton`, which its parity state waits for).
  skeletonTestid: { type: String, default: undefined },
  // Group header above the first row of a day or the like: the label of a row; `undefined` = no header. The items must already
  // be in display order (a server table, `sortInView`), the header stands where the label differs from the one of the row before.
  groupLabel: { type: Function as PropType<(item: Record<string, unknown>) => string | undefined>, default: undefined },
  // A row opens a details row under it (`#expanded` slot) on click, Enter and Space; one row at a time, the table keeps its key (`expandedKey`).
  expandable: { type: Boolean, default: false },
  // Key (`itemValue`, default `id`) of the open row; `v-model:expanded-key`. `null` = none. The table clears it when the row leaves `items`.
  expandedKey: { type: [String, Number] as PropType<string | number | null>, default: null },
  // `lg` is a 64px row (two-line cells), `default` the 48px one of every table.
  rowSize: { type: String as PropType<DataTableRowSize>, default: 'default' },
  // `compact`: the mobile card is the grid card (`MobileTableCard` `variant`), filled through the `mobile-title`, `mobile-status`, `mobile-full`,
  // `mobile-meta` and `mobile-meta-end` slots, and it takes the class of its row (`itemClass`, `rowMarker` bar). `default`: unchanged card.
  // `compact` has no checkbox and no actions field: it does not go with `selectable` or the `actions` / `mobile-actions` slots.
  mobileVariant: { type: String as PropType<DataTableMobileVariant>, default: 'default' },
}

/** V2 headers `{ text, value, sortable, align, width }` become V4 columns `{ title, key, ... }`. */
export function toV4Headers (headers: DataTableHeader[]): DataTableColumn[] {
  return headers.map(header => ({
    title: header.text,
    key: header.value,
    sortable: header.sortable,
    align: header.align,
    width: header.width,
  }))
}

/**
 * The number of pages the footer shows. V2 counted 0 pages for a search that matches nothing (the footer, page 1 and the per-page
 * buttons, stayed); V4 says 1. `itemsLength` is the filtered list, `pageItemsLength` the rows on the current page.
 */
export function footerPageCount (mode: DataTableFooterPages, pageCount: number, itemsLength: number, pageItemsLength: number): number {
  const empty = mode === 'page' ? pageItemsLength === 0 : itemsLength === 0
  return empty ? 0 : pageCount
}

/** Attributes and handlers of a row: strings for the DOM, functions for `onClick` / `onKeydown`. */
export type DataTableRowAttrs = Record<string, string | ((event: Event) => void)>

/** What a row of an `expandable` table needs to know about itself. */
export interface DataTableRowExpand {
  /** The row is the open one. */
  open: boolean
  /** Id of the details row, set as `aria-controls` only while the row is open. */
  controls?: string
  toggle: () => void
}

/**
 * The header of the group that starts at `items[index]`: its label when the label differs from the one of the row before (or the row
 * is the first), else `undefined`. A row without a label starts no group.
 */
export function groupHeaderBefore (
  items: Record<string, unknown>[],
  index: number,
  groupLabel: ((item: Record<string, unknown>) => string | undefined) | undefined,
): string | undefined {
  const item = items[index]
  if (!groupLabel || !item) {
    return undefined
  }
  const label = groupLabel(item)
  if (label === undefined) {
    return undefined
  }
  const previous = index > 0 ? groupLabel(items[index - 1]!) : undefined
  return label === previous ? undefined : label
}

/** What does its own thing on a click inside a toggling row: links, buttons, fields, labels, disclosure and the matching ARIA roles. */
const ROW_INTERACTIVE = [
  'a', 'button', 'input', 'select', 'textarea', 'label', 'summary',
  '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="switch"]', '[role="menuitem"]',
].join(', ')

/**
 * A click toggles the row only when it did not land on a link, a button, a field or another interactive element inside the row (the
 * project link, a copy button): those do their own thing. The closest match has to lie within the row itself. A click that ends a text
 * selection (drag over a task name to copy it) does not toggle either.
 */
export function isRowToggleTarget (event: Event): boolean {
  if (globalThis.getSelection?.()?.toString()) {
    return false
  }
  const target = event.target
  if (!(target instanceof Element)) {
    return true
  }
  const interactive = target.closest(ROW_INTERACTIVE)
  const row = event.currentTarget
  return !interactive || (row instanceof Node && !row.contains(interactive))
}

/** Enter and Space on the row itself (not on something inside it) toggle it; Space does not scroll the page. */
export function toggleOnKeydown (event: KeyboardEvent, toggle: () => void): void {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
    return
  }
  event.preventDefault()
  toggle()
}

/**
 * V2 `item-class` returned a class string for the row; V4 takes it through `row-props`. No `class` key without a value. `rowAttrs` adds
 * attributes (a `data-testid`); a `class` of it is joined with the one of `itemClass`. `expand` makes the row a toggle of its details row
 * (`tabindex`, `aria-expanded`, click, Enter and Space).
 */
export function dataTableRowProps (
  item: Record<string, unknown>,
  itemClass?: (item: Record<string, unknown>) => string | undefined,
  rowAttrs?: (item: Record<string, unknown>) => Record<string, string>,
  expand?: DataTableRowExpand,
): DataTableRowAttrs {
  const attrs: DataTableRowAttrs = { ...rowAttrs?.(item) }
  const rowClass = [itemClass?.(item), attrs.class].filter(Boolean).join(' ')
  if (rowClass) {
    attrs.class = rowClass
  } else {
    delete attrs.class
  }
  if (expand) {
    attrs.tabindex = '0'
    attrs['aria-expanded'] = String(expand.open)
    if (expand.open && expand.controls) {
      attrs['aria-controls'] = expand.controls
    }
    attrs.onClick = (event: Event) => {
      if (isRowToggleTarget(event)) {
        expand.toggle()
      }
    }
    attrs.onKeydown = (event: Event) => toggleOnKeydown(event as KeyboardEvent, expand.toggle)
  }
  return attrs
}
