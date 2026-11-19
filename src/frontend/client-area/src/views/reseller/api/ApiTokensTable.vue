<template>
  <div>
    <PageTitle
      :title="t('heading.reseller.page.api')"
      title-testid="reseller-api-title"
    >
      <template
        v-if="tokens.length > 0"
        #filters
      >
        <data-iterator-filter-controls
          v-model:search-term="searchTerm"
          class="my-hostings-search"
          :full-width-lg="false"
          full-width-md
          :full-width-search="false"
          show-search-term
        />

        <PageAddButton
          :aria-label="t('button.apiToken.create')"
          data-testid="reseller-api-create"
          :label="t('button.apiToken.create')"
          @click="createModal?.open()"
        />
      </template>
    </PageTitle>

    <v-container class="px-0 py-3">
      <v-row>
        <v-col cols="12">
          <data-table
            :actions-sort="false"
            announce-sort
            :custom-filter="matchesTokenValue"
            :filter-keys="API_TOKEN_SEARCH_KEYS"
            :headers="API_TOKEN_HEADERS"
            :item-slots="API_TOKEN_SEARCH_KEYS"
            item-value="id"
            :items="(items as unknown as Record<string, unknown>[])"
            :items-loading="fetching"
            :items-per-page="itemsPerPage"
            keep-page-on-search
            :number-of-pages="pages"
            :page="page"
            :per-page-label="t('table.footer.items')"
            :possible-items-per-page="POSSIBLE_ITEMS_PER_PAGE"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            sort-in-view
            @clear-filters="searchTerm = ''"
            @update:items-per-page="updateItemsPerPage"
            @update:page="page = $event"
            @update:sort-by="sortBy = $event.value"
            @update:sort-desc="sortDesc = $event"
          >
            <template #no-data>
              <EmptyState
                data-testid="reseller-api-empty"
                :desc="t('reseller.apiTokens.noTokensDesc')"
                :title="t('reseller.apiTokens.noTokens')"
                title-tag="h6"
                variant="panel"
              >
                <template #image>
                  <no-data-api-tokens-illustration />
                </template>

                <template #action>
                  <PageAddButton
                    :aria-label="t('button.apiToken.create')"
                    data-testid="reseller-api-create-empty"
                    :label="t('button.apiToken.create')"
                    @click="createModal?.open()"
                  />
                </template>
              </EmptyState>
            </template>

            <template
              v-for="key in API_TOKEN_SEARCH_KEYS"
              :key="key"
              #[`item.${key}`]="{ item }"
            >
              <api-tokens-table-cell
                :header="API_TOKEN_HEADERS.find(header => header.value === key)!"
                :item="(item as unknown as ResellerApiToken)"
              />
            </template>

            <template #actions="{ row }">
              <api-tokens-table-cell
                :header="API_TOKEN_HEADERS[3]!"
                is-mobile
                :item="(row as unknown as ResellerApiToken)"
                @action-button-delete="onDelete"
              />
            </template>

            <template #mobile="{ item }">
              <MobileTableField
                v-for="header in API_TOKEN_HEADERS.slice(0, 3)"
                :key="header.value"
                :label="t(`table.header.${header.text}`)"
              >
                <api-tokens-table-cell
                  :header="header"
                  is-mobile
                  :item="(item as unknown as ResellerApiToken)"
                />
              </MobileTableField>
            </template>
          </data-table>

          <api-token-create-modal
            ref="createModal"
            @api-token-created="onTokenCreated"
          />

          <api-token-delete-modal
            ref="deleteModal"
            @api-token-deleted="onTokenDeleted"
          />
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // The title row, the one `GET /reseller/api-tokens` on mount, the loading skeleton and the empty state, the sort headers, sort and pagination,
  // the search with its no-results state and the mobile rows (fixed). The delete and create modals are one per table, opened by ref.
  // The table is the `DataTable` kit: the view sorts (`sortInView`, V2 order), the table filters with `matchesTokenValue` (the `filterTokens` rule),
  // so the header and the footer stay for a search without matches, as before.
  import type { ResellerApiToken } from '@/views/reseller/reseller.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { listResellerApiTokens } from '@/views/reseller/reseller.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import { sortByV2 } from '@/shared/ui/data-table/v2-sort'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataApiTokensIllustration from '@/shared/ui/illustrations/NoDataApiTokensIllustration.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import {
    API_TOKEN_HEADERS,
    API_TOKEN_SEARCH_KEYS,
    DEFAULT_ITEMS_PER_PAGE,
    DEFAULT_SORT,
    matchesTokenValue,
    numberOfPages,
    POSSIBLE_ITEMS_PER_PAGE,
  } from './api-tokens-table'
  import ApiTokenCreateModal from './ApiTokenCreateModal.vue'
  import ApiTokenDeleteModal from './ApiTokenDeleteModal.vue'
  import ApiTokensTableCell from './ApiTokensTableCell.vue'

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const fetching = ref(false)
  const tokens = ref<ResellerApiToken[]>([])
  const searchTerm = ref('')
  const sortBy = ref<string>(DEFAULT_SORT.sortBy)
  const sortDesc = ref<boolean>(DEFAULT_SORT.sortDesc)
  const page = ref(1)
  const itemsPerPage = ref(DEFAULT_ITEMS_PER_PAGE)

  const items = computed(() => sortByV2(tokens.value, sortBy.value, sortDesc.value))

  // Legacy counts the pages over all tokens, not only the ones the search leaves.
  const pages = computed(() => numberOfPages(tokens.value.length, itemsPerPage.value))

  function updateItemsPerPage (value: number | string): void {
    itemsPerPage.value = Number(value)
    page.value = 1
  }

  const createModal = ref<InstanceType<typeof ApiTokenCreateModal> | null>(null)

  // Legacy adds the row with `unshift`; the sort decides where it lands.
  function onTokenCreated (token: ResellerApiToken): void {
    tokens.value = [token, ...tokens.value]
  }

  const deleteModal = ref<InstanceType<typeof ApiTokenDeleteModal> | null>(null)

  function onDelete (token: ResellerApiToken): void {
    deleteModal.value?.open(token)
  }

  function onTokenDeleted (deleted: { id: number }): void {
    tokens.value = tokens.value.filter(token => token.id !== deleted.id)
  }

  async function fetchTokens (): Promise<void> {
    fetching.value = true
    try {
      tokens.value = await listResellerApiTokens()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetching.value = false
    }
  }

  onMounted(() => {
    void fetchTokens()
  })
</script>
