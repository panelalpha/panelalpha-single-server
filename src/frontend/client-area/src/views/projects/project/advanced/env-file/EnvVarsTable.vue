<template>
  <!-- The key / value / actions table of the page, on the kit `DataTable`.
       The columns are local (one consumer). -->
  <DataTable
    :actions-sort="false"
    data-testid="env-vars-table"
    :filter-keys="SEARCH_KEYS"
    footer-pages="page"
    :headers="headers"
    :item-slots="['key', 'value']"
    item-value="line"
    :items="(items as unknown as Record<string, unknown>[])"
    :items-loading="itemsLoading"
    :items-per-page="itemsPerPage"
    :page="page"
    :possible-items-per-page="POSSIBLE_ITEMS_PER_PAGE"
    :search-term="searchTerm"
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    @clear-filters="emit('clear-filters')"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <!-- Empty `items` is no-data, a search that matches nothing is no-results (the kit shows it). -->
    <template #no-data>
      <slot name="no-data" />
    </template>

    <template #item.key="{ item }">
      <b>{{ asRow(item).key }}</b>
    </template>

    <template #item.value="{ item }">
      <div class="d-flex align-center env-value">
        <span class="env-value__text">{{ displayValue(asRow(item), true) }}</span>
      </div>
    </template>

    <!-- The actions cell: Edit and Delete, none for a readonly (multi-line) variable. Labels come from tooltips only (legacy had none). -->
    <template #actions="{ row }">
      <template v-if="!asRow(row).readonly">
        <AppButton
          :aria-label="t('button.config.edit')"
          kind="row-action"
          :tooltip="t('button.config.edit')"
          tooltip-class="env-vars-tooltip"
          :tooltip-offset="14"
          @click="emit('edit-item', asRow(row))"
        >
          <v-icon icon="$edit" />
        </AppButton>

        <AppButton
          :aria-label="t('button.config.delete')"
          kind="row-action"
          :tooltip="t('button.config.delete')"
          tooltip-class="env-vars-tooltip"
          :tooltip-offset="14"
          @click="emit('delete-item', asRow(row))"
        >
          <v-icon icon="$thrash" />
        </AppButton>
      </template>
    </template>

    <!-- Mobile item: the key and the value; the actions field is the kit's. -->
    <template #mobile="{ item }">
      <MobileTableField
        :label="t('table.header.key')"
        :value="asRow(item).key"
        @sort="sortByHeader(0)"
      />

      <MobileTableField
        :label="t('table.header.value')"
        value-class="d-flex align-center"
      >
        <span class="bold p-3 env-value__text">{{ displayValue(asRow(item), true) }}</span>
      </MobileTableField>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { EnvVariable } from './env-vars'
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  // Headers, the value column and its reveal, the actions,
  // the mobile item and the footer. Search matches the key only (the value and actions columns are not filterable in legacy).
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import { displayValue } from './env-vars-modals'

  withDefaults(defineProps<{
    items?: EnvVariable[]
    itemsLoading?: boolean
    itemsPerPage?: number | string
    page?: number
    searchTerm?: string
    sortBy?: LegacySortBy
    sortDesc?: boolean
  }>(), {
    items: () => [],
    itemsLoading: false,
    itemsPerPage: 8,
    page: 1,
    searchTerm: '',
    sortBy: false,
    sortDesc: false,
  })

  const emit = defineEmits<{
    'edit-item': [item: EnvVariable]
    'delete-item': [item: EnvVariable]
    'clear-filters': []
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
  }>()

  const { t } = useTranslation()

  const POSSIBLE_ITEMS_PER_PAGE = [[8, 16, 24]]
  // Search: the `key` column only (the `value` and `actions` headers are `filterable: false`).
  const SEARCH_KEYS = ['key']

  // A key column that sorts, a value and an actions column that do not.
  const headers: LegacySortHeader[] = [
    { text: 'key', value: 'key', sortable: true },
    { text: 'value', value: 'value' },
    { text: 'actions', value: 'actions' },
  ]

  function asRow (item: unknown): EnvVariable {
    return item as EnvVariable
  }

  // Legacy mobile labels emit `update:sortBy` with the table's own header object at that index.
  function sortByHeader (index: number): void {
    const header = headers[index]
    if (header) {
      emit('update:sort-by', header)
    }
  }
</script>

<style lang="scss">
// Legacy V2 tooltip text is 22px (`.v-tooltip__content`), V4 gives 1.6 (22.4px): a 0.4px taller tooltip. The content is teleported, so
// this rule cannot be scoped to the table; the class is `tooltip-class="env-vars-tooltip"` of the two row `AppButton`s only.
.v-overlay__content.env-vars-tooltip {
  line-height: 22px;
}
</style>

<style lang="scss" scoped>
.env-value__text {
  word-break: break-all;
}
</style>
