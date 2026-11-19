<template>
  <data-table
    :actions-sort="false"
    announce-sort
    class="services-table"
    data-testid="services-table"
    :filter-keys="SERVICES_SEARCH_KEYS"
    footer-pages="page"
    footer-when-empty
    :headers="headers"
    :item-slots="cellKeys"
    :items="services"
    :items-loading="loading"
    :items-per-page="itemsPerPage"
    :page="page"
    :per-page-label="t('table.footer.plan')"
    :possible-items-per-page="possibleItemsPerPage"
    :search-term="searchTerm"
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    :table-paging-events="false"
    @clear-filters="emit('update:search-term', '')"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <template
      v-for="key in cellKeys"
      :key="key"
      #[`item.${key}`]="{ item }"
    >
      <ServiceLimitsCell
        v-if="key === 'limits'"
        :state="limitsStateOf(asRow(item))"
      />

      <services-table-cell
        v-else
        :billing-enabled="billingEnabled"
        :column="key"
        :service="asRow(item)"
      />
    </template>

    <template #mobile="{ item }">
      <MobileTableField
        v-for="header in headers.filter(header => header.value !== 'actions')"
        :key="header.value"
        :label="typeof header.label === 'string' ? header.label : t(`table.header.${header.text}`)"
        :sortable="header.sortable"
        @sort="onFieldSort(header)"
      >
        <ServiceLimitsCell
          v-if="header.value === 'limits'"
          :state="limitsStateOf(asRow(item))"
        />

        <services-table-cell
          v-else
          :billing-enabled="billingEnabled"
          :column="header.value"
          :service="asRow(item)"
        />
      </MobileTableField>
    </template>

    <!-- Without billing (and without the Limits action of a paid edition) there is no actions slot at all, so the mobile card
         has no empty Actions field either. -->
    <template
      v-if="hasActions"
      #actions="{ row }"
    >
      <ServiceLimitsButton
        v-if="limitsInstance(limitsStateOf(asRow(row)))"
        :instance="limitsInstance(limitsStateOf(asRow(row)))!"
        @limits-saved="emit('limits-saved', $event)"
        @limits-updated="(id, resources) => emit('limits-updated', id, resources)"
      />

      <cancel-service-button
        v-if="billingEnabled && asRow(row).status !== 'cancelled'"
        class="v-btn"
        :service="asRow(row)"
        @service-cancelled="emit('service-cancelled', $event)"
      />

      <AppButton
        v-if="billingEnabled && asRow(row).plan_upgrade_link"
        :color="upgradeButtonColor(asRow(row))"
        data-testid="services-upgrade"
        :href="asRow(row).plan_upgrade_link!"
        kind="primary"
        size="small"
        target="_blank"
      >
        <span :class="asRow(row).is_trial ? 'text-white' : ''">{{ t('button.upgrade') }}</span>
      </AppButton>
    </template>

    <!-- Empty `services` is no-data, a search that filters everything out is no-results. -->
    <template #no-data>
      <template v-if="services.length === 0">
        <EmptyState
          v-if="!loading && !searchTerm"
          data-testid="services-empty"
          :title="t('message.emptyTable.services.title')"
        />

        <data-iterator-no-results-container
          v-if="searchTerm"
          data-testid="services-no-results"
          :search-term="searchTerm"
          @clear-all-filters="emit('update:search-term', '')"
        />
      </template>
    </template>

    <!-- Legacy had no `no-results` slot, so V2 showed its default text for a search that hides a non-empty list. -->
    <template #no-results>
      <div
        class="services-table__no-results"
        data-testid="services-no-matches"
      >
        {{ vuetifyT('$vuetify.dataIterator.noResultsText') }}
      </div>
    </template>
  </data-table>
</template>

<script lang="ts" setup>
  import type { LimitsSaved, ProjectState } from './service-limits'
  import type { ServiceRow } from './services.types'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { RawProjectResources } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useLocale } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import CancelServiceButton from './CancelServiceButton.vue'
  import { limitsInstance } from './service-limits'
  import ServiceLimitsButton from './ServiceLimitsButton.vue'
  import ServiceLimitsCell from './ServiceLimitsCell.vue'
  import { upgradeButtonColor } from './services-cells'
  import { SERVICES_SEARCH_KEYS } from './services-list'
  import ServicesTableCell from './ServicesTableCell.vue'

  const props = withDefaults(defineProps<{
    services: ServiceRow[]
    loading?: boolean
    searchTerm?: string
    itemsPerPage?: number | string
    possibleItemsPerPage?: Array<Array<number | string>>
    page?: number
    sortBy?: LegacySortHeader | false
    sortDesc?: boolean
    billingEnabled?: boolean
    /** Paid editions: the Limits column and the Manage limits action of the plan's project (as Project details > Limits). */
    limitsEnabled?: boolean
    /** The fetched project of a plan row (`useServiceProjects`); nothing while it is not asked for. */
    limitsStateOf?: (service: ServiceRow) => ProjectState | undefined
  }>(), {
    loading: false,
    searchTerm: '',
    itemsPerPage: 10,
    possibleItemsPerPage: () => [[10, 20, 30]],
    page: 1,
    sortBy: false,
    sortDesc: true,
    billingEnabled: true,
    limitsEnabled: false,
    limitsStateOf: () => undefined,
  })

  const emit = defineEmits<{
    'update:search-term': [value: string]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'service-cancelled': [id: number]
    'limits-saved': [saved: LimitsSaved]
    'limits-updated': [id: number, resources: RawProjectResources]
  }>()

  const { t } = useTranslation()
  const { t: vuetifyT } = useLocale()

  const SERVICE_CELL_KEYS = ['plan_name', 'instances_count', 'instances']
  const cellKeys = computed(() => props.limitsEnabled ? [...SERVICE_CELL_KEYS, 'limits'] : SERVICE_CELL_KEYS)

  function asRow (item: unknown): ServiceRow {
    return item as ServiceRow
  }

  // A card field sorts like the header of the desktop table (`TableCustomSort`): the same key flips the order, another key sorts by it.
  // The card has no header row under the `mobile` breakpoint, so the labels keep the sort.
  function onFieldSort (header: LegacySortHeader): void {
    const key = typeof props.sortBy === 'string' ? props.sortBy : (props.sortBy ? props.sortBy.value : undefined)
    if (key === header.value) {
      emit('update:sort-desc', !props.sortDesc)
    } else {
      emit('update:sort-by', header)
    }
  }

  // Legacy header texts go through `$t` and then `table.header.*` (`TableCustomSort`).
  // The Actions column holds the billing buttons and, in a paid edition, the Limits action; with neither it goes away.
  const hasActions = computed(() => props.billingEnabled || props.limitsEnabled)

  const headers = computed<LegacySortHeader[]>(() => [
    { text: t('plan_name'), value: 'plan_name', sortable: true },
    { text: t('instance_limit'), value: 'instances_count', sortable: true },
    { text: t('sites'), value: 'instances', sortable: true },
    // Paid editions: the limits of the plan's project. Not in legacy, so the header has its own text (`label`) instead of `table.header.*`.
    ...(props.limitsEnabled ? [{ text: 'limits', label: t('table.header.limits', { defaultValue: 'Limits' }), value: 'limits', sortable: false }] : []),
    ...(hasActions.value ? [{ text: t('actions'), value: 'actions', align: 'end' as const }] : []),
  ])
</script>

<style lang="scss" scoped>
.services-table__no-results {
  padding: 16px;
  text-align: center;
}
</style>
