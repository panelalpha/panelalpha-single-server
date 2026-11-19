<template>
  <div
    class="table-item item--select"
    :class="main ? 'group-start' : ''"
  >
    <template v-if="main">
      <div class="item item--main">
        <checkbox
          :aria-label="ariaLabel"
          :model-value="checked"
          @update:model-value="emit('select-item', id)"
        />
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import Checkbox from '@/shared/ui/form/Checkbox.vue'

  defineProps<{
    main?: boolean
    checked?: boolean
    ariaLabel?: string
    id?: number | string
  }>()

  const emit = defineEmits<{
    'select-item': [id: number | string | undefined]
  }>()
</script>

<style lang="scss" scoped>
.table-item {
  margin-left: 8px !important;
  padding-right: 0px;
}

.v-application--is-rtl .table-item {
  margin-left: 0px !important;
  padding-right: 16px;
  margin-right: 8px;
}
</style>
