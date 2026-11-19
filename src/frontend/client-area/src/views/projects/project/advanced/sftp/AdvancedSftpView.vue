<template>
  <SftpView
    :service="service"
    variant="project"
  />
</template>

<script lang="ts" setup>
  // The frame of the SFTP screen in the project Advanced tab. `service` comes from the
  // instance alone, without a request; the screen is the shared `SftpView` in the `project` variant.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { computed } from 'vue'
  import SftpView from '@/views/hosting/sftp/SftpView.vue'
  import { buildInstanceHostingService } from '@/views/projects/project/advanced/hosting-context/instance-hosting-context'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const service = computed(() => buildInstanceHostingService(props.instance))
</script>
