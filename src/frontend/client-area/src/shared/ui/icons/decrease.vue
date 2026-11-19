<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 12 12"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.98731 3C2.18567 3 1.71938 3.87844 2.18532 4.51085L5.19801 8.59988C5.59108 9.13337 6.40892 9.13337 6.80199 8.59988L9.81468 4.51085C10.2806 3.87844 9.81433 3 9.01269 3L2.98731 3Z"
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
