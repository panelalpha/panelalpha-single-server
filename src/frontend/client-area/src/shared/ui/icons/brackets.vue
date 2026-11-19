<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 3H6C4.89543 3 4 3.89543 4 5V9C4 10.1046 3.10457 11 2 11C3.10457 11 4 11.8954 4 13V17C4 18.1046 4.89543 19 6 19H8"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M16 3H18C19.1046 3 20 3.89543 20 5V9C20 10.1046 20.8954 11 22 11C20.8954 11 20 11.8954 20 13V17C20 18.1046 19.1046 19 18 19H16"
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
