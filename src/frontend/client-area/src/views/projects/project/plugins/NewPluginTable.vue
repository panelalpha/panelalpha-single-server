<template>
  <v-container class="px-0 pt-0 table-container">
    <!-- On the kit `DataTable`. Server mode: the page composable cuts and
         sorts the rows once (`use-plugins-page.ts`), as `NewThemeTable.vue`; the client mode cut page 2 again. The search term is not passed to
         the table (a client filter would hide rows the server matched); the no-results box is the `no-data` slot. -->
    <DataTable
      :headers="headers"
      :item-slots="['name', 'rating', 'version', 'active_installs', 'tested']"
      :items="(items as unknown as Record<string, unknown>[])"
      :items-loading="loading"
      :items-per-page="itemsPerPage"
      :items-total="itemsTotal"
      :page="page"
      :per-page-label="t('table.footer.plugin')"
      :possible-items-per-page="possibleItemsPerPage"
      :row-marker="catalogMarker"
      server
      skeleton="plugin"
      :sort-by="sortBy"
      :sort-desc="sortDesc"
      @update:items-per-page="emit('update:items-per-page', $event)"
      @update:page="emit('update:page', $event)"
      @update:sort-by="emit('update:sort-by', $event)"
      @update:sort-desc="emit('update:sort-desc', $event)"
    >
      <!-- A search that matches nothing shows the no-results box with "Clear filter". -->
      <template #no-data>
        <data-iterator-no-results-container
          v-if="searchTerm"
          :search-term="searchTerm"
          @clear-all-filters="emit('clear-filters')"
        />
      </template>

      <template #item.name="{ item }">
        <div>
          <div class="d-flex flex-column text-truncate">
            <span
              v-if="featured"
              class="d-flex align-center"
            >
              <span class="font-weight-bold text-truncate d-block flex-start plugin-name--featured">{{ decodeEntities(asCatalogEntry(item).name) }}</span>

              <v-tooltip
                location="bottom"
                :offset="8"
                open-delay="150"
                transition="custom-tooltip"
                z-index="99"
              >
                <template #activator="{ props: activatorProps }">
                  <v-icon
                    class="ml-2 primary-on-hover"
                    color="gray-lighten-1"
                    icon="$alertcircle"
                    size="16"
                    v-bind="activatorProps"
                  />
                </template>

                <span class="base--text">{{ t('tooltip.instance.plugin.add.special') }}</span>
              </v-tooltip>

              <div class="featured-chip ml-2">
                {{ t('general.featured') }}
              </div>
            </span>

            <span
              v-else
              class="font-weight-bold text-truncate plugin-name"
            >{{ decodeEntities(asCatalogEntry(item).name) }}</span>

            <div class="d-flex">
              <div
                v-safe-html:external="truncateDescription(asCatalogEntry(item).short_description || asCatalogEntry(item).description)"
                class="text-truncate plugin-description"
              />

              <!-- A featured entry has no `description` in the API (legacy read `item.description.length` and failed here): no Read More. -->
              <a
                v-if="(asCatalogEntry(item).description ?? '').length > 100"
                class="truncate-text ml-1"
                @click="emit('action-button-read-more', asCatalogEntry(item))"
              >
                {{ t('button.readMore') }}
              </a>
            </div>
          </div>
        </div>
      </template>

      <template #item.rating="{ item }">
        <div class="d-flex align-center p-4">
          <StarIcon
            class="mr-1"
            :percent="starPercent(asCatalogEntry(item).rating)"
          />

          <b>{{ ratingLabel(asCatalogEntry(item).rating) }}</b>
        </div>
      </template>

      <template #item.version="{ item }">
        <div class="d-flex align-center">
          <!-- A catalogue entry never has an update, so the icon is always the OK one. -->
          <v-icon
            color="primary"
            icon="$alertok"
            size="16"
          />

          <span class="ml-2">{{ asCatalogEntry(item).version }}</span>
        </div>
      </template>

      <template #item.active_installs="{ item }">
        <div
          v-if="asCatalogEntry(item).active_installs"
          class="d-flex align-center p-4"
        >
          <v-icon
            class="mr-1"
            color="gray-lighten-1"
            icon="$installIcon"
            size="20"
          />

          <b>{{ asCatalogEntry(item).active_installs }}+</b>
        </div>
      </template>

      <template #item.tested="{ item }">
        <div
          v-if="asCatalogEntry(item).tested"
          class="d-flex align-center"
        >
          <v-icon
            class="mr-1"
            color="gray-lighten-1"
            icon="$installIcon"
            size="20"
          />

          {{ asCatalogEntry(item).tested }}
        </div>
      </template>

      <template #actions="{ row }">
        <v-tooltip
          location="bottom"
          open-delay="150"
          transition="custom-tooltip"
          z-index="99"
        >
          <template #activator="{ props: activatorProps }">
            <AppButton
              v-bind="activatorProps"
              :aria-label="installAriaLabel(asCatalogEntry(row))"
              class="ml-auto install-button"
              kind="primary"
              size="small"
              @click="emit('action-button-install', asCatalogEntry(row))"
            >
              <v-icon
                v-if="!itemAsyncState(asCatalogEntry(row))"
                class="mr-0"
                color="white"
                icon="$installIcon"
                size="18"
              />

              <Loader
                v-else
                class="mr-0"
                color="white"
                no-margins
                size="24"
              />
            </AppButton>
          </template>

          <span class="base--text">{{ t('button.plugin.install') }}</span>
        </v-tooltip>
      </template>
    </DataTable>
  </v-container>
</template>

<script lang="ts" setup>
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { DataTableHeader, DataTableRowMarker } from '@/shared/ui/data-table/data-table'
  import type { RepositoryPlugin } from '@/entities/project/instance-plugins.api'
  // Headers are the legacy `newPlugins.headers` set.
  // The table has no select column (legacy `:checkedItems="[]"`), so the sort row has no checkbox.
  import { useTranslation } from 'i18next-vue'
  import { itemAsyncState, ratingLabel, starPercent } from '@/entities/project/wordpress-items'
  import { decodeEntities } from '@/shared/format/decode-entities'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import StarIcon from '@/shared/ui/icons/star.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { truncateDescription } from './truncate-description'

  const props = withDefaults(defineProps<{
    items?: RepositoryPlugin[]
    /** For every row: the featured list (not a search) shows the featured name and chip. */
    featured?: boolean
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
    featured: false,
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
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'clear-filters': []
    'action-button-install': [item: RepositoryPlugin]
    'action-button-read-more': [item: RepositoryPlugin]
  }>()

  const { t } = useTranslation()

  // `text` is the translation key under `table.header.*`.
  const headers: DataTableHeader[] = [
    { text: 'name', align: 'start', value: 'name', sortable: true },
    { text: 'rating', value: 'rating', sortable: true },
    { text: 'version', value: 'version', sortable: false },
    { text: 'installations', value: 'active_installs', sortable: true },
    { text: 'requires', value: 'tested', sortable: true },
    { text: 'lastUpdated', value: 'last_updated', sortable: true },
    { text: '', value: 'actions', sortable: false, align: 'end' },
  ]

  // The yellow bar is on the featured list only; the other rows have no bar.
  function catalogMarker (): DataTableRowMarker | undefined {
    return props.featured ? 'yellow' : undefined
  }

  const asCatalogEntry = (row: unknown) => row as RepositoryPlugin

  function installAriaLabel (plugin: RepositoryPlugin): string {
    return `${t('button.install')} ${decodeEntities(plugin.name)}`
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `::v-deep` becomes `:deep()` / a descendant selector; the legacy
// `text-truncate` override (`text-overflow: ellipsis " "`) was invalid CSS and is left out.
// Inline `max-width` 450/450/415 px as classes; values 1:1.
.plugin-name {
  max-width: 450px;
}

.plugin-name--featured {
  max-width: 415px;
}

.plugin-description {
  max-width: 450px;
}

// Inline `min-width/max-width: 38px` on the install button as a class.
.install-button {
  min-width: 38px;
  max-width: 38px;
}

// The table card sits 10 px higher than legacy under the search card (`mt-n4 mb-n2`, kit `NewItemSearchCard`); the grid's search
// container now has a -10 px bottom margin (PluginsView), which moves the table up 2 px more, so the table takes 12 px here.
.table-container {
  margin-top: 12px;
}

// `!important` as legacy: the Vuetify icon colour (`text-*`) is `!important`, so the hover does not win without it.
.primary-on-hover:hover {
  color: rgb(var(--v-theme-primary)) !important;
  transition: color 0.24s ease;
}

.featured-chip {
  padding: 4px;
  border-radius: 5px;
  font-size: v.$font-size-xxs;
  line-height: v.$line-height-xxs;
  font-weight: v.$font-weight-bold;
  background-color: var(--v-featured-bg);
  color: var(--v-featured-text);
  display: inline-block;
}

.truncate-text {
  color: rgb(var(--v-theme-info));
  font-weight: 700;
}
</style>
