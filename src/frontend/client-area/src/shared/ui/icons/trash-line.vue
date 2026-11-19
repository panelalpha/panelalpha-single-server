<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Line icon of the container actions set (24 px grid, 2 px round stroke, as `restore.vue` and `file-text.vue`). -->
    <path
      d="M3 6H21"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M19 6V20C19 21.1046 18.1046 22 17 22H7C5.89543 22 5 21.1046 5 20V6M8 6V4C8 2.89543 8.89543 2 10 2H14C15.1046 2 16 2.89543 16 4V6"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M10 11V17"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M14 11V17"
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
