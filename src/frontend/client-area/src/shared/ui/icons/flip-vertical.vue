<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Line icon of the file manager media modals: flip vertical (24 px grid, 2 px round stroke, as `trash-line.vue`). -->
    <path
      d="M3 12h18"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M6 8 18 3v5z"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M6 16l12 5v-5z"
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
