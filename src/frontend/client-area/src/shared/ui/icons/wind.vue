<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 8H15.5C16.8807 8 18 6.88071 18 5.5C18 4.11929 16.8807 3 15.5 3C14.1193 3 13 4.11929 13 5.5"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M3 12H19.5C20.8807 12 22 13.1193 22 14.5C22 15.8807 20.8807 17 19.5 17C18.1193 17 17 15.8807 17 14.5"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M3 16H12.5C13.8807 16 15 17.1193 15 18.5C15 19.8807 13.8807 21 12.5 21C11.1193 21 10 19.8807 10 18.5"
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
