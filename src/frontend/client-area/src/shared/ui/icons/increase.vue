<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 12 12"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9.01269 9C9.81433 9 10.2806 8.12156 9.81468 7.48915L6.80199 3.40012C6.40892 2.86663 5.59108 2.86663 5.19801 3.40012L2.18532 7.48915C1.71938 8.12156 2.18567 9 2.98731 9H9.01269Z"
      :fill="iconColor"
    />
  </svg>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })
</script>
