<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 16 17"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M8 15.02C11.866 15.02 15 11.886 15 8.01999C15 4.154 11.866 1.01999 8 1.01999C4.13401 1.01999 1 4.154 1 8.01999C1 11.886 4.13401 15.02 8 15.02Z" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M10.3327 6.85327L7.99935 4.51994L5.66602 6.85327" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M8 12.0578V5.68671" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
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
