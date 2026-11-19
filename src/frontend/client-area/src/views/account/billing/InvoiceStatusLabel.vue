<template>
  <StatusLabel
    class="text-capitalize"
    :class="textModifier"
    data-testid="billing-status-chip"
    :status="chipStatus"
    :value="status"
  />
</template>

<script lang="ts" setup>
  // The invoice status chip on the kit `StatusLabel`. `text-capitalize`: the API status is lower case. `invoice-status__text--*` stays as a hook (tests).
  import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
  import { computed } from 'vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  const props = defineProps<{
    status: string
  }>()

  const chipStatus = computed<StatusLabelStatus>(() => {
    if (props.status === 'paid') {
      return 'success'
    }
    return props.status === 'unpaid' ? 'error' : 'gray'
  })

  const textModifier = computed(() => {
    if (props.status === 'paid') {
      return 'invoice-status__text--paid'
    }
    return props.status === 'unpaid' ? 'invoice-status__text--unpaid' : 'invoice-status__text--other'
  })
</script>
