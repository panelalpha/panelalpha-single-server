<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 16 16"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6.66667 2.66675H4V13.3334H6.66667V2.66675Z"
      :fill="iconColor"
    />

    <path
      d="M12 2.66675H9.33331V13.3334H12V2.66675Z"
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
