<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 16 16"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="8" cy="8" r="6.5" :stroke="iconColor" />

    <path
      d="M10.5 6.28125L7.0625 9.71875L5.5 8.15625"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
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
