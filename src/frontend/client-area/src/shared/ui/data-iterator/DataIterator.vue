<template>
  <v-container class="px-0">
    <v-row class="mx-0">
      <v-data-iterator
        :items="loading ? [] : items"
        :items-length="itemsTotal"
        :items-per-page="itemsPerPage ?? 10"
        :loading="loading"
        :must-sort="!sortDisabled"
        :page="page"
        :search="searchTerm"
        :sort-by="sortDisabled ? [] : toV4SortBy(sortBy, sortDesc)"
        @update:items-per-page="emit('update:items-per-page', $event)"
        @update:page="emit('update:page', $event)"
      >
        <template #no-data>
          <!-- Legacy `searchTerm || filterLabels` is always true for a list that passes `[]` (the project list), so its own no-data
               slot never showed and an empty dashed frame did instead; only a real filter picks the no-results container. -->
          <data-iterator-no-results-container
            v-if="searchTerm || filterLabels?.length"
            :filter-labels="filterLabels"
            :search-term="searchTerm"
            @clear-all-filters="emit('clear-all-filters')"
          />

          <slot
            v-else
            name="no-data"
          />
        </template>

        <template #loader>
          <slot name="loading" />
        </template>

        <template #default="slotProps">
          <v-container class="px-0">
            <v-row class="responsive-row">
              <template v-if="listStyle === 0">
                <slot
                  :filtered-keys="filteredKeys"
                  :items="rawItems(slotProps.items)"
                  name="grid"
                />
              </template>

              <template v-if="listStyle === 1">
                <slot
                  :filtered-keys="filteredKeys"
                  :items="rawItems(slotProps.items)"
                  name="list"
                />
              </template>
            </v-row>
          </v-container>
        </template>

        <template
          v-if="showFooter"
          #footer
        >
          <data-iterator-footer
            :items-per-page="itemsPerPage"
            :list-style="listStyle"
            :number-of-pages="numberOfPages"
            :page="page"
            :possible-items-per-page="possibleItemsPerPage"
            @update:items-per-page="emit('update:items-per-page', $event)"
            @update:page="emit('update:page', $event)"
          />
        </template>
      </v-data-iterator>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
  import type { LegacySortHeader } from './sort-model'
  import type { PropType } from 'vue'
  import DataIteratorFooter from './DataIteratorFooter.vue'
  import DataIteratorNoResultsContainer from './DataIteratorNoResultsContainer.vue'
  import { toV4SortBy } from './sort-model'
  import { dataIteratorProps, useDataIterator } from './use-data-iterator'

  // Runtime props: the shared mixin props object, with the legacy component-level overrides
  // (`sortBy: Object`, `sortDesc: Boolean` without the mixin default, `filterLabels`, `sortDisabled`, `showFooter`).
  const props = defineProps({
    ...dataIteratorProps,
    sortBy: { type: Object as PropType<LegacySortHeader>, default: undefined },
    sortDesc: { type: Boolean, default: false },
    sortDisabled: { type: Boolean, default: false },
    filterLabels: { type: Array as PropType<unknown[]>, default: undefined },
    showFooter: { type: Boolean, default: true },
  })

  const emit = defineEmits<{
    'clear-all-filters': []
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
  }>()

  const { numberOfPages, filteredKeys } = useDataIterator(props)

  // V4 hands the default slot wrapped items (`{ raw, ... }`); legacy slots received the plain items.
  function rawItems (items: readonly { raw: unknown }[]): unknown[] {
    return items.map(item => item.raw)
  }
</script>

<style lang="scss" scoped>
// V2 `.container` padding is 12px (`px-0` then clears the sides); V4 `.v-container` is 16px. The `px-0` utility is unlayered, `!important` and (0,2,0), so it wins over this rule; the side padding here is only the fallback.
.v-container {
  padding: 12px 0;
}

// Legacy `_general.scss` `.row:not(.row--small, .no-gutters)`: -16px row margin and 16px `.col-12/-6/-4/-3` padding (V2 `.col`
// 12px). V4 spaces columns with `gap`, so the gap goes to 0 and the column width calc follows `--v-col-gap-*`. The rule is scoped
// here (not global).
.v-container :deep(.v-row:not(.v-row--no-gutters, .v-row--density-compact, .v-row--density-comfortable, .row--small)) {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;

  margin-left: -16px;
  margin-right: -16px;
  margin-top: -16px;
  margin-bottom: -16px;

  > .v-col {
    padding: 12px;
  }

  > .v-col-12,
  > .v-col-6,
  > .v-col-4,
  > .v-col-3 {
    padding: 16px;
  }
}

.v-data-iterator {
  width: 100%;

  // Project classes set by the host screens on its own `v-row`s (V2 `.row`, V4 `.v-row`; `.col` is `.v-col`).
  :deep(.row--grid) {
    margin: -16px;

    .v-col {
      padding: 16px !important;
    }
  }

  :deep(.row--list) {
    margin: -20px;

    .v-col {
      padding: 20px !important;
    }
  }
}
</style>
