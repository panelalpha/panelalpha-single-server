<template>
  <FileManagerView
    :service="service"
    variant="project"
  />
</template>

<script lang="ts" setup>
  // The frame of the file manager screen in the project Advanced tab. `service`
  // comes from the instance alone, without a request; the screen is the shared `FileManagerView` in the `project` variant.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { computed } from 'vue'
  import FileManagerView from '@/views/hosting/file-manager/FileManagerView.vue'
  import { buildInstanceHostingService } from '@/views/projects/project/advanced/hosting-context/instance-hosting-context'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const service = computed(() => buildInstanceHostingService(props.instance))
</script>
