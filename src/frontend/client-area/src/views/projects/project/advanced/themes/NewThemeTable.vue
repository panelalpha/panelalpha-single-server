<template>
  <v-container class="px-0 pt-1">
    <!-- On the kit `DataTable`. The page composable cuts and sorts the rows (server), so the
         table gets only the current page (see `ThemeTable.vue`). -->
    <DataTable
      :headers="headers"
      :item-slots="['name', 'version', 'rating']"
      :items="(items as unknown as Record<string, unknown>[])"
      :items-loading="loading"
      :items-per-page="itemsPerPage"
      :items-total="itemsTotal"
      :page="page"
      :per-page-label="t('table.footer.theme')"
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
      <template #item.name="{ item }">
        <div class="d-flex name-item">
          <v-avatar
            class="mr-6"
            color="white"
            elevation="0"
            :size="64"
          >
            <v-img :src="screenshotSrc(asCatalogEntry(item))" />
          </v-avatar>

          <div class="d-flex flex-column">
            <div>
              <span class="bold p-3">{{ decodeEntities(asCatalogEntry(item).name) }}</span>

              <v-tooltip
                v-if="featured"
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

                <span class="base--text">{{ t('tooltip.instance.theme.add.special') }}</span>
              </v-tooltip>

              <div
                v-if="featured"
                class="featured-chip ml-2"
              >
                {{ t('general.featured') }}
              </div>
            </div>

            <span class="p-4 item-desc mt-1">
              <span
                v-safe-html:external="description(asCatalogEntry(item))"
                class="base--text"
              />

              <a
                v-if="hasReadMore(asCatalogEntry(item))"
                class="truncate-text"
                @click="emit('read-more', asCatalogEntry(item))"
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
          <span class="ml-2">{{ t('table.field.version', { version: asCatalogEntry(item).version }) }}</span>
        </div>
      </template>

      <template #item.rating="{ item }">
        <div class="d-flex align-center">
          <StarIcon
            class="mr-1"
            :percent="starPercent(rating(asCatalogEntry(item)))"
          />

          <b class="p-4">{{ ratingLabel(rating(asCatalogEntry(item))) }}</b>
        </div>
      </template>

      <template #actions="{ row }">
        <v-tooltip
          v-if="asCatalogEntry(row).preview_url"
          location="bottom"
          open-delay="150"
          transition="custom-tooltip"
          z-index="99"
        >
          <template #activator="{ props: activatorProps }">
            <AppButton
              :aria-label="previewAriaLabel(asCatalogEntry(row))"
              class="catalog-action-button"
              :href="previewHref(asCatalogEntry(row))"
              kind="secondary"
              rel="noopener noreferrer"
              size="small"
              target="_blank"
              v-bind="activatorProps"
            >
              <v-icon
                class="mr-0"
                color="gray-darken-2"
                icon="$eye"
                size="18"
              />
            </AppButton>
          </template>

          <span class="base--text">{{ t('tooltip.instance.theme.preview') }}</span>
        </v-tooltip>

        <v-tooltip
          location="bottom"
          open-delay="150"
          transition="custom-tooltip"
          z-index="99"
        >
          <template #activator="{ props: activatorProps }">
            <AppButton
              :aria-label="installAriaLabel(asCatalogEntry(row))"
              class="ml-3 catalog-action-button"
              kind="primary"
              size="small"
              v-bind="activatorProps"
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

          <span class="base--text">{{ t('tooltip.instance.theme.install') }}</span>
        </v-tooltip>
      </template>
    </DataTable>
  </v-container>
</template>

<script lang="ts" setup>
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { DataTableHeader, DataTableRowMarker } from '@/shared/ui/data-table/data-table'
  import type { RepositoryTheme } from '@/entities/project/instance-themes.api'
  // Headers are the legacy set. The legacy table has two `item.version` slots and the second one wins, so only `table.field.version` is ported.
  // The table has no select column.
  import { useTranslation } from 'i18next-vue'
  import { newThemeScreenshotSrc } from '@/entities/project/instance-themes.api'
  import { CARD_DESCRIPTION_LIMIT, cardDescription, itemAsyncState, ratingLabel, starPercent } from '@/entities/project/wordpress-items'
  import { decodeEntities } from '@/shared/format/decode-entities'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import StarIcon from '@/shared/ui/icons/star.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { httpUrlOrEmpty } from '@/shared/url/http-url'

  const props = withDefaults(defineProps<{
    items?: RepositoryTheme[]
    /** For every row: the featured list (not a search) shows the yellow band and the chip. */
    featured?: boolean
    loading?: boolean
    sortBy?: LegacySortBy
    sortDesc?: boolean
    page?: number
    itemsPerPage?: number
    itemsTotal?: number
    possibleItemsPerPage?: Array<Array<number | string>>
  }>(), {
    items: () => [],
    featured: false,
    loading: false,
    sortBy: false,
    sortDesc: false,
    page: 1,
    itemsPerPage: 6,
    itemsTotal: undefined,
    possibleItemsPerPage: () => [[6, 12, 24]],
  })

  const emit = defineEmits<{
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'action-button-install': [item: RepositoryTheme]
    'read-more': [item: RepositoryTheme]
  }>()

  const { t } = useTranslation()

  // `text` is the translation key under `table.header.*`.
  const headers: DataTableHeader[] = [
    { text: 'name', align: 'start', value: 'name', sortable: true },
    { text: 'rating', value: 'rating', sortable: true },
    { text: 'version', value: 'version', sortable: true },
    { text: '', value: 'actions', sortable: false, align: 'end' },
  ]

  // The featured list only has the yellow bar; the other rows have no bar.
  function catalogMarker (): DataTableRowMarker | undefined {
    return props.featured ? 'yellow' : undefined
  }

  const asCatalogEntry = (row: unknown) => row as RepositoryTheme

  function installAriaLabel (theme: RepositoryTheme): string {
    return `${t('button.install')} ${decodeEntities(theme.name)}`
  }

  function previewAriaLabel (theme: RepositoryTheme): string {
    return `${t('button.preview')} ${decodeEntities(theme.name)}`
  }

  // The `screenshot_url`, or the API screenshot of a custom theme (the same source as the card).
  function screenshotSrc (theme: RepositoryTheme): string | undefined {
    return newThemeScreenshotSrc(theme) ?? undefined
  }

  // The Preview button: the preview URL of a custom theme, https://wp-themes.com/{slug} otherwise.
  function previewHref (theme: RepositoryTheme): string | undefined {
    return theme.type ? (httpUrlOrEmpty(theme.preview_url) || undefined) : `https://wp-themes.com/${theme.slug}`
  }

  // The cut and its guard are the cards' (`cardDescription`).
  function description (theme: RepositoryTheme): string | undefined {
    return cardDescription(theme.description || t('message.theme.noDescription')).text
  }

  // The link follows the raw description, not the cut text.
  function hasReadMore (theme: RepositoryTheme): boolean {
    return (theme.description || '').length > CARD_DESCRIPTION_LIMIT
  }

  // No guard: a missing rating reads as 0 (as the card does).
  function rating (theme: RepositoryTheme): number {
    return theme.rating ?? 0
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// The inline `min-width/max-width: 38px` of the Preview and Install buttons, as a class.
.catalog-action-button {
  min-width: 38px;
  max-width: 38px;
}

// V2 `::v-deep` becomes `:deep()` / a descendant selector.
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

.v-avatar {
  border-color: var(--v-gray-lighten2) !important;
  border-style: solid !important;
  border-width: 1px !important;
}

.primary-on-hover:hover {
  color: rgb(var(--v-theme-primary)) !important;
  transition: color 0.24s ease;
}

// Featured chip: the `--v-featured-*` tokens from themes-variables.scss.
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
  font-weight: 700;
  color: rgb(var(--v-theme-info));
  display: inline;
}
</style>
