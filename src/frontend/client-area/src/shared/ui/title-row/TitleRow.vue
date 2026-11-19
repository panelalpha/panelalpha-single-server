<template>
  <v-row class="title-row">
    <slot />
  </v-row>
</template>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Title row of a page: the heading column and the filter column. Replaces the `title-row.scss` sheet that ten screens pulled into their
// own scoped styles. The columns are slot content (they carry the screen's scope id, not this one), so they are reached with `:deep`.
//
// Legacy global `.row:not(.row--small, .no-gutters) { margin: -16px }` and the 12px `.col` padding (`_general.scss`), both omitted from the
// global layer because V4 `.v-row` / `.v-col` space things on their own. The title row keeps the legacy offsets: with the global `0 4px`
// row padding they put the heading on the column edge and the filter column's own 16px padding 4px inside the right edge.
.v-row.title-row {
  margin: -16px;

  // V4 `.v-row` spaces its columns by `gap` (24px); V2 had none, so below `lg` the columns lost 24px that the button column needs.
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;

  > :deep(.v-col) {
    padding: 12px;
  }

  > :deep(.v-col.page-title__filter-controls) {
    padding-inline: 16px;
  }

  // Legacy `_pageTitle.scss` below `lg`: no bottom padding on the filter column (the padding above would win over the global
  // `.page-title__filter-controls` rule).
  @media (max-width: map.get(v.$grid-breakpoints, lg)) {
    > :deep(.v-col.page-title__filter-controls) {
      padding-bottom: 0;
    }
  }
}
</style>
