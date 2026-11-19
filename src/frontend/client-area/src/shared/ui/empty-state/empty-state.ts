// Variants of the kit empty state. The variant is the place of the empty state, each with one look:
// `table` the no-data cell of a table or an empty list card (legacy `TableFullScreenMessage`), `card` a panel without a table (legacy
// `LogsNoData` / `InstanceNoData` `nodata-container`), `compact` a text line in a table cell (Git logs, Containers), `intro` a full-page card
// (legacy `NoAvailableInvoicesView` / `NoAvailableHostingView`, `_noData.scss`), `welcome` the empty project list (legacy `InstanceNoData`:
// h1 look, centred, the look before the kit), `panel` the empty card of Connect AI tokens and
// Reseller API (legacy `v-card-text` with an h6, no table) and `cell` the empty rows of Reseller Users and Logs and the Connect AI activity log
// (legacy `.no-data-container`); both have the OLD look on every width, not the large `table` one.
export const EMPTY_STATE_VARIANTS = ['table', 'card', 'compact', 'intro', 'welcome', 'panel', 'cell'] as const

export type EmptyStateVariant = (typeof EMPTY_STATE_VARIANTS)[number]

// The heading level of the legacy copy of each variant; a consumer keeps its own level through `titleTag` (a11y), the look stays the variant's.
const TITLE_TAGS: Record<EmptyStateVariant, string> = {
  table: 'h3',
  card: 'p',
  compact: 'p',
  intro: 'h4',
  welcome: 'h1',
  panel: 'h6',
  cell: 'h6',
}

export function emptyStateTitleTag (variant: EmptyStateVariant): string {
  return TITLE_TAGS[variant]
}
