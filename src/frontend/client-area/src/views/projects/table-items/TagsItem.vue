<template>
  <div
    class="table-item item--tags"
    :class="main ? 'group-start' : ''"
  >
    <div
      ref="container"
      class="item item--main"
    >
      <instance-labels
        chips
        container-class="ml-0"
        :dots="dots"
        :filters-active="true"
        :instance="item"
        :instance-item="instanceItem"
        :labels="item.labels"
        :max-width="maxWidth"
        remaining-as-button
        @toggle-filter="emit('toggle-filter', $event)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { onMounted, ref } from 'vue'
  import InstanceLabels from '@/entities/label/ui/InstanceLabels.vue'

  defineProps<{
    item: InstanceResource
    main?: boolean
    dots?: boolean
    instanceItem?: boolean
  }>()

  const emit = defineEmits<{
    'toggle-filter': [item: { title: string, color?: string }]
  }>()

  const container = ref<HTMLElement | null>(null)
  const maxWidth = ref(0)

  onMounted(() => {
    maxWidth.value = container.value ? container.value.offsetWidth : 0
  })
</script>
