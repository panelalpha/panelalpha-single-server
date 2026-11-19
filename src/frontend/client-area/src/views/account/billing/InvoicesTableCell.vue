<template>
  <b v-if="column === 'id'">{{ invoice.number || invoice.id }}</b>

  <span v-else-if="column === 'duedate' && !isInvoiceOverdue(invoice)">
    {{ invoice.duedate }}
  </span>

  <div
    v-else-if="column === 'duedate'"
    class="d-flex align-center text--error-base"
    data-testid="billing-overdue"
  >
    <span class="mr-2">{{ invoice.duedate }}</span>

    <v-tooltip
      location="bottom"
      open-delay="150"
      transition="custom-tooltip"
      :viewport-margin="0"
    >
      <template #activator="{ props: activatorProps }">
        <!-- Accessible name added; legacy has none. -->
        <v-icon
          v-bind="activatorProps"
          aria-hidden="false"
          :aria-label="t('tooltip.billing.invoice.duedate.exceeded')"
          class="cursor-pointer"
          color="error"
          icon="$alertcircle"
          role="img"
          size="16"
        />
      </template>

      <div>
        <p class="p-3 mb-0">
          {{ t('tooltip.billing.invoice.duedate.exceeded') }}
        </p>
      </div>
    </v-tooltip>
  </div>

  <template v-else-if="column === 'total'">
    {{ invoice.total_formatted }}
  </template>

  <invoice-status-label
    v-else-if="column === 'status'"
    :status="invoice.status.toLowerCase()"
  />

  <span v-else>{{ field(column) }}</span>
</template>

<script lang="ts" setup>
  import type { Invoice } from './billing.api'
  // The cells of one invoice (desktop cell and mobile card field).
  import { useTranslation } from 'i18next-vue'
  import { isInvoiceOverdue } from './invoices-table'
  import InvoiceStatusLabel from './InvoiceStatusLabel.vue'

  const props = defineProps<{
    column: string
    invoice: Invoice
  }>()

  const { t } = useTranslation()

  function field (key: string): unknown {
    return (props.invoice as unknown as Record<string, unknown>)[key]
  }
</script>
