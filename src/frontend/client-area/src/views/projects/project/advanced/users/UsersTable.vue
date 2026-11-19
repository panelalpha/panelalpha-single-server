<template>
  <DataTable
    :actions-sort="false"
    :card-below="1400"
    :custom-key-sort="USERS_CUSTOM_KEY_SORT"
    :filter-keys="USERS_SEARCH_KEYS"
    footer-pages="page"
    :headers="headers"
    :items="(items as unknown as Record<string, unknown>[])"
    :items-loading="itemsLoading"
    :items-per-page="itemsPerPage"
    no-results-first
    :page="page"
    :per-page-label="t('table.footer.user')"
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
    <!-- The empty state is shown only without a search; a search that matches nothing shows no-results. -->
    <template #no-data>
      <slot name="no-data" />
    </template>

    <template #actions="{ row }">
      <AppButton
        :aria-label="t('button.resetPassword')"
        data-testid="users-reset-password"
        kind="row-action"
        :tooltip="t('button.resetPassword')"
        tooltip-class="users-row-tooltip"
        :tooltip-offset="14"
        @click="emit('action-button-reset-password', asUser(row))"
      >
        <v-icon icon="$restore" />
      </AppButton>

      <AppButton
        :aria-label="t('button.user.delete')"
        data-testid="users-delete"
        :disabled="isProtectedUser(asUser(row))"
        kind="row-action"
        :tooltip="t('button.user.delete')"
        tooltip-class="users-row-tooltip"
        :tooltip-offset="14"
        @click="emit('action-button-delete', asUser(row))"
      >
        <v-icon icon="$thrash" />
      </AppButton>
    </template>

    <!-- Mobile item: four labelled rows and the actions. The labels sort by their column; the legacy headers lookup was off by one
         for Email and Role, so each label looks its column up by key. -->
    <template #mobile="{ item }">
      <MobileTableField
        :label="t('table.header.id')"
        :value="asUser(item).id"
        @sort="sortByKey('id')"
      />

      <MobileTableField
        :label="t('table.header.login')"
        :value="asUser(item).username"
        @sort="sortByKey('username')"
      />

      <MobileTableField
        :label="t('table.header.email')"
        :value="asUser(item).email"
        @sort="sortByKey('email')"
      />

      <MobileTableField
        :label="t('table.header.role')"
        :value="asUser(item).role"
        @sort="sortByKey('role')"
      />
    </template>

    <template #mobile-actions="{ row }">
      <AppButton
        :aria-label="t('button.resetPassword')"
        kind="row-action"
        :tooltip="t('button.resetPassword')"
        tooltip-class="users-row-tooltip"
        :tooltip-offset="14"
        @click="emit('action-button-reset-password', asUser(row))"
      >
        <v-icon icon="$restore" />
      </AppButton>

      <AppButton
        :aria-label="t('button.user.delete')"
        :disabled="isProtectedUser(asUser(row))"
        kind="row-action"
        :tooltip="t('button.user.delete')"
        tooltip-class="users-row-tooltip"
        :tooltip-offset="14"
        @click="emit('action-button-delete', asUser(row))"
      >
        <v-icon icon="$thrash" />
      </AppButton>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { InstanceAppUser } from './users.api'
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  // Desktop table from 1400 px.
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import {
    isProtectedUser,
    USERS_CUSTOM_KEY_SORT,
    USERS_SEARCH_KEYS,
  } from './users-table'

  const props = withDefaults(defineProps<{
    items: InstanceAppUser[]
    itemsLoading?: boolean
    headers: LegacySortHeader[]
    page: number
    itemsPerPage: number | string
    possibleItemsPerPage: Array<Array<number | string>>
    sortBy: LegacySortBy
    sortDesc: boolean
    searchTerm: string
  }>(), {
    itemsLoading: false,
  })

  const emit = defineEmits<{
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'clear-filters': []
    'action-button-reset-password': [item: InstanceAppUser]
    'action-button-delete': [item: InstanceAppUser]
  }>()

  const { t } = useTranslation()

  function asUser (item: unknown): InstanceAppUser {
    return item as InstanceAppUser
  }

  // The mobile label emits the header of its own column, by key.
  function sortByKey (key: string): void {
    const header = props.headers.find(item => item.value === key)
    if (header) {
      emit('update:sort-by', header)
    }
  }
</script>

<style lang="scss" scoped>
// Legacy tooltips sit `nudge-bottom="4px"` below the icon (V4 default offset 10px) and `.v-tooltip__content { line-height: 22px }` (V4 computes 22.4px);
// the tooltip is teleported, so its class is global.
:global(.users-row-tooltip) {
  line-height: 22px;
}
</style>
