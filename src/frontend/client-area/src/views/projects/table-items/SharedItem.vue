<template>
  <div
    class="table-item item--shares"
    :class="main ? 'group-start' : ''"
  >
    <div class="item">
      <shares-label
        v-if="item.hasManageSharedAccessPrivilege()"
        :instance="item"
        :is-icon="isIcon"
        show-assign-text
        @open="emit('share', item)"
      />

      <div v-else>
        -
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The label only reports the click.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import SharesLabel from '@/entities/project/ui/SharesLabel.vue'

  defineProps<{
    item: InstanceResource
    main?: boolean
    isIcon?: boolean
  }>()

  const emit = defineEmits<{
    share: [instance: InstanceResource]
  }>()
</script>
