<template>
  <v-container class="px-0">
    <v-row>
      <v-col cols="12">
        <!-- On the kit `DataTable`. Server mode (V2 `server-items-length`): the view cuts the page,
             so the footer counts `items-total`, not the rows. -->
        <DataTable
          :checked-items="checkedItems"
          :headers="headers"
          :item-slots="['title', 'version', 'status']"
          :items="(items as unknown as Record<string, unknown>[])"
          :items-loading="loading"
          :items-per-page="itemsPerPage"
          :items-total="itemsTotal"
          no-results-first
          :page="page"
          :per-page-label="t('table.footer.plugin')"
          :possible-items-per-page="possibleItemsPerPage"
          :row-marker="pluginMarker"
          :search-term="searchTerm"
          select-key="name"
          selectable
          server
          skeleton="plugin"
          :sort-by="sortBy"
          :sort-desc="sortDesc"
          @clear-filters="emit('clear-filters')"
          @update:check-all="emit('update:check-all', $event)"
          @update:checked-items="emit('update:checked-items', $event)"
          @update:items-per-page="emit('update:items-per-page', $event)"
          @update:page="emit('update:page', $event)"
          @update:sort-by="emit('update:sort-by', $event)"
          @update:sort-desc="emit('update:sort-desc', $event)"
        >
          <template #item.title="{ item }">
            <div class="d-flex flex-column">
              <span class="font-weight-bold">{{ asPlugin(item).title }}</span>

              <div class="d-flex">
                <div
                  v-safe-html:external="truncateDescription(asPlugin(item).description)"
                  class="text-truncate plugin-description"
                />

                <a
                  v-if="(asPlugin(item).description ?? '').length > 100"
                  class="truncate-text ml-1"
                  @click="emit('action-button-read-more', asPlugin(item))"
                >
                  {{ t('button.readMore') }}
                </a>
              </div>
            </div>
          </template>

          <template #item.version="{ item }">
            <v-icon
              v-if="asPlugin(item).update !== 'available'"
              color="primary"
              icon="$alertok"
              size="16"
            />

            <v-icon
              v-else
              color="error"
              icon="$alertwarning"
              size="16"
            />

            <span class="ml-2">{{ asPlugin(item).version }}</span>
          </template>

          <template #item.status="{ item }">
            <StatusLabel
              :status="asPlugin(item).status === 'active' ? 'primary' : 'gray'"
              :value="asPlugin(item).status === 'active' ? t('message.status.activated') : t('message.status.disabled')"
            />
          </template>

          <template #actions="{ row }">
            <v-tooltip
              v-if="asPlugin(row).status === 'inactive'"
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
              :z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <div v-bind="activatorProps">
                  <AppButton
                    :aria-label="t('button.plugin.activate')"
                    :disabled="asPlugin(row).activation_disabled"
                    kind="row-action"
                    @click="emit('action-button-activate', asPlugin(row))"
                  >
                    <v-icon icon="$checkcircle" />
                  </AppButton>
                </div>
              </template>

              <span v-if="asPlugin(row).activation_disabled">{{ t('tooltip.instance.plugin.activationIsNotAllowed') }}</span>
              <span v-else>{{ t('button.plugin.activate') }}</span>
            </v-tooltip>

            <AppButton
              v-else
              :aria-label="t('button.plugin.deactivate')"
              kind="row-action"
              :tooltip="t('button.plugin.deactivate')"
              @click="emit('action-button-deactivate', asPlugin(row))"
            >
              <v-icon icon="$xcircle" />
            </AppButton>

            <AppButton
              :aria-label="t('button.plugin.update')"
              :color="asPlugin(row).update === 'available' ? 'error' : undefined"
              :disabled="asPlugin(row).update !== 'available'"
              kind="row-action"
              :tooltip="t('button.plugin.update')"
              @click="emit('action-button-update', asPlugin(row))"
            >
              <v-icon icon="$update" />
            </AppButton>

            <AppButton
              :aria-label="t('button.plugin.delete')"
              kind="row-action"
              :tooltip="t('button.plugin.delete')"
              @click="emit('action-button-delete', asPlugin(row))"
            >
              <v-icon icon="$thrash" />
            </AppButton>
          </template>
        </DataTable>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { DataTableHeader, DataTableRowMarker } from '@/shared/ui/data-table/data-table'
  import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'
  // Headers are the legacy set; the
  // select column, the sort row and the status bar come from the kit `DataTable`, as in `ThemeTable`.
  import { useTranslation } from 'i18next-vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { pluginDefaultSort } from './installed-plugins'
  import { truncateDescription } from './truncate-description'

  withDefaults(defineProps<{
    items?: InstalledPlugin[]
    // Names of the checked plugins on the current page; the page owns the list.
    checkedItems?: Array<string | number>
    loading?: boolean
    sortBy?: LegacySortBy
    sortDesc?: boolean
    page?: number
    itemsPerPage?: number
    itemsTotal?: number
    possibleItemsPerPage?: Array<Array<number | string>>
    searchTerm?: string
  }>(), {
    items: () => [],
    checkedItems: () => [],
    loading: false,
    sortBy: false,
    sortDesc: false,
    page: 1,
    itemsPerPage: 8,
    itemsTotal: undefined,
    possibleItemsPerPage: () => [[8, 16, 24]],
    searchTerm: '',
  })

  const emit = defineEmits<{
    'update:check-all': [value: boolean]
    'update:checked-items': [value: unknown]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'clear-filters': []
    'action-button-activate': [item: InstalledPlugin]
    'action-button-deactivate': [item: InstalledPlugin]
    'action-button-update': [item: InstalledPlugin]
    'action-button-delete': [item: InstalledPlugin]
    'action-button-read-more': [item: InstalledPlugin]
  }>()

  const { t } = useTranslation()

  const headers: DataTableHeader[] = [
    { text: '', value: 'select', sortable: false },
    pluginDefaultSort,
    { text: 'version', value: 'version', sortable: false },
    { text: 'status', value: 'status', sortable: true },
    { text: '', value: 'actions', sortable: false, align: 'end' },
  ]

  const asPlugin = (row: unknown) => row as InstalledPlugin

  // Legacy `item-bordered--green` for an active plugin wins over `--red` (update available), as in the legacy CSS order; others keep the grey bar.
  function pluginMarker (item: Record<string, unknown>): DataTableRowMarker {
    const plugin = asPlugin(item)
    if (plugin.status === 'active') {
      return 'green'
    }
    return plugin.update === 'available' ? 'red' : 'gray'
  }
</script>

<style lang="scss" scoped>
// V2 `::v-deep` becomes `:deep()`; the RTL block is `[dir='rtl']`.
// Inline `max-width: 450px` on the row description as a class; value 1:1.
.plugin-description {
  max-width: 450px;
}

// Legacy `.text-truncate { text-overflow: ellipsis " " }` was invalid CSS and never applied; the `text-truncate` utility covers the cell.

.truncate-text {
  color: rgb(var(--v-theme-info));
  font-weight: 700;
}
</style>
