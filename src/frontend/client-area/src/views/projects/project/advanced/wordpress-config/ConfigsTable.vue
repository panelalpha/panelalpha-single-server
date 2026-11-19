<template>
  <DataTable
    :actions-sort="false"
    :card-below="1400"
    :custom-key-sort="CONFIGS_CUSTOM_KEY_SORT"
    :filter-keys="CONFIGS_SEARCH_KEYS"
    footer-pages="page"
    :headers="headers"
    :item-slots="['name', 'value']"
    :items="(items as unknown as Record<string, unknown>[])"
    :items-loading="itemsLoading"
    :items-per-page="itemsPerPage"
    no-results-first
    :page="page"
    :per-page-label="t('table.footer.record')"
    :possible-items-per-page="possibleItemsPerPage"
    :search-term="searchTerm"
    skeleton="config"
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    @clear-filters="emit('clear-filters')"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <!-- Without a search the V2 default "No data available" row stays (`noDataText`). -->
    <template #no-data>
      <ErrorCard
        v-if="loadError !== null"
        data-testid="wordpress-config-load-error"
        :message="loadError"
        retryable
        @retry="emit('retry')"
      />

      <template v-else>
        {{ vuetifyT('$vuetify.noDataText') }}
      </template>
    </template>

    <template #item.name="{ item }">
      <span class="bold">{{ displayConfigName(asConfig(item)) }}</span>
    </template>

    <template #item.value="{ item }">
      <secret-value
        v-if="asConfig(item).secret"
        :instance-id="instanceId"
        :secret="String(asConfig(item).name)"
      />

      <span v-else>{{ displayConfigValue(asConfig(item)) }}</span>
    </template>

    <template #actions="{ row }">
      <AppButton
        :aria-label="t('button.config.edit')"
        data-testid="wordpress-config-edit"
        kind="row-action"
        :tooltip="t('button.config.edit')"
        @click="emit('action-button-edit', asConfig(row))"
      >
        <v-icon icon="$edit" />
      </AppButton>

      <AppButton
        :aria-label="t('button.config.delete')"
        data-testid="wordpress-config-delete"
        kind="row-action"
        :tooltip="t('button.config.delete')"
        @click="emit('action-button-delete', asConfig(row))"
      >
        <v-icon icon="$thrash" />
      </AppButton>
    </template>

    <!-- Mobile item: three labelled rows and the actions. Name is shown without the `---` fallback. -->
    <template #mobile="{ item }">
      <MobileTableField
        :label="t('table.header.name')"
        :value="asConfig(item).name"
        @sort="sortByKey('name')"
      />

      <MobileTableField
        :label="t('table.header.value')"
        @sort="sortByKey('value')"
      >
        <secret-value
          v-if="asConfig(item).secret"
          :instance-id="instanceId"
          :secret="String(asConfig(item).name)"
        />

        <span
          v-else
          class="bold p-3"
        >{{ displayConfigValue(asConfig(item)) }}</span>
      </MobileTableField>

      <MobileTableField
        :label="t('table.header.type')"
        :value="asConfig(item).type"
        @sort="sortByKey('type')"
      />
    </template>

    <template #mobile-actions="{ row }">
      <AppButton
        :aria-label="t('button.config.edit')"
        kind="row-action"
        :tooltip="t('button.config.edit')"
        @click="emit('action-button-edit', asConfig(row))"
      >
        <v-icon icon="$edit" />
      </AppButton>

      <AppButton
        :aria-label="t('button.config.delete')"
        kind="row-action"
        :tooltip="t('button.config.delete')"
        @click="emit('action-button-delete', asConfig(row))"
      >
        <v-icon icon="$thrash" />
      </AppButton>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { WordpressConfigItem } from './wordpress-config.api'
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  // Desktop table from 1400 px.
  import { useTranslation } from 'i18next-vue'
  import { useLocale } from 'vuetify'
  import SecretValue from '@/entities/project/ui/secrets/SecretValue.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import {
    CONFIGS_CUSTOM_KEY_SORT,
    CONFIGS_SEARCH_KEYS,
    displayConfigName,
    displayConfigValue,
  } from './configs-table'

  const props = withDefaults(defineProps<{
    instanceId: number | string
    items: WordpressConfigItem[]
    itemsLoading?: boolean
    headers: LegacySortHeader[]
    page: number
    itemsPerPage: number | string
    possibleItemsPerPage: Array<Array<number | string>>
    sortBy: LegacySortBy
    sortDesc: boolean
    searchTerm: string
    loadError?: string | null
  }>(), {
    itemsLoading: false,
    loadError: null,
  })

  const emit = defineEmits<{
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'clear-filters': []
    'retry': []
    'action-button-edit': [item: WordpressConfigItem]
    'action-button-delete': [item: WordpressConfigItem]
  }>()

  const { t } = useTranslation()
  const { t: vuetifyT } = useLocale()

  function asConfig (item: unknown): WordpressConfigItem {
    return item as WordpressConfigItem
  }

  // The mobile label emits the header of its own column, by key.
  function sortByKey (key: string): void {
    const header = props.headers.find(item => item.value === key)
    if (header) {
      emit('update:sort-by', header)
    }
  }
</script>
