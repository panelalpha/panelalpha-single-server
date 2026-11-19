<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 16 16"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8.49999 15.5C12.4651 15.5 15.5001 12.4651 15.5001 8.5C15.5001 4.53487 12.4651 1.5 8.49999 1.5C4.53487 1.5 1.50008 4.53487 1.50008 8.5C1.50008 12.4651 4.53487 15.5 8.49999 15.5Z"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <path d="M8.5 11.5V8.5" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M8.5 5.5H8.50625" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
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
