<template>
  <div>
    <PageTitle
      :title="t('heading.reseller.page.users')"
      title-testid="reseller-users-title"
    >
      <template #filters>
        <data-iterator-filter-controls
          v-model:search-term="searchTerm"
          class="my-hostings-search"
          :full-width-lg="false"
          full-width-md
          :full-width-search="false"
          show-search-term
        />
      </template>
    </PageTitle>

    <v-container class="px-0 py-3">
      <v-row>
        <v-col cols="12">
          <data-table
            :actions-sort="false"
            announce-sort
            :filter-keys="RESELLER_USERS_SEARCH_KEYS"
            :headers="headers"
            hide-footer
            :item-slots="USER_CELL_KEYS"
            item-value="id"
            :items="(users as unknown as Record<string, unknown>[])"
            :items-loading="fetchingUsers"
            :items-per-page="-1"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            @clear-filters="clearFilters"
            @update:sort-by="sortBy = $event.value"
            @update:sort-desc="sortDesc = $event"
          >
            <template #no-data>
              <data-iterator-no-results-container
                v-if="searchTerm"
                :search-term="searchTerm"
                @clear-all-filters="clearFilters"
              />

              <EmptyState
                v-else
                data-testid="reseller-users-empty"
                :desc="t('reseller.logs.noLogsDesc')"
                :title="t('reseller.logs.noLogs')"
                title-tag="h6"
                variant="cell"
              >
                <template #image>
                  <no-data-table-users />
                </template>
              </EmptyState>
            </template>

            <template
              v-for="(header, index) in dataHeaders"
              :key="header.value"
              #[`item.${header.value}`]="{ item }"
            >
              <div :class="{ 'font-weight-bold': index === 0 }">
                <users-table-cell
                  :header="header"
                  :item="asUser(item)"
                  @action-button-delete="openDeleteModal"
                />
              </div>
            </template>

            <template #actions="{ row }">
              <users-table-cell
                :header="actionsHeader"
                is-mobile
                :item="asUser(row)"
                @action-button-delete="openDeleteModal"
              />
            </template>

            <template #mobile="{ item }">
              <MobileTableField
                v-for="header in dataHeaders"
                :key="header.value"
                :label="t(`table.header.${header.text}`)"
              >
                <users-table-cell
                  :header="header"
                  is-mobile
                  :item="asUser(item)"
                  @action-button-delete="openDeleteModal"
                />
              </MobileTableField>
            </template>
          </data-table>

          <user-delete-modal
            ref="deleteModal"
            @user-deleted="userDeleted"
          />
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // A client-side table (one `GET /reseller/users`, no pagination)
  // with sort, search, the loading skeleton, the mobile rows, the empty states and the delete modal (one instance, as legacy).
  import type { ResellerUser } from '@/views/reseller/reseller.api'
  import { useTranslation } from 'i18next-vue'
  import { onMounted, ref } from 'vue'
  import { listResellerUsers } from '@/views/reseller/reseller.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataTableUsers from '@/shared/ui/illustrations/NoDataTableUsers.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import UserDeleteModal from './UserDeleteModal.vue'
  import { DEFAULT_SORT, RESELLER_USERS_SEARCH_KEYS, resellerUsersHeaders } from './users-table'
  import UsersTableCell from './UsersTableCell.vue'

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const fetchingUsers = ref(false)
  const users = ref<ResellerUser[]>([])
  const searchTerm = ref('')
  const sortBy = ref<string>(DEFAULT_SORT.sortBy)
  const sortDesc = ref<boolean>(DEFAULT_SORT.sortDesc)

  const headers = resellerUsersHeaders()
  // The data columns are cells (`item.<key>`); the actions column is the `#actions` slot of `DataTable`.
  const dataHeaders = headers.filter(header => header.value !== 'actions')
  const actionsHeader = headers.find(header => header.value === 'actions')!
  const USER_CELL_KEYS = dataHeaders.map(header => header.value)

  function asUser (item: unknown): ResellerUser {
    return item as ResellerUser
  }

  async function fetchUsers (): Promise<void> {
    fetchingUsers.value = true
    try {
      users.value = await listResellerUsers()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetchingUsers.value = false
    }
  }

  const deleteModal = ref<InstanceType<typeof UserDeleteModal> | null>(null)

  function openDeleteModal (user: ResellerUser): void {
    deleteModal.value?.open(user)
  }

  function userDeleted (deleted: { id: number }): void {
    users.value = users.value.filter(user => user.id !== deleted.id)
  }

  function clearFilters (): void {
    searchTerm.value = ''
  }

  onMounted(() => {
    void fetchUsers()
  })
</script>
