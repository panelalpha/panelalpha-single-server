<template>
  <!-- The pager counts the pages of the filtered rows (`footer-pages="page"`); a search without matches
       shows the no-results container with Clear filters (built into DataTable, `no-results-first`). -->
  <data-table
    :actions-sort="false"
    announce-sort
    :filter-keys="INVOICES_SEARCH_KEYS"
    footer-pages="page"
    footer-testid="billing-footer"
    :headers="headers"
    :item-slots="INVOICE_CELL_KEYS"
    :items="(items as unknown as Record<string, unknown>[])"
    :items-loading="loading"
    :items-per-page="itemsPerPage"
    no-results-first
    :page="page"
    :per-page-label="t('table.footer.invoice')"
    :possible-items-per-page="possibleItemsPerPage"
    :row-attrs="billingRowAttrs"
    :search-term="searchTerm"
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    :table-paging-events="false"
    @clear-filters="emit('clear-filters')"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <template
      v-for="key in INVOICE_CELL_KEYS"
      :key="key"
      #[`item.${key}`]="{ item }"
    >
      <invoices-table-cell
        :column="key"
        :invoice="asInvoice(item)"
      />
    </template>

    <template #mobile="{ item }">
      <MobileTableField
        v-for="header in headers.filter(header => header.value !== 'actions')"
        :key="header.value"
        :label="String(header.label ?? header.text)"
        :sortable="header.sortable"
        @sort="onFieldSort(header)"
      >
        <invoices-table-cell
          :column="header.value"
          :invoice="asInvoice(item)"
        />
      </MobileTableField>
    </template>

    <template #actions="{ row }">
      <!-- Quirk kept 1:1: one `payInvoiceUrlLoading` for the whole table, so every "Pay Now" button spins while any one request runs.
           Legacy `color=""` is not carried: V4 without a colour renders the same outlined button. -->
      <AppButton
        v-if="asInvoice(row).status == 'Unpaid'"
        class="px-2"
        data-testid="billing-pay-now"
        kind="secondary"
        :loading="payInvoiceUrlLoading"
        size="small"
        @click="getPayInvoiceUrl(asInvoice(row).id)"
      >
        <span class="font-weight-bold text--gray-darken1">{{ t('button.billing.pay_now') }}</span>
      </AppButton>

      <v-tooltip
        location="bottom"
        open-delay="150"
        transition="custom-tooltip"
      >
        <template #activator="{ props: activatorProps }">
          <!-- Accessible name added; legacy has none. -->
          <AppButton
            v-bind="activatorProps"
            :aria-label="t('Download')"
            class="btn-icon invoice-download px-2"
            data-testid="billing-download"
            kind="secondary"
            size="small"
            @click="downloadInvoice(asInvoice(row).id)"
          >
            <v-icon
              icon="$download"
              :size="16"
            />
          </AppButton>
        </template>

        <div>
          <p class="p-3 mb-0">
            {{ t('Download') }}
          </p>
        </div>
      </v-tooltip>
    </template>
  </data-table>
</template>

<script lang="ts" setup>
  import type { Invoice } from './billing.api'
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import { getInvoicePaymentUrl, invoiceDownloadUrl } from './billing.api'
  import { isValidPaymentUrl } from './invoice-actions'
  import { INVOICES_SEARCH_KEYS } from './invoices-table'
  import InvoicesTableCell from './InvoicesTableCell.vue'

  const props = defineProps<{
    items: Invoice[]
    loading: boolean
    headers: LegacySortHeader[]
    page: number
    itemsPerPage: number | string
    possibleItemsPerPage: Array<Array<number | string>>
    sortBy: LegacySortBy
    sortDesc: boolean
    searchTerm: string
  }>()

  const emit = defineEmits<{
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'clear-filters': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const INVOICE_CELL_KEYS = ['id', 'duedate', 'total', 'status']

  function billingRowAttrs (): Record<string, string> {
    return { 'data-testid': 'billing-row' }
  }

  function asInvoice (item: unknown): Invoice {
    return item as Invoice
  }

  // A card field sorts like the header of the desktop table (`TableCustomSort`): the same key flips the order, another key sorts by it.
  function onFieldSort (header: LegacySortHeader): void {
    const key = typeof props.sortBy === 'string' ? props.sortBy : (props.sortBy ? props.sortBy.value : undefined)
    if (key === header.value) {
      emit('update:sort-desc', !props.sortDesc)
    } else {
      emit('update:sort-by', header)
    }
  }

  const payInvoiceUrlLoading = ref(false)

  // A URL that is not http(s) throws into the same catch as a failed request, so both give the alert.
  async function getPayInvoiceUrl (id: Invoice['id']): Promise<void> {
    payInvoiceUrlLoading.value = true
    try {
      const url = await getInvoicePaymentUrl(id)
      if (!isValidPaymentUrl(url)) {
        throw new Error('Invalid payment URL')
      }
      window.open(String(url))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      payInvoiceUrlLoading.value = false
    }
  }

  // The browser loads the PDF in a new tab (no XHR).
  function downloadInvoice (id: Invoice['id']): void {
    window.open(invoiceDownloadUrl(id), '_blank')
  }
</script>

<style lang="scss">
// Legacy light theme: the focused Download button shows the 0.08 layer of its open tooltip (V2 activator, `aria-expanded` rule);
// V4 keeps 0.24 (dark is 0.24 in both). Unscoped: the overlay is a child of the button.
.v-theme--light .invoice-download:focus-visible > .v-btn__overlay {
  opacity: 0.08;
}
</style>
