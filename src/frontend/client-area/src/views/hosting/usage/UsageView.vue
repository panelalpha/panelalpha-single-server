<template>
  <div>
    <UsageCard />
    <GraphsCard />
  </div>
</template>

<script lang="ts" setup>
  // Single-server only; the frame passes `service`, the screen ignores it.
  // The title and the admin button live in the hosting frame head (`HostingView`).
  import type { HostingService } from '@/views/hosting/hosting.types'
  import GraphsCard from './GraphsCard.vue'
  import UsageCard from './UsageCard.vue'

  defineProps<{
    service?: HostingService
  }>()
</script>
