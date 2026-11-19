<template>
  <v-card
    class="data-table"
    :class="loading ? 'data-table--loading' : ''"
    data-testid="connect-ai-tokens"
    elevation="4"
  >
    <EmptyState
      v-if="!loading && listed.length === 0"
      data-testid="connect-ai-tokens-empty"
      :desc="t('heading.connectAi.noTokensHint')"
      :title="t('heading.connectAi.noTokens')"
      title-tag="h6"
      variant="panel"
    >
      <template #image>
        <NoDataApiTokensIllustration />
      </template>
    </EmptyState>

    <v-data-table
      v-else
      class="elevation-0 custom-data-table"
      :headers="v4Headers"
      :hide-default-body="loading"
      hide-default-footer
      hide-default-header
      :items="items"
      :items-per-page="itemsPerPage"
      :page="page"
    >
      <template
        v-if="!mobile && listed.length > 0"
        #thead
      >
        <table-custom-sort
          :headers="TOKEN_HEADERS"
          :is-mobile="mobile"
          :sort-by="sortKey"
          :sort-desc="sortDesc"
          @update:sort-by="sortKey = $event.value"
          @update:sort-desc="sortDesc = $event"
        />
      </template>

      <template
        v-if="loading"
        #tbody
      >
        <template v-if="lgAndDown">
          <logs-table-item-skeleton-mobile
            v-for="skeleton in 5"
            :key="skeleton"
          />
        </template>

        <template v-else>
          <logs-table-skeleton-item :cols="6" />
        </template>
      </template>

      <template
        v-if="mobile"
        #item="{ item }"
      >
        <MobileTableCard
          :class="item.revoked_at ? 'revoked-token-row' : ''"
        >
          <MobileTableField
            v-for="header in TOKEN_HEADERS"
            :key="header.value"
            :label="t(`table.header.${header.text}`)"
          >
            <mcp-tokens-table-cell
              :header="header"
              is-mobile
              :item="item"
              @action-button-delete="emit('token-delete', $event)"
              @action-button-revoke="emit('token-revoke', $event)"
            />
          </MobileTableField>
        </MobileTableCard>
      </template>

      <template
        v-else
        #item="{ item }"
      >
        <tr :class="item.revoked_at ? 'revoked-token-row' : ''">
          <td
            v-for="header in TOKEN_HEADERS"
            :key="header.value"
          >
            <mcp-tokens-table-cell
              :header="header"
              :item="item"
              @action-button-delete="emit('token-delete', $event)"
              @action-button-revoke="emit('token-revoke', $event)"
            />
          </td>
        </tr>
      </template>

      <template #bottom>
        <div>
          <v-divider v-if="showTokensFooter(pages, itemsPerPage)" />

          <data-iterator-footer
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :number-of-pages="pages"
            :per-page-label="t('table.footer.items')"
            :possible-items-per-page="POSSIBLE_ITEMS_PER_PAGE"
            @update:items-per-page="updateItemsPerPage"
          />
        </div>
      </template>
    </v-data-table>
  </v-card>
</template>

<script lang="ts" setup>
  // The token table with client-side sort and pagination, its loading and
  // empty states. The list itself is the shared `connect-ai.store` (legacy fetched it in the frame and again here).
  import type { McpToken } from '@/entities/mcp/mcp.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
  import MobileTableCard from '@/shared/ui/data-table/MobileTableCard.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import TableCustomSort from '@/shared/ui/data-table/TableCustomSort.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataApiTokensIllustration from '@/shared/ui/illustrations/NoDataApiTokensIllustration.vue'
  import LogsTableItemSkeletonMobile from '@/shared/ui/skeletons/LogsTableItemSkeletonMobile.vue'
  import LogsTableSkeletonItem from '@/shared/ui/skeletons/LogsTableSkeletonItem.vue'
  import { useConnectAiStore } from './connect-ai.store'
  import {
    DEFAULT_TOKENS_PER_PAGE,
    numberOfPages,
    POSSIBLE_ITEMS_PER_PAGE,
    showTokensFooter,
    sortTokens,
    TOKEN_HEADERS,
  } from './mcp-tokens-table'
  import McpTokensTableCell from './McpTokensTableCell.vue'

  const emit = defineEmits<{
    'token-revoke': [token: McpToken]
    'token-delete': [token: McpToken]
  }>()

  const { t } = useTranslation()
  const { lgAndDown, mobile } = useDisplay()
  const store = useConnectAiStore()

  const loading = computed(() => store.loading)

  // Legacy kept this list in the section, so every visit started with an empty table (no header, skeleton rows) until its own request
  // answered; the shared list may already hold the frame's answer.
  const fetched = ref(false)
  const listed = computed(() => (fetched.value ? store.tokens : []))

  // Legacy `options`: sorted by name, `must-sort`. Choosing another column keeps the direction (`toggleSort`).
  const sortKey = ref('name')
  const sortDesc = ref(false)
  const page = ref(1)
  const itemsPerPage = ref(DEFAULT_TOKENS_PER_PAGE)

  const items = computed(() => sortTokens(listed.value, sortKey.value, sortDesc.value))
  const pages = computed(() => numberOfPages(listed.value.length, itemsPerPage.value))

  // V4 `v-data-table` clamps its own page when a delete shrinks the list; the bound `page` (and so the footer) has to follow.
  watch(pages, count => {
    if (page.value > count) {
      page.value = Math.max(count, 1)
    }
  })

  // V2 headers `{ text, value }` become V4 columns `{ title, key }`.
  const v4Headers = TOKEN_HEADERS.map(header => ({ title: header.text, key: header.value, sortable: false }))

  function updateItemsPerPage (value: number | string): void {
    itemsPerPage.value = Number(value)
    page.value = 1
  }

  onMounted(async () => {
    await store.fetchTokens({ alertOnError: true })
    fetched.value = true
  })
</script>

<style lang="scss" scoped>
// The `.revoked-token-row` rule is 1:1 with legacy.
.revoked-token-row {
  opacity: 0.5;
}

// V2 `px-4` on the header cells; the kit's `TableCustomSort` renders no `px-4`, so the padding is set here. No `!important`: this
// selector is 0,4,2 and beats the shared `.custom-sort td` (0,1,1) and `td:first-child` (0,2,1) rules without it.
.v-data-table :deep(tr.custom-sort td.sort-item) {
  padding: 0 16px;

  // Measured on the lite host: the outer header cells keep the table's 24px edge padding (legacy `px-4` lost there).
  &:first-child {
    padding-left: 24px;
  }

  &:last-child {
    padding-right: 24px;
  }
}

// Legacy `px-4` is `!important` in V2; the global `.v-data-table table tr td { padding-right: 12px !important }` (_tables.scss) keeps the V4
// header cells at 12px on the right, 4px narrower per column, which moves every column. The missing 4px go on the item inside the cell,
// so no new `!important` is needed.
.v-data-table :deep(tr.custom-sort td.sort-item:not(:last-child) > .custom-sort__item) {
  padding-right: 4px;
}

// V2 `v-tooltip` renders a wrapper span around each activator, so the global `.actions-row .v-btn + .v-btn { margin-left: 10px }` never matched
// there (buttons sat flush); V4 puts the buttons side by side. V2 `small` icon buttons are 14px text (V4: 12px).
.data-table :deep(.actions-row) {
  .v-btn {
    font-size: 0.875rem;
  }

  .v-btn + .v-btn {
    margin-left: 0;
  }

  // V2 icons are 24px and inherit the button's `#333342` (global `legacy/_tables.scss` `.actions-row .v-btn`, the same in both themes);
  // V4 sizes the icon at 1.5em of the button text and the global `.v-icon` colour wins, so the icon takes `inherit` at this higher specificity.
  .v-icon {
    width: 24px;
    height: 24px;
    font-size: 24px;
    color: inherit;
  }
}
</style>
