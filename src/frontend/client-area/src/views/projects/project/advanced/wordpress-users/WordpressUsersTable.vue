<template>
  <DataTable
    :actions-sort="false"
    :card-below="1400"
    :custom-key-sort="WORDPRESS_USERS_CUSTOM_KEY_SORT"
    :filter-keys="WORDPRESS_USERS_SEARCH_KEYS"
    footer-pages="page"
    :headers="headers"
    :item-slots="['user_registered', 'role', 'email']"
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
      <EmptyState
        data-testid="wordpress-users-empty"
        :title="t('heading.instance.advanced.users.noData')"
      >
        <template #image>
          <plugins-illustration />
        </template>
      </EmptyState>
    </template>

    <!-- Mobile item: six labelled rows and the actions. The labels sort by their column, by key.
         Deviation: Delete is disabled for the user with id 1 here too (legacy does not block it). -->
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
        :label="t('table.header.displayName')"
        :value="asUser(item).display_name"
        @sort="sortByKey('display_name')"
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

      <MobileTableField
        :label="t('table.header.registered')"
        :value="asUser(item).user_registered_text"
        @sort="sortByKey('user_registered')"
      />
    </template>

    <template #item.user_registered="{ item }">
      {{ asUser(item).user_registered_text }}
    </template>

    <template #item.role="{ item }">
      <user-role-label :role="asUser(item).role" />
    </template>

    <template #item.email="{ item }">
      <a
        class="d-flex align-center primary-on-hover base-text"
        :href="`mailto:${asUser(item).email}`"
      >
        <v-avatar
          class="mr-2"
          size="28"
        >
          <v-img
            :height="28"
            :src="avatarUrl(asUser(item).email, 28)"
            :width="28"
          />
        </v-avatar>

        <span class="primary-on-hover base--text">
          {{ asUser(item).email }}
          <v-icon
            class="show-on-hover"
            color="gray-lighten-1"
            size="16"
          >
            $arrowCornerRightIcon
          </v-icon>
        </span>
      </a>
    </template>

    <template #actions="{ row }">
      <AppButton
        :aria-label="t('button.user.edit')"
        data-testid="wordpress-users-edit"
        kind="row-action"
        :tooltip="t('button.user.edit')"
        @click="emit('action-button-edit', asUser(row))"
      >
        <v-icon icon="$edit" />
      </AppButton>

      <AppButton
        :aria-label="t('button.resetPassword')"
        data-testid="wordpress-users-reset-password"
        kind="row-action"
        :tooltip="t('button.resetPassword')"
        @click="emit('action-button-reset-password', asUser(row))"
      >
        <v-icon icon="$restore" />
      </AppButton>

      <AppButton
        :aria-label="t('button.user.delete')"
        data-testid="wordpress-users-delete"
        :disabled="isProtectedWordpressUser(asUser(row))"
        kind="row-action"
        :tooltip="t('button.user.delete')"
        @click="emit('action-button-delete', asUser(row))"
      >
        <v-icon icon="$thrash" />
      </AppButton>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { WordpressUserRow } from './wordpress-users-table'
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  // Desktop table from 1400 px.
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import PluginsIllustration from '@/shared/ui/illustrations/PluginsIllustration.vue'
  import UserRoleLabel from '@/shared/ui/labels/UserRoleLabel.vue'
  import { avatarUrl } from '@/shared/ui/user-avatar/avatar-url'
  import {
    isProtectedWordpressUser,
    WORDPRESS_USERS_CUSTOM_KEY_SORT,
    WORDPRESS_USERS_SEARCH_KEYS,
  } from './wordpress-users-table'

  const props = withDefaults(defineProps<{
    items: WordpressUserRow[]
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
    'action-button-edit': [item: WordpressUserRow]
    'action-button-reset-password': [item: WordpressUserRow]
    'action-button-delete': [item: WordpressUserRow]
  }>()

  const { t } = useTranslation()

  function asUser (item: unknown): WordpressUserRow {
    return item as WordpressUserRow
  }

  // The mobile label emits the header of its own column, by key (legacy used the position).
  function sortByKey (key: string): void {
    const header = props.headers.find(item => item.value === key)
    if (header) {
      emit('update:sort-by', header)
    }
  }
</script>

<style lang="scss" scoped>
// Legacy avatar text colour is the link colour (`users-first-avatar.color` 7,192,126 in light and dark); V4 `color="white"` leaves it black.
.v-avatar {
  background-color: var(--v-white-base);
  color: rgb(var(--v-theme-primary));
}

// Avatar frame, as legacy (`--v-gray-lighten2`). `!important` is 1:1 with legacy; whether V4 needs it is still to be measured, not assumed.
.v-avatar {
  border-color: var(--v-gray-lighten2) !important;
  border-style: solid !important;
  border-width: 1px !important;
}
</style>
