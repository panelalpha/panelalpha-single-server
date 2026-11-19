<template>
  <div
    class="d-flex flex-nowrap data-iterator-filter-controls"
    :class="[
      disabled ? 'data-iterator-filter-controls--disabled' : '',
      lgAndDown && fullWidthLg ? 'w-100' : '',
      mdAndDown && fullWidthMd ? 'w-100' : '',
    ]"
  >
    <div
      v-if="filter"
      class="data-iterator-filter-controls__item"
    >
      <data-iterator-filter
        :applied-labels="filterLabels"
        :labels="availableLabels"
        @update:applied-labels="applyFilterLabels"
      />
    </div>

    <div
      v-if="sortBy && keys"
      class="data-iterator-filter-controls__item data-iterator-filter-controls__item--sort-instances"
    >
      <data-iterator-sort-by
        :keys="keys"
        :sort-by="sortBy"
        :sort-desc="sortDesc"
        @update:sort-by="emit('update:sort-by', $event)"
      />
    </div>

    <div
      v-if="showSearchTerm"
      class="data-iterator-filter-controls__item"
    >
      <data-iterator-search
        v-model="searchTerm"
        :aria-label="searchPlaceholder"
        :full-width-search="fullWidthSearch"
        :placeholder="searchPlaceholder"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { LegacySortHeader } from './sort-model'
  import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
  import { useDisplay } from 'vuetify'
  import DataIteratorFilter from './DataIteratorFilter.vue'
  import DataIteratorSearch from './DataIteratorSearch.vue'
  import DataIteratorSortBy from './DataIteratorSortBy.vue'

  withDefaults(defineProps<{
    disabled?: boolean
    sortBy?: LegacySortHeader | false
    keys?: LegacySortHeader[] | boolean
    // Legacy prop, forwarded to the sort select and never read there.
    sortDesc?: boolean
    showSearchTerm?: boolean
    filter?: boolean
    filterLabels?: LabelChipItem[]
    // Replaces the Vuex read `$store.state.LabelsModule.availableLabels`.
    availableLabels?: LabelChipItem[]
    fullWidthSearch?: boolean
    /** The search field's hint (and its accessible name); the generic "Search" without it. */
    searchPlaceholder?: string
    fullWidthLg?: boolean
    fullWidthMd?: boolean
  }>(), {
    disabled: false,
    sortBy: false,
    keys: false,
    sortDesc: false,
    showSearchTerm: true,
    filter: false,
    filterLabels: () => [],
    availableLabels: () => [],
    fullWidthSearch: false,
    searchPlaceholder: undefined,
    fullWidthLg: true,
    fullWidthMd: false,
  })

  const emit = defineEmits<{
    'update:sort-by': [value: LegacySortHeader]
    'update:filter-labels': [labels: LabelChipItem[]]
  }>()

  // Legacy `searchTerm` prop + `update:searchTerm` emit.
  const searchTerm = defineModel<string>('searchTerm', { default: '' })

  const { lgAndDown, mdAndDown } = useDisplay()

  function applyFilterLabels (data: LabelChipItem[]): void {
    emit('update:filter-labels', data)
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.data-iterator-filter-controls {
  position: relative;
  transition: opacity 0.24s ease;

  &__item {
    display: flex;

    &:not(:last-child) {
      margin-right: 16px;
    }

    &:last-child:not(:first-child) {
      margin-left: auto;
    }
  }

  &--disabled {
    pointer-events: none;
    cursor: default;
    opacity: 0.5;
  }
}

// V2 `.v-input__control .v-input__slot .v-input__prepend-inner`.
.v-input :deep(.v-field__prepend-inner) {
  margin-top: 12px;
}

@media (max-width: map.get(v.$grid-breakpoints, sm)) {
  .data-iterator-filter-controls {
    &__item {
      &:not(:last-child) {
        margin-right: 8px;
      }
    }
  }
}

[dir=rtl] {
  .data-iterator-filter-controls {
    &__item {
      &:not(:last-child) {
        margin-right: 0px;
        margin-left: 16px;
      }
    }
  }
}
</style>
