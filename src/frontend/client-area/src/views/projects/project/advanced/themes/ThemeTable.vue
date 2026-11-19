<template>
  <!-- On the kit `DataTable`. The page composable cuts and sorts the rows (server), so the
       table gets only the current page; V4 must not cut or sort them again (legacy had the same sort by `v-data-table`). -->
  <DataTable
    :checked-items="checkedItems"
    :headers="headers"
    :item-slots="['title', 'version', 'status']"
    item-value="name"
    :items="(items as unknown as Record<string, unknown>[])"
    :items-loading="loading"
    :items-per-page="itemsPerPage"
    :items-total="itemsTotal"
    no-results-first
    :page="page"
    :per-page-label="t('table.footer.theme')"
    :possible-items-per-page="possibleItemsPerPage"
    :row-marker="themeMarker"
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
      <div class="d-flex name-item">
        <v-avatar
          class="mr-6"
          color="white"
          :size="64"
        >
          <v-img :src="themeScreenshotSrc(instanceId, asTheme(item).name)" />
        </v-avatar>

        <div class="d-flex flex-column">
          <span class="font-weight-bold p-3">{{ title(asTheme(item)) }}</span>

          <span class="p-4 item-desc base--text">
            {{ description(asTheme(item)) }}
            <a
              v-if="hasReadMore(asTheme(item))"
              class="truncate-text"
              @click="emit('action-button-read-more', asTheme(item))"
            >
              <span class="base--text font-weight-regular">... </span>
              {{ t('button.readMore') }}
            </a>
          </span>
        </div>
      </div>
    </template>

    <template #item.version="{ item }">
      <div class="d-flex align-center">
        <v-icon
          v-if="asTheme(item).update !== 'available'"
          color="success"
          icon="$alertok"
          size="16"
        />

        <v-icon
          v-else
          color="error"
          icon="$alertwarning"
          size="16"
        />

        <span class="ml-2 font-weight-bold">{{ asTheme(item).version }}</span>
      </div>
    </template>

    <template #item.status="{ item }">
      <StatusLabel
        :status="asTheme(item).status === 'active' ? 'primary' : 'gray'"
        :value="asTheme(item).status === 'active' ? t('message.status.activated') : t('message.status.disabled')"
      />
    </template>

    <template #actions="{ row }">
      <AppButton
        v-if="asTheme(row).status === 'inactive'"
        :aria-label="t('tooltip.instance.theme.activate')"
        kind="row-action"
        :tooltip="t('tooltip.instance.theme.activate')"
        @click="emit('action-button-activate', asTheme(row))"
      >
        <v-icon icon="$checkcircle" />
      </AppButton>

      <v-tooltip
        location="bottom"
        open-delay="150"
        transition="custom-tooltip"
        :z-index="99"
      >
        <template #activator="{ props: activatorProps }">
          <div v-bind="activatorProps">
            <AppButton
              :aria-label="t('tooltip.instance.theme.update')"
              :disabled="asTheme(row).update !== 'available'"
              kind="row-action"
              @click="emit('action-button-update', asTheme(row))"
            >
              <v-icon icon="$update" />
            </AppButton>
          </div>
        </template>

        <span>
          {{ asTheme(row).update !== 'available' ? t('tooltip.instance.theme.updated') : t('tooltip.instance.theme.update') }}
        </span>
      </v-tooltip>

      <v-tooltip
        location="bottom"
        open-delay="150"
        transition="custom-tooltip"
        :z-index="99"
      >
        <template #activator="{ props: activatorProps }">
          <div v-bind="activatorProps">
            <AppButton
              :aria-label="t('tooltip.instance.theme.delete')"
              :disabled="asTheme(row).status === 'active'"
              kind="row-action"
              @click="emit('action-button-delete', asTheme(row))"
            >
              <v-icon icon="$thrash" />
            </AppButton>
          </div>
        </template>

        <span v-if="asTheme(row).status === 'active'">{{ t('tooltip.instance.theme.cannotDelete') }}</span>
        <span v-else>{{ t('tooltip.instance.theme.delete') }}</span>
      </v-tooltip>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { DataTableHeader, DataTableRowMarker } from '@/shared/ui/data-table/data-table'
  import type { InstalledTheme } from '@/entities/project/instance-themes.api'
  // Headers are the legacy set; the select
  // column, the sort row and the status bar come from the kit `DataTable`, as in `PluginTable`.
  import { useTranslation } from 'i18next-vue'
  import { themeScreenshotSrc } from '@/entities/project/instance-themes.api'
  import { decodeEntities } from '@/shared/format/decode-entities'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { tableDescription, themeDefaultSort } from './installed-themes'

  // Legacy shows the "Read More" link past 100 characters; the cell itself cuts at 120 (`tableDescription`).
  const READ_MORE_LIMIT = 100

  withDefaults(defineProps<{
    items?: InstalledTheme[]
    // Names of the checked themes on the current page; the page owns the list.
    checkedItems?: Array<string | number>
    // The screenshot of each row is `themeScreenshotSrc(instanceId, name)`, as in `ThemeCard`.
    instanceId: number
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
    itemsPerPage: 6,
    itemsTotal: undefined,
    possibleItemsPerPage: () => [[6, 12, 24]],
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
    'action-button-activate': [item: InstalledTheme]
    'action-button-update': [item: InstalledTheme]
    'action-button-delete': [item: InstalledTheme]
    'action-button-read-more': [item: InstalledTheme]
  }>()

  const { t } = useTranslation()

  // The title is the sortable name, the version is not sortable.
  const headers: DataTableHeader[] = [
    { text: '', value: 'select', sortable: false },
    themeDefaultSort,
    { text: 'version', value: 'version', sortable: false },
    { text: 'status', value: 'status', sortable: true },
    { text: '', value: 'actions', sortable: false, align: 'end' },
  ]

  // The active themes get the green bar; the others keep the grey bar of the row (no colour class in legacy).
  function themeMarker (item: Record<string, unknown>): DataTableRowMarker {
    return asTheme(item).status === 'active' ? 'green' : 'gray'
  }

  const asTheme = (row: unknown) => row as InstalledTheme

  function description (theme: InstalledTheme): string | undefined {
    return tableDescription(theme.description || t('message.theme.noDescription'))
  }

  // The read-more link follows the raw description length, not the cut text.
  function hasReadMore (theme: InstalledTheme): boolean {
    return (theme.description || '').length > READ_MORE_LIMIT
  }

  // The title is decoded to text, as `ThemeCard` does; it is never `v-html`.
  function title (theme: InstalledTheme): string {
    return decodeEntities(theme.title || theme.name)
  }
</script>

<style lang="scss" scoped>
// V2 `::v-deep` becomes `:deep()`, the RTL block is `[dir='rtl']`, and the
// `--v-info-base` colour is the theme channel as in `ThemeCard`.
.item-desc {
  max-width: 412px;
  max-height: 36px;
  display: block;
  overflow: hidden;
  word-wrap: break-word;
  text-overflow: ellipsis;
}

.name-item {
  width: 535px;
}

.truncate-text {
  font-weight: 700;
  color: rgb(var(--v-theme-info));
  display: inline;
  justify-content: flex-end;
  margin-left: -4px;
}

.v-avatar {
  border-color: var(--v-gray-lighten2) !important;
  border-style: solid !important;
  border-width: 1px !important;
}
</style>
