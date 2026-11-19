<template>
  <page-frame
    body-testid="billing-content"
    testid-prefix="billing"
    :title="t('heading.billing.title')"
  >
    <template
      v-if="items.length === 0 && !loading"
      #empty
    >
      <no-available-invoices-view />
    </template>

    <template #sidebar>
      <v-col
        class="sticky-sidebar"
        cols="12"
        lg="2"
      >
        <v-card
          class="billing-details-card"
          data-testid="billing-details"
          elevation="4"
        >
          <v-card-text>
            <v-row>
              <v-col>
                <!-- `text--darken2`, `text--gray-darken1` and `text--error-base` are V2 global colour classes kept 1:1 from legacy; they are not Vuetify 4 utilities. -->
                <p
                  class="p-d font-weight-bold text--darken2 mb-0"
                  data-testid="billing-details-title"
                >
                  {{ t('heading.billing.details.title') }}
                </p>

                <v-divider class="mt-2 mb-3" />

                <v-progress-linear
                  v-if="loading"
                  indeterminate
                />

                <!-- Quirk kept 1:1: `noBillingAccount` is set by a refetch that returns `data: null` (the first load with `null` shows the
                         empty view instead) and is never reset to `false`, so the card stays on this branch until the page reloads. -->
                <span
                  v-else-if="noBillingAccount"
                  data-testid="billing-no-account"
                >
                  <template v-if="hasTrialService">
                    {{ t('heading.billing.details.trialInfo') }}

                    <AppButton
                      v-if="upgradeUrl"
                      block
                      class="mt-2"
                      color="warning"
                      :href="upgradeUrl"
                      kind="primary"
                      size="small"
                      target="_blank"
                    >
                      <span class="text-white">{{ t('button.upgradeNow') }}</span>
                    </AppButton>
                  </template>

                  <template v-else>
                    {{ t('heading.billing.details.firstPaymentInfo') }}
                  </template>
                </span>

                <ul
                  v-else
                  class="text--gray-darken1"
                  data-testid="billing-details-list"
                >
                  <li class="font-weight-bold text--darken2">
                    {{ details?.companyname }}
                  </li>

                  <li>{{ details?.firstname }} {{ details?.lastname }}</li>

                  <li>{{ details?.address1 }}</li>

                  <li>{{ details?.postcode }} {{ details?.city }}</li>

                  <li>{{ details?.state }}</li>
                </ul>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </template>

    <PageTitle
      :title="t('heading.billing.invoice.title')"
      title-testid="billing-invoices-title"
    >
      <template #filters>
        <data-iterator-filter-controls
          data-testid="billing-search"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />
      </template>
    </PageTitle>

    <invoices-table
      data-testid="billing-table"
      :headers="headers"
      :items="items"
      :items-per-page="itemsPerPage"
      :loading="loading"
      :page="page"
      :possible-items-per-page="possibleItemsPerPage"
      :search-term="searchTerm"
      :sort-by="sortBy"
      :sort-desc="sortDesc"
      @clear-filters="clearFilters"
      @update:items-per-page="changePerPage"
      @update:page="changePage"
      @update:sort-by="changeSortBy"
      @update:sort-desc="changeSortDesc"
    />
  </page-frame>
</template>

<script lang="ts" setup>
  import type { BillingDetails, Invoice } from './billing.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import { getTrialService, trialUpgradeUrl } from '@/shared/session/trial-rules'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { getBilling } from './billing.api'
  import { invoicesHeaders } from './invoices-table'
  import InvoicesTable from './InvoicesTable.vue'
  import NoAvailableInvoicesView from './NoAvailableInvoicesView.vue'

  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const alerts = useAlertsStore()

  const details = ref<BillingDetails | null>(null)
  const items = ref<Invoice[]>([])
  const loading = ref(false)
  const noBillingAccount = ref(false)

  // The upgrade link only for a trial service.
  const hasTrialService = computed(() => Boolean(getTrialService(session.home?.user?.services)))
  const upgradeUrl = computed(() => trialUpgradeUrl(session.home?.user?.services))

  // A response of an older request is dropped, so it cannot overwrite the latest one (legacy has no guard; with one request in
  // flight the result is the same). The rows are never cleared: legacy keeps them on an error and on `data: null`.
  let loadSeq = 0
  async function loadDetails (): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    try {
      const data = await getBilling()
      if (seq !== loadSeq) {
        return
      }
      if (data === null) {
        noBillingAccount.value = true
        return
      }
      details.value = data
      items.value = data.invoices
    } catch (error) {
      if (seq === loadSeq) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (seq === loadSeq) {
        loading.value = false
      }
    }
  }

  const headers = computed(() => invoicesHeaders(t))

  // Default sort: the first header, descending. `isServerProvided` is true, so every page, per-page,
  // sort and search change refetches `GET /billing`, although the table sorts, searches and pages the loaded invoices itself.
  const {
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
    clearFilters,
  } = useDataIteratorPageState({
    load: loadDetails,
    possibleItemsPerPage: [[10, 20, 30]],
    sortBy: headers.value[0] ?? false,
    sortDesc: true,
  })

  // A disabled billing leaves for the list before any request (`router.push`, not `replace`).
  onMounted(() => {
    if (!session.home?.app?.billing_enabled) {
      void router.push(preferredSpaBase(session.home))
      return
    }
    void loadDetails()
  })
</script>

<style lang="scss" scoped>
// V2 progress bar inherits the text colour (light .87, dark white); V4 sets a 60 % on-surface colour on the bar.
.v-progress-linear {
  color: var(--v-text-default);
}

// Legacy card text 24px, `.row` -16px, plain `.col` 12px: the details sit 20px inside the card on every side.
// V4 `.v-row` / `.v-col` space by `gap` and their own margins, so the pair is restated.
.billing-details-card {
  :deep(.v-row) {
    --v-col-gap-x: 0px;
    --v-col-gap-y: 0px;
    margin: -16px;
    padding: 0;
  }

  :deep(.v-col) {
    padding: 12px;
  }

  // The card text keeps its 24px padding at the bottom as well (V4 drops it with the negative row margin below it).
  :deep(.v-card-text) {
    padding-bottom: 24px;
  }
}
</style>
