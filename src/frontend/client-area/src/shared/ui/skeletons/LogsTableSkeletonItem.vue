<template>
  <table-skeleton-row
    :cols="cols"
    :rows="rows"
    variant="logs"
  />
</template>

<script lang="ts" setup>
  import TableSkeletonRow from './TableSkeletonRow.vue'

  // The styles are the `logs` variant of the pattern.
  withDefaults(defineProps<{
    rows?: number
    cols?: number
  }>(), {
    rows: 5,
    cols: 4,
  })
</script>
