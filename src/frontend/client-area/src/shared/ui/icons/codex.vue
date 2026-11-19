<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 9L5 12L8 15"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M16 9L19 12L16 15"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M13 6L11 18"
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
