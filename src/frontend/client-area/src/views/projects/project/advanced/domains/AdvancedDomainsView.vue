<template>
  <DomainsView
    :instance-id="instance.id"
    :service="service"
    variant="project"
    @primary-domain-set="refreshInstance"
  />
</template>

<script lang="ts" setup>
  // The frame of the Domains screen in the project Advanced tab. `service` comes from the
  // instance alone, without a request; the screen is the shared `DomainsView` in the `project` variant.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { computed } from 'vue'
  import DomainsView from '@/views/hosting/domains/DomainsView.vue'
  import { buildInstanceHostingService } from '@/views/projects/project/advanced/hosting-context/instance-hosting-context'
  import { useInstanceStore } from '@/views/projects/project/instance.store'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const service = computed(() => buildInstanceHostingService(props.instance))

  const instanceStore = useInstanceStore()

  /** The switch changed the project's main domain on the server: the page's resource (its address) follows it now. */
  function refreshInstance (): void {
    // A failed refresh leaves the page as it was; the switch already reported its own result.
    instanceStore.refresh(props.instance.id).catch(() => undefined)
  }
</script>
