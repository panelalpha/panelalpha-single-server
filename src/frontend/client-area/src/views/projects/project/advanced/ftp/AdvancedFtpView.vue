<template>
  <FtpView
    :service="service"
    variant="project"
  />
</template>

<script lang="ts" setup>
  // The frame of the FTP screen in the project Advanced tab. `service` comes from the
  // instance alone, without a request; the screen is the shared `FtpView` in the `project` variant.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { computed } from 'vue'
  import FtpView from '@/views/hosting/ftp/FtpView.vue'
  import { buildInstanceHostingService } from '@/views/projects/project/advanced/hosting-context/instance-hosting-context'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const service = computed(() => buildInstanceHostingService(props.instance))
</script>
