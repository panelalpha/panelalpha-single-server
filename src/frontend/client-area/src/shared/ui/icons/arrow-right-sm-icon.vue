<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 14 14"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M10 7L7 10M10 7L7 4M10 7L3 7" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
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
